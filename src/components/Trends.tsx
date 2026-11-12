import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getReport, listReports } from '../api';
import { formatDate, formatShortDate, isAbnormal, testKey } from '../lib/format';
import type { Flag } from '../types';
import { FlagBadge, Icon, Spinner } from './ui';

interface Point {
  date: string;
  value: number;
  flag: Flag;
  raw: string;
}
interface Series {
  key: string;
  name: string;
  unit: string;
  points: Point[];
  low: number | null;
  high: number | null;
}

export default function Trends() {
  const [series, setSeries] = useState<Series[] | null>(null);
  const [reportCount, setReportCount] = useState(0);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Each report item holds its tests, so: list reports, then read each one
        const done = (await listReports()).filter((r) => r.status === 'DONE');
        const reports = await Promise.all(done.map((r) => getReport(r.reportId)));
        setReportCount(reports.length);

        // Group results by test name across all reports -> one time series per test
        const map = new Map<string, Series>();
        for (const r of reports) {
          for (const t of r.tests ?? []) {
            if (t.value == null) continue;
            const k = testKey(t.testName);
            const s = map.get(k) ?? { key: k, name: t.testName, unit: t.unit ?? '', points: [], low: null, high: null };
            s.points.push({ date: r.reportDate ?? r.createdAt.slice(0, 10), value: t.value, flag: t.flag, raw: t.rawValue ?? String(t.value) });
            s.low = t.rangeLow ?? s.low;
            s.high = t.rangeHigh ?? s.high;
            map.set(k, s);
          }
        }
        const list = [...map.values()];
        list.forEach((s) => s.points.sort((a, b) => a.date.localeCompare(b.date)));
        list.sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name));
        setSeries(list);
        if (list.length) setSelected(list[0].key);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const current = useMemo(() => series?.find((s) => s.key === selected) ?? series?.[0], [series, selected]);

  if (error) return <div className="page"><div className="alert error"><Icon name="alert" /> {error}</div></div>;
  if (!series) return <div className="page"><div className="card center"><Spinner /></div></div>;
  if (!series.length || !current)
    return (
      <div className="page">
        <header className="page-head"><div><h1>Health trends</h1></div></header>
        <div className="card empty"><Icon name="chart" size={32} /><p>Upload a few reports from different dates to see trends.</p></div>
      </div>
    );

  const latestAbnormal = series.filter((s) => isAbnormal(s.points[s.points.length - 1].flag));
  const improving = series.filter((s) => {
    if (s.points.length < 2) return false;
    const [a, b] = [s.points[0], s.points[s.points.length - 1]];
    return isAbnormal(a.flag) && !isAbnormal(b.flag);
  });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Health trends</h1>
          <p className="muted">Every test across all your reports, with its printed reference range.</p>
        </div>
      </header>

      <div className="stat-row">
        <div className="stat"><div className="stat-value num">{reportCount}</div><div className="stat-label">reports</div></div>
        <div className="stat"><div className="stat-value num">{series.length}</div><div className="stat-label">tests tracked</div></div>
        <div className={`stat ${latestAbnormal.length ? 'bad' : 'good'}`}><div className="stat-value num">{latestAbnormal.length}</div><div className="stat-label">out of range now</div></div>
        <div className="stat good"><div className="stat-value num">{improving.length}</div><div className="stat-label">back in range</div></div>
      </div>

      <div className="trend-grid">
        <aside className="card test-list" aria-label="Tests">
          {series.map((s) => {
            const last = s.points[s.points.length - 1];
            return (
              <button key={s.key} className={`test-item ${s.key === current.key ? 'on' : ''}`} onClick={() => setSelected(s.key)}>
                <span className="ti-name">
                  {s.name}
                  <small className="muted">{s.points.length} reading{s.points.length > 1 ? 's' : ''}</small>
                </span>
                <Sparkline points={s.points} low={s.low} high={s.high} />
                <span className={`ti-val num ${isAbnormal(last.flag) ? (last.flag === 'HIGH' ? 'high' : 'low') : ''}`}>{last.raw}</span>
              </button>
            );
          })}
        </aside>

        <section className="card chart-card">
          <div className="chart-head">
            <div>
              <h2>{current.name}</h2>
              <div className="muted small">
                Normal range: {current.low ?? '–'} to {current.high ?? '–'} {current.unit}
              </div>
            </div>
            <div className="chart-latest">
              <span className="num big">{current.points[current.points.length - 1].raw}</span>
              <span className="muted small">{current.unit}</span>
              <FlagBadge flag={current.points[current.points.length - 1].flag} />
            </div>
          </div>
          <TrendChart s={current} />
          <div className="legend small muted">
            <span className="lg-band" /> normal range <span className="lg-dot" /> in range <span className="lg-dot bad" /> out of range
          </div>
        </section>
      </div>
    </div>
  );
}

function TrendChart({ s }: { s: Series }) {
  const values = s.points.map((p) => p.value);
  const yMin = Math.min(...values, s.low ?? Infinity);
  const yMax = Math.max(...values, s.high ?? -Infinity);
  const pad = (yMax - yMin || Math.abs(yMax) || 1) * 0.2;
  const lo = Math.max(0, yMin - pad);
  const hi = yMax + pad;
  const round = (n: number) => (hi - lo > 20 ? Math.round(n) : Math.round(n * 10) / 10);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={s.points} margin={{ top: 16, right: 20, bottom: 4, left: -8 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d9488" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 4" stroke="var(--line)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
        <YAxis domain={[round(lo), round(hi)]} tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={48} />
        {(s.low != null || s.high != null) && (
          <ReferenceArea y1={s.low ?? round(lo)} y2={s.high ?? round(hi)} fill="#16a34a" fillOpacity={0.08} stroke="#16a34a" strokeOpacity={0.35} strokeDasharray="4 4" ifOverflow="hidden" />
        )}
        <Tooltip
          cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as Point;
            return (
              <div className="chart-tip">
                <div className="muted small">{formatDate(p.date)}</div>
                <div><strong className="num">{p.raw}</strong> {s.unit} <FlagBadge flag={p.flag} /></div>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#0d9488"
          strokeWidth={2.5}
          fill="url(#trendFill)"
          animationDuration={700}
          dot={(props: { cx?: number; cy?: number; index?: number; payload?: Point }) => (
            <circle key={`d-${props.index}`} cx={props.cx} cy={props.cy} r={6}
              fill={isAbnormal(props.payload?.flag) ? '#dc2626' : '#0d9488'} stroke="#fff" strokeWidth={2.5} />
          )}
          activeDot={{ r: 8 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Tiny inline chart for the test list (plain SVG, no library). */
function Sparkline({ points, low, high }: { points: Point[]; low: number | null; high: number | null }) {
  const w = 64, h = 22;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals, low ?? Infinity);
  const max = Math.max(...vals, high ?? -Infinity);
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const x = (i: number) => (points.length === 1 ? w / 2 : 3 + (i / (points.length - 1)) * (w - 6));
  const last = points[points.length - 1];
  return (
    <svg width={w} height={h} className="spark" aria-hidden="true">
      {low != null && high != null && <rect x="0" y={y(high)} width={w} height={Math.max(1, y(low) - y(high))} className="spark-band" />}
      {points.length > 1 && <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} className="spark-line" />}
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="2.8" className={isAbnormal(last.flag) ? 'spark-dot bad' : 'spark-dot'} />
    </svg>
  );
}
