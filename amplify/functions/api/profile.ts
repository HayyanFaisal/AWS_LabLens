/**
 * /profile routes: read and save the health profile, and the ID card scan.
 *
 * ID card flow (same pattern as reports):
 *   1. POST /profile/id-upload-url -> presigned PUT under ids/<username>/
 *   2. browser PUTs the photo straight to S3
 *   3. POST /profile/scan-id       -> Textract QUERIES reads name, date of
 *      birth, sex and ID number; the photo is deleted immediately afterwards
 */
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, env, s3 } from './aws';
import { HttpError, str } from './http';
import { ID_QUERIES, parseIdCard } from './idcard';
import { validateProfile } from './profile-rules';
import { extensionOf, isOwnedKey } from './rules';
import { analyzeQueries, friendlyTextractError } from './textract';

const ID_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const MAX_ID_BYTES = 5 * 1024 * 1024;

// ---------- GET /profile ----------
export async function getProfile(username: string) {
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: env.usersTable(),
      Key: { username },
      ProjectionExpression: '#u, #c, #p, #d',
      ExpressionAttributeNames: { '#u': 'username', '#c': 'createdAt', '#p': 'profile', '#d': 'demo' },
    }),
  );
  if (!Item) throw new HttpError(401, 'Please sign in again');
  return { username, createdAt: Item.createdAt ?? null, profile: Item.profile ?? null, demo: Item.demo === true };
}

// ---------- PUT /profile ----------
export async function saveProfile(username: string, body: Record<string, unknown>) {
  const profile = validateProfile(body);
  const now = new Date().toISOString();
  // completedAt is set on the first save only; updatedAt changes every time
  const { profile: existing } = await getProfile(username);
  const item = { ...profile, completedAt: existing?.completedAt ?? now, updatedAt: now };
  await ddb.send(
    new UpdateCommand({
      TableName: env.usersTable(),
      Key: { username },
      UpdateExpression: 'SET #p = :p',
      ConditionExpression: 'attribute_exists(username)',
      ExpressionAttributeNames: { '#p': 'profile' },
      ExpressionAttributeValues: { ':p': item },
    }),
  ).catch((err) => {
    if (err?.name === 'ConditionalCheckFailedException') throw new HttpError(401, 'Please sign in again');
    throw err;
  });
  console.log('Saved profile');
  return { username, profile: item };
}

// ---------- POST /profile/id-upload-url ----------
export async function createIdUploadUrl(username: string, body: Record<string, unknown>) {
  const fileName = str(body, 'fileName', 200);
  const ext = extensionOf(fileName);
  const contentType = ID_TYPES[ext];
  if (!contentType) throw new HttpError(400, 'Please use a PNG or JPG photo of the ID card');
  if (typeof body.size === 'number' && body.size > MAX_ID_BYTES)
    throw new HttpError(400, 'The photo is larger than 5 MB');

  const fileKey = `ids/${username}/${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.bucket(), Key: fileKey, ContentType: contentType }),
    { expiresIn: 300 },
  );
  return { uploadUrl, fileKey, contentType };
}

// ---------- POST /profile/scan-id ----------
export async function scanIdCard(username: string, body: Record<string, unknown>) {
  const fileKey = str(body, 'fileKey', 300);
  if (!isOwnedKey(fileKey, username, 'ids')) throw new HttpError(403, 'You can only scan your own files');
  const bucket = env.bucket();

  try {
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: fileKey }));
      if ((head.ContentLength ?? 0) > MAX_ID_BYTES) throw new HttpError(400, 'The photo is larger than 5 MB');
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, 'Uploaded photo not found. Please upload it again.');
    }

    const t0 = Date.now();
    let blocks;
    try {
      blocks = await analyzeQueries(bucket, fileKey, ID_QUERIES);
    } catch (err) {
      console.error('Textract failed:', (err as Error).name);
      throw new HttpError(502, friendlyTextractError(err));
    }
    const textractMs = Date.now() - t0;
    // Only counts and timings are logged, never the personal data itself
    console.log(`ID scan: Textract returned ${blocks.length} blocks in ${textractMs} ms`);

    const scan = parseIdCard(blocks);
    if (!scan.fullName && !scan.dateOfBirth)
      throw new HttpError(422, 'Could not read a name or date of birth. Try a sharper, well-lit photo of the front of the card.');
    return { ...scan, textractMs, blockCount: blocks.length };
  } finally {
    // Privacy: the ID photo is never kept
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileKey })).catch(() => undefined);
  }
}
