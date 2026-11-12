import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { client, formatDate, reportDateOf, type TestResult } from '../client';
import { FlagBadge } from './ReportDetail';

interface Series {
  key: string;
  name: string;
  unit: string;
  points: { date: string; value: number; flag: string; raw: string }[];
  low: number | null;
  high: number | null;
}

const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

export default function Trends() {
  const [rows, setRows] = useState<TestResult[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const all: TestResult[] = [];
      let nextToken: string | null | undefined = undefined;
      do {
        const res: { data: TestResult[]; nextToken?: string | null } =
          await client.models.TestResult.list({ limit: 1000, nextToken });
        all.push(...res.data);
        nextToken = res.nextToken;
      } while (nextToken);
      setRows(all);
      setLoading(false);
    })();
  }, []);

  // Group results by test name across all reports -> one time series per test
  const series = useMemo(() => {
    const map = new Map<string, Series>();
    for (const r of rows) {
      if (r.value == null) continue;
      const k = keyOf(r.testName);
      const s = map.get(k) ?? { key: k, name: r.testName, unit: r.unit ?? '', points: [], low: null, high: null };
      s.points.push({ date: reportDateOf(r), value: r.value, flag: r.flag ?? 'UNKNOWN', raw: r.rawValue ?? '' });
      s.low = r.rangeLow ?? s.low;
      s.high = r.rangeHigh ?? s.high;
      map.set(k, s);
    }
    for (const s of map.values()) s.points.sort((a, b) => a.date.localeCompare(b.date));
    return [...map.values()].sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name));
  }, [rows]);

  useEffect(() => {
    if (!selected && series.length) setSelected(series[0].key);
  }, [series, selected]);

  if (loading) return <section className="panel">Loading trends…</section>;
  if (!series.length)
    return (
      <section className="panel">
        <h1>Health trends</h1>
        <p className="muted">Upload a few reports from different dates to see trends.</p>
      </section>
    );

  const latest = series.map((s) => ({ s, last: s.points[s.points.length - 1] }));
  const abnormalNow = latest.filter(({ last }) => last.flag === 'LOW' || last.flag === 'HIGH');
  const reportsCount = new Set(rows.map((r) => r.reportId)).size;
  const current = series.find((s) => s.key === selected) ?? series[0];

  const values = current.points.map((p) => p.value);
  const yMin = Math.min(...values, current.low ?? Infinity);
  const yMax = Math.max(...values, current.high ?? -Infinity);
  const pad = (yMax - yMin || Math.abs(yMax) || 1) * 0.15;

  return (
    <section className="panel">
      <h1>Health trends</h1>
      <div className="stats">
        <div className="stat"><div className="stat-value">{reportsCount}</div><div className="stat-label">reports</div></div>
        <div className="stat"><div className="stat-value">{series.length}</div><div className="stat-label">tests tracked</div></div>
        <div className={`stat ${abnormalNow.length ? 'bad' : 'good'}`}>
          <div className="stat-value">{abnormalNow.length}</div>
          <div className="stat-label">out of range (latest)</div>
        </div>
      </div>

      <div className="trend-layout">
        <div className="chart-card">
          <div className="chart-head">
            <select value={current.key} onChange={(e) => setSelected(e.target.value)}>
              {series.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name} ({s.points.length})
                </option>
              ))}
            </select>
            <span className="muted small">
              Normal range: {current.low ?? '–'} to {current.high ?? '–'} {current.unit}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={current.points} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
              <YAxis domain={[Math.floor(yMin - pad), Math.ceil(yMax + pad)]} tick={{ fontSize: 12 }} />
              {(current.low != null || current.high != null) && (
                <ReferenceArea
                  y1={current.low ?? Math.floor(yMin - pad)}
                  y2={current.high ?? Math.ceil(yMax + pad)}
                  fill="#16a34a"
                  fillOpacity={0.08}
                  stroke="#16a34a"
                  strokeOpacity={0.3}
                  strokeDasharray="4 4"
                />
              )}
              <Tooltip
                labelFormatter={(d) => formatDate(String(d))}
                formatter={(v) => [`${v} ${current.unit}`, current.name]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={2}
                isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; index?: number; payload?: { flag: string } }) => {
                  const bad = props.payload?.flag === 'LOW' || props.payload?.flag === 'HIGH';
                  return (
                    <circle
                      key={`dot-${props.index}`}
                      cx={props.cx}
                      cy={props.cy}
                      r={6}
                      fill={bad ? '#dc2626' : '#2563eb'}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="muted small legend">
            <span className="sw green" /> normal range <span className="sw red" /> out of range
          </div>
        </div>

        <div className="watch-card">
          <h3>Latest out-of-range</h3>
          {abnormalNow.length === 0 ? (
            <p className="good-text">All latest results are within range.</p>
          ) : (
            <ul className="watch-list">
              {abnormalNow.map(({ s, last }) => (
                <li key={s.key} onClick={() => setSelected(s.key)}>
                  <span>{s.name}</span>
                  <span className="num">
                    {last.raw} {s.unit} <FlagBadge flag={last.flag} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
