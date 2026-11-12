/**
 * Checks the demo profiles: every seeded report is rebuilt with our real rules
 * (parseRange, computeFlag, assessReport) and must tell the intended story.
 * Run: npm run test:demo
 */
import assert from 'node:assert/strict';
import { DEMO_ACCOUNTS, buildDemoReport } from './demo';
import { validateProfile } from './profile-rules';

const expected: Record<string, [status: string, tests: number, outOfRange: number, date: string]> = {
  'rana-1-feb-2026-diabetes-lipids.png': ['DONE', 6, 6, '2026-02-14'],
  'rana-2-may-2026-followup-photo.jpg': ['DONE', 6, 5, '2026-05-20'],
  'rana-3-sep-2026-annual-checkup.pdf': ['DONE', 16, 1, '2026-09-02'],
  'ali-1-jan-2026-bone-profile.png': ['DONE', 7, 2, '2026-01-11'],
  'ali-2-apr-2026-old-scan.jpg': ['DONE', 4, 1, '2026-04-19'],
  'ali-3-aug-2026-recovery.png': ['DONE', 6, 0, '2026-08-06'],
  'ali-4-pharmacy-receipt.png': ['FAILED', 0, 0, '2026-08-07'],
  'hayyan-1-mar-2026-routine.png': ['DONE', 9, 0, '2026-03-09'],
  'hayyan-2-sep-2026-annual.pdf': ['DONE', 11, 0, '2026-09-21'],
  'ammar-1-feb-2026-thyroid.png': ['DONE', 8, 4, '2026-02-03'],
  'ammar-2-may-2026-photo.jpg': ['DONE', 6, 3, '2026-05-12'],
  'ammar-3-oct-2026-controlled.png': ['DONE', 6, 1, '2026-10-14'],
};

const all = Object.values(DEMO_ACCOUNTS).flatMap((a) => a.files);
assert.deepEqual([...all].sort(), Object.keys(expected).sort(), 'every demo file has an expectation');

for (const [file, [status, tests, abnormal, date]] of Object.entries(expected)) {
  const r = buildDemoReport('demo_x', file);
  assert.equal(r.status, status, `${file} status`);
  assert.equal(r.testCount, tests, `${file} test count`);
  assert.equal(r.abnormalCount, abnormal, `${file} out of range`);
  assert.equal(r.reportDate, date, `${file} date`);
  assert.equal(r.demo, true);
  assert.ok(r.fileKey.startsWith('demo/'));
  assert.ok(/^[\w-]{1,64}$/.test(r.reportId), `${file} report id is URL-safe`);
  if (status === 'DONE' && !file.endsWith('.pdf')) assert.ok(r.tests.every((t) => t.box && t.box.width > 0.3), `${file} boxes`);
}

// the pharmacy receipt is rejected by the real acceptance rules
assert.match(buildDemoReport('demo_x', 'ali-4-pharmacy-receipt.png').errorMessage ?? '', /does not look like a lab report/);

const series = (key: string, test: string) =>
  DEMO_ACCOUNTS[key].files
    .map((f) => buildDemoReport('x', f))
    .filter((r) => r.status === 'DONE')
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
    .flatMap((r) => r.tests.filter((t) => t.testName === test).map((t) => `${t.value}:${t.flag}`));

assert.deepEqual(series('rana', 'HbA1c'), ['6.3:HIGH', '6:HIGH', '5.6:NORMAL'], 'Rana: prediabetes improving');
assert.deepEqual(series('ali', 'Vitamin D (25-OH)'), ['11:LOW', '19:LOW', '34:NORMAL'], 'Ali: vitamin D recovered');
assert.deepEqual(series('ammar', 'TSH'), ['8.9:HIGH', '5.6:HIGH', '2.8:NORMAL'], 'Ammar: thyroid controlled');
assert.ok(
  DEMO_ACCOUNTS.hayyan.files.every((f) => buildDemoReport('x', f).abnormalCount === 0),
  'Hayyan: healthy, everything in range',
);

for (const a of Object.values(DEMO_ACCOUNTS)) {
  assert.ok(a.username.startsWith('demo_'));
  assert.deepEqual(validateProfile({ ...a.profile }), a.profile, `${a.username} profile is valid`);
}
assert.equal(DEMO_ACCOUNTS.ammar.profile.heightCm, 170, "Ammar is 5'7\"");

console.log('All demo tests passed.');
