/**
 * Offline tests for our security code and acceptance rules (no AWS needed).
 * Run: npm run test:api
 */
import assert from 'node:assert/strict';
import {
  TOKEN_TTL_SECONDS,
  credentialProblem,
  hashPassword,
  signToken,
  verifyPassword,
  verifyToken,
} from './auth';
import { assessReport, extensionOf, isOwnedKey, safeFileName } from './rules';
import type { ExtractedTest, ExtractionResult } from './parser';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

// ---- passwords ----
{
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  assert.notEqual(a.salt, b.salt, 'each user gets a random salt');
  assert.notEqual(a.passwordHash, b.passwordHash, 'same password -> different hash');
  assert.ok(!a.passwordHash.includes('correct'), 'hash must not contain the password');
  assert.equal(await verifyPassword('correct horse battery', a.salt, a.passwordHash), true);
  assert.equal(await verifyPassword('wrong password!!', a.salt, a.passwordHash), false);
  assert.equal(await verifyPassword('correct horse battery', b.salt, a.passwordHash), false, 'wrong salt');
}

// ---- credential rules ----
assert.equal(credentialProblem('hayyan_23', 'longenough'), null);
assert.ok(credentialProblem('ab', 'longenough'), 'username too short');
assert.ok(credentialProblem('Hayyan', 'longenough'), 'uppercase not allowed');
assert.ok(credentialProblem('ali sajjad', 'longenough'), 'spaces not allowed');
assert.ok(credentialProblem('a'.repeat(31), 'longenough'), 'username too long');
assert.ok(credentialProblem('hayyan', 'short'), 'password too short');

// ---- tokens ----
{
  const now = Date.UTC(2026, 10, 13, 10, 0, 0);
  const token = signToken('hayyan', SECRET, now);
  assert.equal(token.split('.').length, 3, 'header.payload.signature');
  assert.equal(verifyToken(token, SECRET, now), 'hayyan');
  assert.equal(verifyToken(token, SECRET, now + (TOKEN_TTL_SECONDS - 60) * 1000), 'hayyan', 'still valid');
  assert.equal(verifyToken(token, SECRET, now + TOKEN_TTL_SECONDS * 1000), null, 'expired after 12h');
  assert.equal(verifyToken(token, 'another-secret-that-is-also-32-chars-long', now), null, 'wrong secret');

  // Tampering: change the username inside the payload but keep the old signature
  const [h, p, s] = token.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'ali' })).toString('base64url');
  assert.equal(verifyToken(`${h}.${forged}.${s}`, SECRET, now), null, 'forged payload rejected');
  assert.equal(verifyToken(`${h}.${p}.${s.slice(0, -2)}`, SECRET, now), null, 'cut signature rejected');
  assert.equal(verifyToken('not-a-token', SECRET, now), null);
  assert.equal(verifyToken('', SECRET, now), null);
}

// ---- ownership check ----
assert.equal(isOwnedKey('reports/hayyan/abc-report.png', 'hayyan'), true);
assert.equal(isOwnedKey('reports/ali/abc-report.png', 'hayyan'), false, "someone else's file");
assert.equal(isOwnedKey('reports/hayyan_2/abc.png', 'hayyan'), false, 'prefix trick');
assert.equal(isOwnedKey('reports/hayyan/../ali/abc.png', 'hayyan'), false, 'path traversal');
assert.equal(isOwnedKey('reports/hayyan//abc.png', 'hayyan'), false);
assert.equal(isOwnedKey('other/hayyan/abc.png', 'hayyan'), false);

// ---- file names ----
assert.equal(extensionOf('Report.JPEG'), 'jpeg');
assert.equal(extensionOf('noext'), '');
assert.equal(safeFileName('My Report (1).pdf'), 'My_Report_1_.pdf');
assert.equal(safeFileName('../../etc/passwd'), 'etc_passwd');

// ---- acceptance rules ----
const test = (over: Partial<ExtractedTest> = {}): ExtractedTest => ({
  testName: 'Hemoglobin', value: 12, rawValue: '12', unit: 'g/dL', rangeText: '13 - 17',
  rangeLow: 13, rangeHigh: 17, flag: 'LOW', confidence: 99, page: 1, ...over,
});
const result = (over: Partial<ExtractionResult> = {}): ExtractionResult => ({
  patientName: 'Ali Raza', labName: 'Demo Lab', reportDate: '2026-03-14', pages: 1, mode: 'sync',
  tables: 2, queryAnswers: [], tests: [test(), test(), test()], ...over,
});

assert.deepEqual(assessReport(result()), { ok: true, reason: null, warnings: [] });
assert.equal(assessReport(result({ tables: 0, tests: [] })).ok, false, 'no tables -> rejected');
assert.match(assessReport(result({ tests: [test()] })).reason ?? '', /does not look like a lab report/);
assert.equal(
  assessReport(result({ tests: [1, 2, 3].map(() => test({ rangeLow: null, rangeHigh: null, flag: 'UNKNOWN' })) })).ok,
  false,
  'no ranges at all -> rejected',
);
{
  const r = assessReport(
    result({ patientName: null, reportDate: null, tests: [test(), test({ confidence: 70 }), test({ rangeLow: null, rangeHigh: null, flag: 'UNKNOWN' })] }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 4, 'name, date, range, confidence warnings');
}

console.log('All API tests passed.');
