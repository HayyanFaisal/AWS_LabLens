/**
 * Checks the demo profiles: every seeded report is rebuilt with our real rules
 * and must give the results listed in samples/README.md.
 * Run: npm run test:demo
 */
import assert from 'node:assert/strict';
import { DEMO_ACCOUNTS, buildDemoReport } from './demo';
import { validateProfile } from './profile-rules';

const expected: Record<string, [status: string, tests: number, outOfRange: number, date: string]> = {
  'report-1-mar-2026.png': ['DONE', 12, 10, '2026-03-14'],
  'report-2-jun-2026.jpg': ['DONE', 12, 7, '2026-06-16'],
  'report-3-sep-2026.pdf': ['DONE', 12, 2, '2026-09-18'],
  'report-4-nov-2026-thyroid.png': ['DONE', 10, 3, '2026-11-05'],
  'report-5-dec-2025-old-scan.jpg': ['DONE', 12, 10, '2025-12-10'],
  'report-6-oct-2026-liver.pdf': ['DONE', 8, 1, '2026-10-22'],
  'report-7-sara-khan-mar-2026.png': ['DONE', 8, 6, '2026-03-08'],
  'not-a-lab-report-invoice.png': ['FAILED', 0, 0, '2026-11-02'],
};

for (const [file, [status, tests, abnormal, date]] of Object.entries(expected)) {
  const r = buildDemoReport('demo_x', file);
  assert.equal(r.status, status, `${file} status`);
  assert.equal(r.testCount, tests, `${file} test count`);
  assert.equal(r.abnormalCount, abnormal, `${file} out of range`);
  assert.equal(r.reportDate, date, `${file} date`);
  assert.equal(r.demo, true);
  assert.ok(r.fileKey.startsWith('demo/'));
  assert.ok(/^[\w-]{1,64}$/.test(r.reportId), `${file} report id is URL-safe`);
}

// the invoice is rejected by the real acceptance rules
assert.match(buildDemoReport('demo_x', 'not-a-lab-report-invoice.png').errorMessage ?? '', /does not look like a lab report/);

// every image report has a box for every test (for the Textract-style overlay)
for (const file of ['report-1-mar-2026.png', 'report-2-jun-2026.jpg', 'report-4-nov-2026-thyroid.png']) {
  assert.ok(buildDemoReport('demo_x', file).tests.every((t) => t.box && t.box.width > 0.3));
}

// Ali's HbA1c story across five reports: 7.6 -> 7.1 -> 6.4 -> 5.8 -> 5.6
const hba1c = DEMO_ACCOUNTS.ali.files
  .map((f) => buildDemoReport('demo_ali', f))
  .filter((r) => r.status === 'DONE')
  .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
  .flatMap((r) => r.tests.filter((t) => t.testName === 'HbA1c').map((t) => t.value));
assert.deepEqual(hba1c, [7.6, 7.1, 6.4, 5.8, 5.6]);

// Sara's ferritin recovers: LOW, LOW (19 >= 15 is normal), NORMAL
const ferritin = DEMO_ACCOUNTS.sara.files.map((f) => buildDemoReport('demo_sara', f).tests.find((t) => t.testName === 'Serum Ferritin')!);
assert.deepEqual(ferritin.map((t) => t.value), [8, 19, 34]);
assert.deepEqual(ferritin.map((t) => t.flag), ['LOW', 'NORMAL', 'NORMAL']);

// demo profiles pass the same validation as real ones
for (const a of Object.values(DEMO_ACCOUNTS)) {
  assert.ok(a.username.startsWith('demo_'));
  assert.deepEqual(validateProfile({ ...a.profile }), a.profile);
}

console.log('All demo tests passed.');
