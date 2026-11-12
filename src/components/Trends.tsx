import { useMemo, useState } from 'react';
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
import { formatDate, formatShortDate, isAbnormal } from '../lib/format';
import { direction, latest, outOfRangeNow, rangeLabel, useHealthData, type Point, type Series } from '../lib/health';
import { PANELS, testInfo } from '../lib/testLibrary';
import { Empty, FlagBadge, Icon, PageHeader, Sparkline, Spinner } from './ui';

const BLUE = '#0077b6';
const RED = '#dc2626';

export default function Trends({ initialKey }: { initialKey?: string | null }) {
  const { data, error } = useHealthData();
  const [selected, setSelected] = useState(initialKey ?? '');
  const [query, setQuery] = useState('');

  const series = data?.series ?? null;
  const current = useMemo(() => series?.find((s) => s.key === selected) ?? series?.[0], [series, selected]);
  const header = <PageHeader title="Health trends" subtitle="Every test across all your reports, plotted against its printed reference range." />;

  if (error) return <div className="page">{header}<div className="alert error"><Icon name="alert" /> {error}</div></div>;
  if (!series) return <div className="page">{header}<div className="card center"><Spinner /></div></div>;
  if (!series.length || !current)
    return <div className="page">{header}<Empty icon="chart" title="No trends yet">Scan a few reports from different dates to see how each test changes.</Empty></div>;

  const flaggedNow = outOfRangeNow(series).length;
  const multi = series.filter((s) => s.points.length > 1).length;
  const q = query.trim().toLowerCase();
  const groups = PANELS.map((p) => ({ p, list: series.filter((s) => s.panel.id === p.id && (!q || s.name.toLowerCase().includes(q))) })).filter((g) => g.list.length);
  const info = testInfo(current.name);
  const dir = direction(current);

  return (
    <div className="page">
      {header}

      <div className="stat-row">
        <div className="stat"><Icon name="file" /><div className="stat-value num">{data!.reports.length}</div><div className="stat-label">reports</div></div>
        <div className="stat"><Icon name="chart" /><div className="stat-value num">{series.length}</div><div className="stat-label">tests tracked</div></div>
        <div className="stat"><Icon name="pulse" /><div className="stat-value num">{multi}</div><div className="stat-label">with history</div></div>
        <div className={`stat ${flaggedNow ? 'bad' : 'good'}`}><Icon name={flaggedNow ? 'alert' : 'check'} /><div className="stat-value num">{flaggedNow}</div><div className="stat-label">out of range now</div></div>
      </div>

      <div className="trend-grid">
        <aside className="card test-list" aria-label="Tests">
          <label className="search small">
            <Icon name="search" size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a test" />
          </label>
          {groups.map(({ p, list }) => (
            <div key={p.id} className="tl-group">
              <div className="tl-group-name"><span className="group-dot" style={{ background: p.color }} /> {p.name}</div>
              {list.map((s) => {
                const last = latest(s);
                return (
                  <button key={s.key} className={`test-item ${s.key === current.key ? 'on' : ''}`} onClick={() => setSelected(s.key)}>
                    <span className="ti-name">
                      {s.name}
                      <small className="muted">{s.points.length} reading{s.points.length > 1 ? 's' : ''}</small>
                    </span>
                    <Sparkline points={s.points} low={s.low} high={s.high} width={60} height={22} />
                    <span className={`ti-val num ${isAbnormal(last.flag) ? (last.flag === 'HIGH' ? 'high' : 'low') : ''}`}>{last.raw}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        <section className="card chart-card">
          <div className="chart-head">
            <div>
              <div className="eyebrow" style={{ color: current.panel.color }}>{current.panel.name}</div>
              <h2>{current.name}</h2>
              <div className="muted small">Reference range: {rangeLabel(current.low, current.high, current.unit)}</div>
            </div>
            <div className="chart-latest">
              <span className="num big">{latest(current).raw}</span>
              <span className="muted small">{current.unit}</span>
              <FlagBadge flag={latest(current).flag} />
              {dir && <span className={`trend-chip ${dir === 'same' && latest(current).flag === 'NORMAL' ? 'better' : dir}`}>{dir === 'better' ? 'Improving' : dir === 'worse' ? 'Worsening' : latest(current).flag === 'NORMAL' ? 'Still in range' : 'No change'}</span>}
            </div>
          </div>
          <TrendChart s={current} />
          <div className="legend small muted">
            <span className="lg-band" /> reference range <span className="lg-dot" /> in range <span className="lg-dot bad" /> out of range
          </div>
          <div className="about-test">
            <Icon name="info" size={16} />
            <p><strong>About this test.</strong> {info.about} {info.high && <span>High: {info.high} </span>}{info.low && <span>Low: {info.low}</span>}</p>
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
            <stop offset="0%" stopColor={BLUE} stopOpacity={0.18} />
            <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 4" stroke="#e3e8ee" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12, fill: '#64748d' }} axisLine={false} tickLine={false} />
        <YAxis domain={[round(lo), round(hi)]} tick={{ fontSize: 12, fill: '#64748d' }} axisLine={false} tickLine={false} width={48} />
        {(s.low != null || s.high != null) && (
          <ReferenceArea y1={s.low ?? round(lo)} y2={s.high ?? round(hi)} fill="#059669" fillOpacity={0.07} stroke="#059669" strokeOpacity={0.35} strokeDasharray="4 4" ifOverflow="hidden" />
        )}
        <Tooltip
          cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
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
          stroke={BLUE}
          strokeWidth={2.5}
          fill="url(#trendFill)"
          isAnimationActive={false}
          dot={(props: { cx?: number; cy?: number; index?: number; payload?: Point }) => (
            <circle key={`d-${props.index}`} cx={props.cx} cy={props.cy} r={6}
              fill={isAbnormal(props.payload?.flag) ? RED : BLUE} stroke="#fff" strokeWidth={2.5} />
          )}
          activeDot={{ r: 8 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
