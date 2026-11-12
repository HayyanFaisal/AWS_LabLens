/**
 * Demo profiles for the login screen ("Explore a demo profile").
 *
 * POST /auth/demo {profile: "ali" | "sara"} (re)creates a fully filled demo
 * account and returns a normal signed token for it:
 *   - a health profile, as if it was filled from the (fictional) ID card
 *   - every sample report, rebuilt from demo-seed.json with OUR OWN rules:
 *     parseNumber / parseRange / computeFlag / assessReport, exactly as
 *     analyzeReport() does after Textract. Only the Textract call is skipped,
 *     so these reports are marked demo: true and carry no confidence scores.
 * Each demo sign-in resets the profile and the sample reports, so visitors
 * cannot break the demo. Demo accounts have a random, unknown password, and
 * nobody can register a "demo_" username.
 */
import { randomBytes } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { hashPassword, signToken } from './auth';
import { ddb, env } from './aws';
import seedJson from './demo-seed.json';
import { HttpError } from './http';
import {
  QUERIES,
  computeFlag,
  normalizeDate,
  parseNumber,
  parseRange,
  type Box,
  type ExtractedTest,
  type ExtractionResult,
} from './parser';
import type { Profile } from './profile-rules';
import { assessReport } from './rules';

interface SeedRow {
  testName: string;
  rawValue: string;
  unit: string | null;
  rangeText: string | null;
  labFlag: string | null;
  page: number | null;
  box: Box | null;
}
interface SeedDoc {
  lab: string | null;
  patient: string | null;
  date: string;
  collected: string | null;
  pages: number;
  mode: 'sync' | 'async';
  tables: number;
  rows: SeedRow[];
}
const SEED = seedJson as Record<string, SeedDoc>;

export const DEMO_PREFIX = 'demo_';

interface DemoAccount {
  username: string;
  profile: Profile;
  files: string[];
}

export const DEMO_ACCOUNTS: Record<string, DemoAccount> = {
  ali: {
    username: 'demo_ali',
    profile: {
      fullName: 'Ali Raza', dateOfBirth: '1990-05-20', sex: 'male', phone: null, bloodGroup: 'B+',
      heightCm: 175, weightKg: 82, conditions: ['Type 2 diabetes', 'High cholesterol'],
      medications: ['Metformin 500 mg', 'Atorvastatin 10 mg'], allergies: ['Penicillin'],
      idLast4: '5671', filledFromId: true,
    },
    files: [
      'report-5-dec-2025-old-scan.jpg',
      'report-1-mar-2026.png',
      'report-2-jun-2026.jpg',
      'report-3-sep-2026.pdf',
      'report-6-oct-2026-liver.pdf',
      'report-4-nov-2026-thyroid.png',
      'not-a-lab-report-invoice.png',
    ],
  },
  sara: {
    username: 'demo_sara',
    profile: {
      fullName: 'Sara Khan', dateOfBirth: '1999-08-14', sex: 'female', phone: null, bloodGroup: 'O+',
      heightCm: 162, weightKg: 54, conditions: ['Iron-deficiency anaemia'],
      medications: ['Iron supplement', 'Vitamin D 1000 IU'], allergies: [],
      idLast4: '3218', filledFromId: true,
    },
    files: ['report-7-sara-khan-mar-2026.png', 'report-8-sara-khan-jun-2026.png', 'report-9-sara-khan-sep-2026.png'],
  },
};

/** Turns one seed document into the same report item analyzeReport() would save. */
export function buildDemoReport(username: string, file: string) {
  const s = SEED[file];
  if (!s) throw new Error(`No demo seed for ${file}`);

  const tests: ExtractedTest[] = s.rows.flatMap((r) => {
    const value = parseNumber(r.rawValue);
    if (value === null) return []; // qualitative rows are skipped, as in the parser
    const { low, high } = parseRange(r.rangeText);
    return [{
      testName: r.testName, value, rawValue: r.rawValue, unit: r.unit, rangeText: r.rangeText,
      rangeLow: low, rangeHigh: high, flag: computeFlag(value, low, high, r.labFlag),
      confidence: null, page: r.page, box: r.box,
    }];
  });

  const answers: Record<string, string | null> = {
    PATIENT_NAME: s.patient, REPORT_DATE: s.date, COLLECTION_DATE: s.collected, LAB_NAME: s.lab,
  };
  const result: ExtractionResult = {
    patientName: s.patient,
    labName: s.lab,
    reportDate: normalizeDate(s.date),
    pages: s.pages,
    mode: s.mode,
    tables: s.tables,
    queryAnswers: QUERIES.map((q) => ({ question: q.text, answer: answers[q.alias] ?? null, confidence: null })),
    tests,
  };

  const verdict = assessReport(result);
  const reportDate = result.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(result.reportDate) ? result.reportDate : '2026-11-01';
  const stem = file.replace(/\.[a-z]+$/i, '');
  return {
    username,
    reportId: `${reportDate.replace(/-/g, '')}-demo-${stem}`.slice(0, 64),
    fileKey: `demo/${file}`, // served by the website itself (public/demo/), not S3
    fileName: file,
    mode: s.mode,
    createdAt: `${reportDate}T10:00:00.000Z`,
    demo: true,
    status: verdict.ok ? 'DONE' : 'FAILED',
    errorMessage: verdict.reason ?? undefined,
    warnings: verdict.warnings,
    patientName: result.patientName,
    labName: result.labName,
    reportDate,
    pages: result.pages,
    tables: result.tables,
    testCount: tests.length,
    abnormalCount: tests.filter((t) => t.flag === 'LOW' || t.flag === 'HIGH').length,
    queryAnswers: result.queryAnswers,
    tests: verdict.ok ? tests : [],
  };
}

// ---------- POST /auth/demo ----------
export async function demoLogin(body: Record<string, unknown>) {
  const key = typeof body.profile === 'string' ? body.profile : '';
  const account = DEMO_ACCOUNTS[key];
  if (!account) throw new HttpError(400, 'Unknown demo profile');
  const { username } = account;
  const now = new Date().toISOString();

  // A random password nobody knows: demo accounts can only be opened from this route
  const { salt, passwordHash } = await hashPassword(randomBytes(24).toString('base64url'));
  await ddb.send(
    new PutCommand({
      TableName: env.usersTable(),
      Item: {
        username, salt, passwordHash, demo: true, createdAt: '2026-11-01T09:00:00.000Z',
        profile: { ...account.profile, completedAt: '2026-11-01T09:00:00.000Z', updatedAt: now },
      },
    }),
  );
  await Promise.all(
    account.files.map((file) =>
      ddb.send(new PutCommand({ TableName: env.reportsTable(), Item: buildDemoReport(username, file) })),
    ),
  );
  console.log(`Demo sign-in: ${username}, ${account.files.length} sample reports restored`);
  return { username, token: signToken(username, env.tokenSecret()), demo: true };
}
