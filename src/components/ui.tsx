/** Small shared building blocks: logo, icons, badges, count-up, range bar, score ring, page header. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Flag, TestResult } from '../types';

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#0077b6" />
      <circle cx="14.5" cy="14.5" r="6.6" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M19.3 19.3 24 24" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11.3 15h1.7l1-2.4 1.6 4.2 1-1.8h1.6" fill="none" stroke="#5eead4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const paths: Record<string, ReactNode> = {
  home: <><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v9a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1v-9" /></>,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M4 12h16" /></>,
  upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  file: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  chart: <><path d="M4 19h16" /><path d="m5 15 4-5 4 3 6-7" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  drop: <path d="M12 3.5s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" />,
  pill: <><rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12.5)" /><path d="m9.5 9.5 5 5.5" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M14 10h4M14 13h3" /></>,
  ruler: <><path d="M4 16 16 4l4 4L8 20z" /><path d="m8 12 2 2M11 9l1.5 1.5M14 6l2 2" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  print: <><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v6H7z" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
  back: <path d="m15 18-6-6 6-6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  up: <><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  alert: <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  logout: <><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  sparkle: <path d="M12 3c.5 4.5 2.5 6.5 7 7-4.5.5-6.5 2.5-7 7-.5-4.5-2.5-6.5-7-7 4.5-.5 6.5-2.5 7-7z" />,
  cloud: <path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>,
};

export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="icon">
      {paths[name]}
    </svg>
  );
}

export function FlagBadge({ flag }: { flag?: Flag | string | null }) {
  const f = (flag ?? 'UNKNOWN') as Flag;
  const label = f === 'LOW' ? 'Low' : f === 'HIGH' ? 'High' : f === 'NORMAL' ? 'Normal' : 'No range';
  const arrow = f === 'LOW' ? '↓ ' : f === 'HIGH' ? '↑ ' : '';
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
      setShown(value * (1 - Math.pow(1 - t, 3)));
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
export function RangeBar({ test, width = 110 }: { test: Pick<TestResult, 'value' | 'rangeLow' | 'rangeHigh' | 'flag' | 'rangeText'>; width?: number }) {
  const { value, rangeLow: lo, rangeHigh: hi, flag } = test;
  if (value == null || (lo == null && hi == null)) return <span className="range-bar empty" style={{ width }} />;

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
    <span className="range-bar" style={{ width }} title={test.rangeText ?? ''}>
      <span className="range-band" style={{ left: `${bandFrom}%`, width: `${bandTo - bandFrom}%` }} />
      <span className={`range-dot ${flag.toLowerCase()}`} style={{ left: `${dot}%` }} />
    </span>
  );
}

/** Circular progress ring, e.g. "82% of tests in range". */
export function ScoreRing({ value, size = 132, stroke = 12, label }: { value: number | null; size?: number; stroke?: number; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  const tone = value == null ? 'none' : v >= 80 ? 'good' : v >= 60 ? 'warn' : 'bad';
  return (
    <div className={`ring ring-${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} className="ring-fill" strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-value">{value == null ? '–' : <><CountUp value={v} />%</>}</span>
        <span className="ring-label">{label}</span>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: string; subtitle?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

/** Tiny inline trend chart (plain SVG, no library). Green band = reference range. */
export function Sparkline({
  points, low, high, width = 72, height = 24,
}: { points: { value: number; flag: Flag }[]; low: number | null; high: number | null; width?: number; height?: number }) {
  const w = width, h = height;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals, low ?? Infinity);
  const max = Math.max(...vals, high ?? -Infinity);
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const x = (i: number) => (points.length === 1 ? w / 2 : 3 + (i / (points.length - 1)) * (w - 6));
  const last = points[points.length - 1];
  const bad = last.flag === 'HIGH' || last.flag === 'LOW';
  return (
    <svg width={w} height={h} className="spark" aria-hidden="true">
      {low != null && high != null && <rect x="0" y={y(high)} width={w} height={Math.max(1, y(low) - y(high))} className="spark-band" />}
      {points.length > 1 && <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} className="spark-line" />}
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="3" className={bad ? 'spark-dot bad' : 'spark-dot'} />
    </svg>
  );
}

/** A Healthicons SVG drawn as a mask, so it takes any colour (currentColor or `color`). */
export function OrganIcon({ src, size = 22, color }: { src: string; size?: number; color?: string }) {
  return (
    <span
      className="organ-icon"
      aria-hidden="true"
      style={{ width: size, height: size, ['--icon' as string]: `url("${src}")`, color }}
    />
  );
}

/** Animated heartbeat line (draws itself on a loop; static for reduced motion). */
export function Ecg({ className = '' }: { className?: string }) {
  const beat = 'l10 0 l6 -4 l6 4 l8 0 l5 6 l7 -34 l7 44 l6 -16 l12 0 l7 -6 l8 6';
  return (
    <svg className={`ecg ${className}`} viewBox="0 0 320 60" preserveAspectRatio="none" aria-hidden="true">
      <path d={`M0 34 l22 0 ${beat} l32 0 ${beat} l32 0 ${beat} l22 0`} />
    </svg>
  );
}
