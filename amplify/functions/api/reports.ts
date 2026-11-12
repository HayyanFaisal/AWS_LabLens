/** /reports routes: presigned upload, analyze with Textract, list, get, file link, delete. */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, env, s3 } from './aws';
import { HttpError, str } from './http';
import { parseTextract, type ExtractionResult } from './parser';
import {
  ALLOWED_TYPES,
  MAX_FILE_BYTES,
  MAX_REPORTS_PER_USER,
  assessReport,
  extensionOf,
  isOwnedKey,
  safeFileName,
} from './rules';
import { analyzeAsync, analyzeSync, friendlyTextractError } from './textract';

const UPLOAD_URL_SECONDS = 5 * 60;
const FILE_URL_SECONDS = 15 * 60;

/** Fields returned by GET /reports (the list view does not need every test). */
const SUMMARY_FIELDS = [
  'reportId', 'fileName', 'patientName', 'labName', 'reportDate', 'pages', 'mode',
  'status', 'errorMessage', 'testCount', 'abnormalCount', 'createdAt', 'demo',
];
// Several of these ("status", "mode", ...) are DynamoDB reserved words, so every
// field goes through a placeholder: ProjectionExpression "#f0, #f1, ..."
const SUMMARY_PROJECTION = SUMMARY_FIELDS.map((_, i) => `#f${i}`).join(', ');
const SUMMARY_NAMES = Object.fromEntries(SUMMARY_FIELDS.map((f, i) => [`#f${i}`, f]));

/** Time-ordered, URL-safe id, e.g. "20261113T101530123-a1b2c3". */
const newReportId = () =>
  `${new Date().toISOString().replace(/[-:.Z]/g, '')}-${randomBytes(3).toString('hex')}`;

function checkReportId(id: string) {
  if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(400, 'Invalid report id');
}

async function countReports(username: string): Promise<number> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.reportsTable(),
      KeyConditionExpression: 'username = :u',
      ExpressionAttributeValues: { ':u': username },
      Select: 'COUNT',
    }),
  );
  return res.Count ?? 0;
}

