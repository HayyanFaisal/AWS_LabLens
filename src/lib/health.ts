/**
 * Shared health data for the dashboard, trends and report pages.
 * Reports are loaded once (list + every finished report) and cached in memory,
 * so switching pages does not re-fetch everything. Uploads and deletes call
 * invalidateReports() so the next page view reloads fresh data.
 */
import { useCallback, useEffect, useState } from 'react';
import { getReport, listReports } from '../api';
import type { Flag, Report, ReportSummary } from '../types';
import { isAbnormal, testKey } from './format';
import { panelOf, type Panel } from './testLibrary';

export interface HealthData {
  summaries: ReportSummary[]; // every report, newest first (including FAILED)
  reports: Report[]; // full DONE reports, oldest first
  series: Series[];
}

let cache: HealthData | null = null;
let inflight: Promise<HealthData> | null = null;

export function invalidateReports() {
  cache = null;
}

async function loadAll(): Promise<HealthData> {
  const summaries = (await listReports()).sort((a, b) =>
    (b.reportDate ?? b.createdAt).localeCompare(a.reportDate ?? a.createdAt),
  );
  const done = summaries.filter((r) => r.status === 'DONE');
  const reports = (await Promise.all(done.map((r) => getReport(r.reportId)))).sort((a, b) =>
    dateOf(a).localeCompare(dateOf(b)),
  );
  return { summaries, reports, series: buildSeries(reports) };
}

export function useHealthData() {
  const [data, setData] = useState<HealthData | null>(cache);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cache);

  const reload = useCallback(async (force = false) => {
    if (force) invalidateReports();
    if (cache) {
      setData(cache);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      inflight ??= loadAll();
      cache = await inflight;
      setData(cache);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inflight = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}

// ---------- trend series ----------
export interface Point {
  date: string;
  value: number;
  flag: Flag;
  raw: string;
  reportId: string;
}
export interface Series {
  key: string;
  name: string;
  unit: string;
  panel: Panel;
  points: Point[]; // oldest first
  low: number | null;
  high: number | null;
}

export const dateOf = (r: { reportDate?: string; createdAt: string }) => r.reportDate ?? r.createdAt.slice(0, 10);

/** One time series per test name across all reports. */
export function buildSeries(reports: Report[]): Series[] {
  const map = new Map<string, Series>();
  for (const r of reports) {
    for (const t of r.tests ?? []) {
      if (t.value == null) continue;
      const k = testKey(t.testName);
      const s = map.get(k) ?? { key: k, name: t.testName, unit: t.unit ?? '', panel: panelOf(t.testName), points: [], low: null, high: null };
      s.points.push({ date: dateOf(r), value: t.value, flag: t.flag, raw: t.rawValue ?? String(t.value), reportId: r.reportId });
      s.low = t.rangeLow ?? s.low;
      s.high = t.rangeHigh ?? s.high;
      map.set(k, s);
    }
  }
  const list = [...map.values()];
  list.forEach((s) => s.points.sort((a, b) => a.date.localeCompare(b.date)));
  return list.sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name));
}

export const latest = (s: Series) => s.points[s.points.length - 1];
export const previous = (s: Series) => (s.points.length > 1 ? s.points[s.points.length - 2] : null);

/** How far outside the range a value is, as a fraction of the range width (0 if inside). */
export function deviation(value: number, low: number | null, high: number | null): number {
  const width = low != null && high != null ? Math.max(high - low, 1e-9) : Math.abs(high ?? low ?? 1) || 1;
  if (high != null && value > high) return (value - high) / width;
  if (low != null && value < low) return (low - value) / width;
  return 0;
}

/** "better" if the latest value moved toward (or into) the range, "worse" if away. */
export function direction(s: Series): 'better' | 'worse' | 'same' | null {
  const a = previous(s);
  const b = latest(s);
  if (!a) return null;
  const da = deviation(a.value, s.low, s.high);
  const db = deviation(b.value, s.low, s.high);
  if (Math.abs(da - db) < 0.01) return 'same';
  return db < da ? 'better' : 'worse';
}

export const outOfRangeNow = (series: Series[]) => series.filter((s) => isAbnormal(latest(s).flag));

/** Share of tests (latest reading each) inside their reference range, 0-100. */
export function inRangeScore(series: Series[]): number | null {
  const judged = series.filter((s) => latest(s).flag !== 'UNKNOWN');
  if (!judged.length) return null;
  return Math.round((judged.filter((s) => latest(s).flag === 'NORMAL').length / judged.length) * 100);
}

// ---------- profile helpers ----------
export function ageFrom(dateOfBirth: string, on: Date = new Date()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age--;
  return age;
}

export function bmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg) return null;
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
}

/** Standard WHO adult BMI bands. */
export function bmiBand(b: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (b < 18.5) return { label: 'Underweight', tone: 'warn' };
  if (b < 25) return { label: 'Healthy weight', tone: 'good' };
  if (b < 30) return { label: 'Overweight', tone: 'warn' };
  return { label: 'Obese range', tone: 'bad' };
}

const nameTokens = (s: string) =>
  s.toLowerCase().replace(/^(mr|mrs|ms|miss|dr)\.?\s+/, '').split(/[^a-z]+/).filter((t) => t.length >= 2);

/**
 * Does the patient name printed on a report belong to the profile owner?
 * "match" if every word of the shorter name appears in the longer one.
 */
export function nameMatch(profileName: string | undefined, reportName: string | null | undefined): 'match' | 'mismatch' | 'unknown' {
  if (!profileName || !reportName) return 'unknown';
  const a = nameTokens(profileName);
  const b = nameTokens(reportName);
  if (!a.length || !b.length) return 'unknown';
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.every((t) => long.includes(t)) ? 'match' : 'mismatch';
}

/** "13–17 g/dL", "< 200 mg/dL", "> 40 mg/dL" or "no range". */
export function rangeLabel(low: number | null, high: number | null, unit = ''): string {
  const u = unit ? ` ${unit}` : '';
  if (low != null && high != null) return `${low}–${high}${u}`;
  if (high != null) return `< ${high}${u}`;
  if (low != null) return `> ${low}${u}`;
  return 'no range';
}
