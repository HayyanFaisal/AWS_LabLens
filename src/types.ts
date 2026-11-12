/** Shapes returned by the LabLens API (see amplify/functions/api/reports.ts). */

export type Flag = 'LOW' | 'NORMAL' | 'HIGH' | 'UNKNOWN';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TestResult {
  testName: string;
  value: number | null;
  rawValue: string | null;
  unit: string | null;
  rangeText: string | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  flag: Flag;
  confidence: number | null;
  page: number | null;
  box?: Box | null;
}

export interface QueryAnswer {
  question: string | null;
  answer: string | null;
  confidence: number | null;
}

export interface ReportSummary {
  reportId: string;
  fileName: string;
  patientName?: string | null;
  labName?: string | null;
  reportDate?: string;
  pages?: number;
  mode: 'sync' | 'async';
  status: 'DONE' | 'FAILED';
  errorMessage?: string;
  testCount?: number;
  abnormalCount?: number;
  createdAt: string;
}

export interface Report extends ReportSummary {
  fileKey: string;
  warnings?: string[];
  tables?: number;
  blockCount?: number;
  textractMs?: number;
  saveMs?: number;
  queryAnswers?: QueryAnswer[];
  tests?: TestResult[];
}

export type Sex = 'female' | 'male' | 'other';
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

/** Health profile collected at sign-up (amplify/functions/api/profile-rules.ts). */
export interface Profile {
  fullName: string;
  dateOfBirth: string;
  sex: Sex;
  phone: string | null;
  bloodGroup: BloodGroup;
  heightCm: number | null;
  weightKg: number | null;
  conditions: string[];
  medications: string[];
  allergies: string[];
  idLast4: string | null;
  filledFromId: boolean;
  completedAt?: string;
  updatedAt?: string;
}

export interface Account {
  username: string;
  createdAt: string | null;
  profile: Profile | null;
}

export interface IdField {
  field: 'fullName' | 'dateOfBirth' | 'sex' | 'idLast4';
  label: string;
  value: string | null;
  raw: string | null;
  confidence: number | null;
}

export interface IdScan {
  fullName: string | null;
  dateOfBirth: string | null;
  sex: 'male' | 'female' | null;
  idLast4: string | null;
  fields: IdField[];
  textractMs: number;
  blockCount: number;
}
