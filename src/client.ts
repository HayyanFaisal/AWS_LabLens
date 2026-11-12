import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';

/** Typed GraphQL client for the AppSync API that Amplify created. */
export const client = generateClient<Schema>();

export type Report = Schema['Report']['type'];
export type TestResult = Schema['TestResult']['type'];
export type Flag = 'LOW' | 'NORMAL' | 'HIGH' | 'UNKNOWN';

export const reportDateOf = (r: { reportDate?: string | null; createdAt?: string | null }) =>
  r.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(r.reportDate)
    ? r.reportDate
    : (r.createdAt ?? '').slice(0, 10);

export const formatDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
