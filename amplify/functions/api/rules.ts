/**
 * What LabLens accepts. Every rule lives here so it is easy to show and explain.
 *
 * FILE rules (checked before Textract runs, so a bad file costs nothing):
 *   - PNG, JPG/JPEG, PDF or TIFF, at most 10 MB
 *   - at most 50 reports per user
 *   - the file must be inside the caller's own folder: reports/<username>/...
 *
 * CONTENT rules (checked on Textract's output):
 *   - at least one table must be found
 *   - the table needs a header row with a test-name column and a result column
 *     (e.g. "Test | Result | Unit | Reference Range") and at least 3 numeric results
 *   - at least one result must have a printed reference range, otherwise nothing can be flagged
 * Reports that pass may still carry warnings (missing date, low confidence values...).
 */
import type { ExtractionResult } from './parser';

export const ALLOWED_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_REPORTS_PER_USER = 50;
export const MIN_TESTS = 3;
export const LOW_CONFIDENCE = 90;

export function extensionOf(fileName: string): string {
  return (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
}

/** "My Report (1).PDF" -> "My_Report_1_.PDF": safe for an S3 key, max 80 chars. */
export function safeFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[^\w.-]+/g, '_') // spaces, slashes, brackets -> _
    .replace(/\.{2,}/g, '.') // no ".." anywhere (it would fail the ownership check)
    .replace(/^[._]+/, '');
  return cleaned.slice(-80) || 'report';
}

/**
 * Ownership check: a user may only analyze files under their own prefix
 * ("reports/<username>/" for lab reports, "ids/<username>/" for ID cards).
 * The trailing "/" matters: user "ali" must not reach "reports/ali_2/...".
 */
export function isOwnedKey(fileKey: string, username: string, folder: 'reports' | 'ids' = 'reports'): boolean {
  return (
    fileKey.startsWith(`${folder}/${username}/`) &&
    !fileKey.includes('..') &&
    !fileKey.includes('//') &&
    fileKey.length <= 300
  );
}

export interface Assessment {
  ok: boolean;
  reason: string | null;
  warnings: string[];
}

/** Decides whether Textract's output looks like a lab report we can use. */
export function assessReport(result: ExtractionResult): Assessment {
  const { tests } = result;
  if (result.tables === 0) {
    return {
      ok: false,
      reason:
        'No table found. LabLens needs a printed results table (Test | Result | Unit | Reference range).',
      warnings: [],
    };
  }
  if (tests.length < MIN_TESTS) {
    return {
      ok: false,
      reason: `Found ${result.tables} table(s) but only ${tests.length} lab result(s). This does not look like a lab report: the table needs a test-name column and a numeric result column.`,
      warnings: [],
    };
  }
  if (!tests.some((t) => t.rangeLow !== null || t.rangeHigh !== null)) {
    return {
      ok: false,
      reason: 'No reference ranges were found, so no result can be flagged LOW / NORMAL / HIGH.',
      warnings: [],
    };
  }

  const warnings: string[] = [];
  if (!result.patientName) warnings.push('Patient name not found on the report.');
  if (!result.reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(result.reportDate))
    warnings.push('Report date not found; the upload date is used for trends.');
  const noRange = tests.filter((t) => t.flag === 'UNKNOWN').length;
  if (noRange) warnings.push(`${noRange} result(s) have no usable reference range.`);
  const lowConf = tests.filter((t) => (t.confidence ?? 100) < LOW_CONFIDENCE).length;
  if (lowConf)
    warnings.push(`${lowConf} value(s) were read with under ${LOW_CONFIDENCE}% confidence. Please double-check them.`);
  return { ok: true, reason: null, warnings };
}
