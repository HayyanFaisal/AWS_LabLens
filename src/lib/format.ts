import type { Flag } from '../types';

export const formatDate = (iso: string | undefined) => {
  if (!iso) return '–';
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const formatShortDate = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
};

export const formatMs = (ms: number | undefined) =>
  ms == null ? '–' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

export const isAbnormal = (f: Flag | string | null | undefined) => f === 'LOW' || f === 'HIGH';

/** Normalises test names so "HbA1c" and "HBA1C" end up on the same trend line. */
export const testKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
