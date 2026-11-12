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
