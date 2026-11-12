/** Small shared building blocks: logo, icons, flag badge, count-up number, range bar. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Flag, TestResult } from '../types';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#lg)" />
      <circle cx="14.5" cy="14.5" r="6.5" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M19.3 19.3 24 24" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11.5 15h1.6l1-2.4 1.6 4.2 1-1.8h1.4" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const paths: Record<string, ReactNode> = {
  upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  file: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  chart: <><path d="M4 19h16" /><path d="m5 15 4-5 4 3 6-7" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
  back: <path d="m15 18-6-6 6-6" />,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  alert: <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  logout: <><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
};

export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="icon">
      {paths[name]}
    </svg>
  );
}

export function FlagBadge({ flag }: { flag?: Flag | string | null }) {
  const f = (flag ?? 'UNKNOWN') as Flag;
  const label = f === 'LOW' ? 'Low' : f === 'HIGH' ? 'High' : f === 'NORMAL' ? 'Normal' : 'No range';
  const arrow = f === 'LOW' ? '▼ ' : f === 'HIGH' ? '▲ ' : '';
  return <span className={`badge ${f.toLowerCase()}`}>{arrow}{label}</span>;
}

/** Animates a number from 0 to `value` (skipped for users who prefer reduced motion). */
export function CountUp({ value, decimals = 0, duration = 700 }: { value: number; decimals?: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <span className="num">{shown.toFixed(decimals)}</span>;
}

/**
 * Where the value sits relative to its reference range.
 * The green band is the normal range; the dot is the patient's value.
 */
export function RangeBar({ test }: { test: TestResult }) {
  const { value, rangeLow: lo, rangeHigh: hi, flag } = test;
  if (value == null || (lo == null && hi == null)) return <span className="range-bar empty" />;

  let min: number, max: number;
  if (lo != null && hi != null) {
    const span = hi - lo || Math.abs(hi) || 1;
    min = lo - span * 0.6;
    max = hi + span * 0.6;
  } else if (hi != null) {
    min = 0;
    max = hi * 1.6;
  } else {
    min = 0;
    max = lo! * 2.2;
  }
  min = Math.min(min, value);
  max = Math.max(max, value);
  const pct = (n: number) => ((n - min) / (max - min || 1)) * 100;
  const bandFrom = lo != null ? pct(lo) : 0;
  const bandTo = hi != null ? pct(hi) : 100;
  const dot = Math.max(3, Math.min(97, pct(value)));

  return (
    <span className="range-bar" title={`${test.rangeText ?? ''}`}>
      <span className="range-band" style={{ left: `${bandFrom}%`, width: `${bandTo - bandFrom}%` }} />
      <span className={`range-dot ${flag.toLowerCase()}`} style={{ left: `${dot}%` }} />
    </span>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
