/**
 * "Body map": a simple human figure with one marker per body system that has
 * results. Green = latest results in range, red (pulsing) = something flagged,
 * grey = not tested yet. Clicking a marker opens that system in Trends.
 */
import { latest, type Series } from '../lib/health';
import { PANELS } from '../lib/testLibrary';
import { OrganIcon } from './ui';

export default function BodyMap({ series, onOpenTest }: { series: Series[]; onOpenTest: (key: string) => void }) {
  const systems = PANELS.filter((p) => p.id !== 'other').map((p) => {
    const tests = series.filter((s) => s.panel.id === p.id);
    const flagged = tests.filter((s) => latest(s).flag === 'HIGH' || latest(s).flag === 'LOW');
    const state = !tests.length ? 'none' : flagged.length ? 'bad' : 'ok';
    return { p, tests, flagged, state };
  });

  return (
    <div className="body-map">
      <svg viewBox="0 0 240 460" className="body-figure" aria-hidden="true">
        <defs>
          <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e3f0f9" />
            <stop offset="1" stopColor="#d3e6f3" />
          </linearGradient>
        </defs>
        <g fill="url(#skin)" stroke="#b9d3e6" strokeWidth="2">
          <ellipse cx="120" cy="50" rx="29" ry="33" />
          <rect x="107" y="78" width="26" height="24" rx="8" />
          <rect x="40" y="108" width="26" height="150" rx="13" transform="rotate(9 53 108)" />
          <rect x="174" y="108" width="26" height="150" rx="13" transform="rotate(-9 187 108)" />
          <rect x="80" y="244" width="37" height="200" rx="18" />
          <rect x="123" y="244" width="37" height="200" rx="18" />
          <rect x="68" y="98" width="104" height="176" rx="42" />
        </g>
        <path d="M120 110 v150" stroke="#c4dbea" strokeWidth="2" strokeDasharray="4 6" />
      </svg>
      <span className="body-scan" aria-hidden="true" />
      {systems.map(({ p, tests, flagged, state }) => (
        <button
          key={p.id}
          className={`organ-pin ${state}`}
          style={{ left: `${p.spot[0]}%`, top: `${p.spot[1]}%`, ['--c' as string]: p.color }}
          disabled={!tests.length}
          onClick={() => tests.length && onOpenTest((flagged[0] ?? tests[0]).key)}
          aria-label={`${p.organ}: ${!tests.length ? 'not tested' : flagged.length ? `${flagged.length} flagged` : 'all in range'}`}
        >
          <OrganIcon src={p.icon} size={20} />
          <span className="pin-tip">
            <strong>{p.name}</strong>
            {!tests.length ? 'Not tested yet' : flagged.length ? `${flagged.length} of ${tests.length} flagged` : `${tests.length} in range`}
          </span>
        </button>
      ))}
      <div className="body-legend">
        <span><i className="ok" /> In range</span>
        <span><i className="bad" /> Flagged</span>
        <span><i className="none" /> Not tested</span>
      </div>
    </div>
  );
}