// ---------- POST /reports/upload-url ----------
export async function createUploadUrl(username: string, body: Record<string, unknown>) {
  const fileName = str(body, 'fileName', 200);
  const ext = extensionOf(fileName);
  const contentType = ALLOWED_TYPES[ext];
  if (!contentType) throw new HttpError(400, 'Only PNG, JPG, PDF or TIFF files are accepted');
  if (typeof body.size === 'number' && body.size > MAX_FILE_BYTES)
    throw new HttpError(400, 'File is larger than 10 MB');
  if ((await countReports(username)) >= MAX_REPORTS_PER_USER)
    throw new HttpError(400, `You can store up to ${MAX_REPORTS_PER_USER} reports. Delete some first.`);

  // The key always starts with the caller's own folder
  const fileKey = `reports/${username}/${randomUUID()}-${safeFileName(fileName)}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.bucket(), Key: fileKey, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_SECONDS },
  );
  return { uploadUrl, fileKey, contentType, expiresIn: UPLOAD_URL_SECONDS };
}

// ---------- POST /reports/analyze ----------
export async function analyzeReport(username: string, body: Record<string, unknown>) {
  const fileKey = str(body, 'fileKey', 300);
  const fileName = typeof body.fileName === 'string' ? body.fileName.slice(0, 200) : fileKey.split('/').pop()!;

  // Ownership check: you can only analyze files in YOUR folder
  if (!isOwnedKey(fileKey, username)) throw new HttpError(403, 'You can only analyze your own files');
  const ext = extensionOf(fileKey);
  if (!ALLOWED_TYPES[ext]) throw new HttpError(400, 'Only PNG, JPG, PDF or TIFF files are accepted');

  // The file must really be in S3 and within the size limit
  const bucket = env.bucket();
  let size = 0;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: fileKey }));
    size = head.ContentLength ?? 0;
  } catch {
    throw new HttpError(400, 'Uploaded file not found. Please upload it again.');
  }
  if (size > MAX_FILE_BYTES) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileKey }));
    throw new HttpError(400, 'File is larger than 10 MB');
  }
  if (size === 0) throw new HttpError(400, 'The uploaded file is empty');

  const isPdf = ext === 'pdf';
  const mode = isPdf ? 'async' : 'sync';
  const createdAt = new Date().toISOString();
  const base = { username, reportId: newReportId(), fileKey, fileName, mode, createdAt, sizeBytes: size };

  // 1) Textract
  let result: ExtractionResult;
  let blockCount = 0;
  const t0 = Date.now();
  try {
    const blocks = isPdf ? await analyzeAsync(bucket, fileKey) : await analyzeSync(bucket, fileKey);
    blockCount = blocks.length;
    console.log(`Textract returned ${blocks.length} blocks in ${Date.now() - t0} ms`);
    result = parseTextract(blocks, mode);
  } catch (err) {
    console.error('Textract failed:', (err as Error).name, (err as Error).message);
    const failed = {
      ...base, status: 'FAILED', errorMessage: friendlyTextractError(err), textractMs: Date.now() - t0,
      reportDate: createdAt.slice(0, 10), testCount: 0, abnormalCount: 0,
    };
    await save(failed);
    return failed;
  }
  const textractMs = Date.now() - t0;

  // 2) Our acceptance rules + LOW/NORMAL/HIGH counts
  const verdict = assessReport(result);
  const abnormalCount = result.tests.filter((t) => t.flag === 'LOW' || t.flag === 'HIGH').length;
  const reportDate =
    result.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(result.reportDate)
      ? result.reportDate
      : createdAt.slice(0, 10);

  const item = {
    ...base,
    status: verdict.ok ? 'DONE' : 'FAILED',
    errorMessage: verdict.reason ?? undefined,
    warnings: verdict.warnings,
    patientName: result.patientName,
    labName: result.labName,
    reportDate,
    pages: result.pages,
    tables: result.tables,
    blockCount,
    textractMs,
    testCount: result.tests.length,
    abnormalCount,
    queryAnswers: result.queryAnswers,
    tests: verdict.ok ? result.tests : [],
  };

  // 3) Save to DynamoDB (one item per report, tests included)
  const t1 = Date.now();
  await save(item);
  console.log(`Saved report ${item.reportId}: ${item.status}, ${item.testCount} tests, ${abnormalCount} out of range`);
  return { ...item, saveMs: Date.now() - t1 };
}

async function save(item: Record<string, unknown>) {
  await ddb.send(new PutCommand({ TableName: env.reportsTable(), Item: item }));
}

// ---------- GET /reports ----------
export async function listReports(username: string) {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: env.reportsTable(),
        KeyConditionExpression: 'username = :u',
        ExpressionAttributeValues: { ':u': username },
        ProjectionExpression: SUMMARY_PROJECTION,
        ExpressionAttributeNames: SUMMARY_NAMES,
        ScanIndexForward: false, // newest first
        ExclusiveStartKey,
      }),
    );
    items.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return { reports: items };
}

// ---------- GET /reports/{id} ----------
export async function getReport(username: string, reportId: string) {
  checkReportId(reportId);
  const { Item } = await ddb.send(
    new GetCommand({ TableName: env.reportsTable(), Key: { username, reportId } }),
  );
  if (!Item) throw new HttpError(404, 'Report not found');
  return Item;
}

// ---------- GET /reports/{id}/file-url ----------
export async function getFileUrl(username: string, reportId: string) {
  const report = await getReport(username, reportId);
  // Demo reports point at sample files shipped with the website (public/demo/)
  if (report.demo && typeof report.fileKey === 'string' && report.fileKey.startsWith('demo/'))
    return { url: `/${report.fileKey}`, expiresIn: null };
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.bucket(), Key: report.fileKey }),
    { expiresIn: FILE_URL_SECONDS },
  );
  return { url, expiresIn: FILE_URL_SECONDS };
}

// ---------- DELETE /reports/{id} ----------
export async function deleteReport(username: string, reportId: string) {
  const report = await getReport(username, reportId);
  if (!report.demo) await s3.send(new DeleteObjectCommand({ Bucket: env.bucket(), Key: report.fileKey }));
  await ddb.send(new DeleteCommand({ TableName: env.reportsTable(), Key: { username, reportId } }));
  return { deleted: reportId };
}
