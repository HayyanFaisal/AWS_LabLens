/**
 * Home page: everything at a glance, built from the same data as Trends
 * (every finished report, grouped per test) plus the health profile.
 */
import { formatDate } from '../lib/format';
import {
  ageFrom, bmi, bmiBand, dateOf, deviation, direction, inRangeScore, latest, nameMatch, outOfRangeNow, previous, rangeLabel,
  useHealthData, type Series,
} from '../lib/health';
import { PANELS } from '../lib/testLibrary';
import type { Profile } from '../types';
import { FlagBadge, Icon, PageHeader, ScoreRing, Sparkline, Spinner } from './ui';

export type Page = 'dashboard' | 'scan' | 'reports' | 'trends' | 'profile';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard({
  profile, onNavigate, onOpenReport, onOpenTest,
}: {
  profile: Profile;
  onNavigate: (p: Page) => void;
  onOpenReport: (id: string) => void;
  onOpenTest: (key: string) => void;
}) {
  const { data, error, loading } = useHealthData();
  const first = profile.fullName.split(' ')[0];

  const header = (
    <PageHeader
      eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      title={`${greeting()}, ${first}`}
      subtitle="Here is where your health stands, based on all the lab reports you have scanned."
      actions={<button className="btn-primary" onClick={() => onNavigate('scan')}><Icon name="scan" size={17} /> Scan a report</button>}
    />
  );

  if (error) return <div className="page">{header}<div className="alert error"><Icon name="alert" /> {error}</div></div>;
  if (loading || !data) return <div className="page">{header}<div className="card center"><Spinner /></div></div>;

  const { series, summaries, reports } = data;
  if (!reports.length) {
    return (
      <div className="page">
        {header}
        <div className="dash-grid start">
          <div className="card welcome">
            <span className="welcome-icon"><Icon name="sparkle" size={26} /></span>
            <h2>Scan your first lab report</h2>
            <p className="muted">Take a photo or upload a PDF of a blood test. Amazon Textract reads the results table and LabLens builds your dashboard from it.</p>
            <ol className="welcome-steps">
              <li><span>1</span> Upload a photo or PDF</li>
              <li><span>2</span> Textract reads every result</li>
              <li><span>3</span> See flags, explanations and trends</li>
            </ol>
            <button className="btn-primary btn-lg" onClick={() => onNavigate('scan')}><Icon name="scan" size={18} /> Scan a report</button>
          </div>
          <ProfileCard profile={profile} onEdit={() => onNavigate('profile')} />
        </div>
      </div>
    );
  }

  const attention = outOfRangeNow(series).sort(
    (a, b) => deviation(latest(b).value, b.low, b.high) - deviation(latest(a).value, a.low, a.high),
  );
  const score = inRangeScore(series);
  const lastReport = reports[reports.length - 1];
  const otherPeople = reports.filter((r) => nameMatch(profile.fullName, r.patientName) === 'mismatch').length;

  return (
    <div className="page">
      {header}

      <div className="dash-grid">
        <section className="card overview">
          <ScoreRing value={score} label="in range" />
          <div className="overview-text">
            <h2>Health overview</h2>
            <p className="muted">
              Of your <strong>{series.length}</strong> tracked tests, the latest result of{' '}
              <strong className={attention.length ? 'bad-text' : 'good-text'}>{attention.length}</strong>{' '}
              {attention.length === 1 ? 'is' : 'are'} outside the reference range.
            </p>
            <div className="mini-stats">
              <div><span className="num">{reports.length}</span><small>reports</small></div>
              <div><span className="num">{series.length}</span><small>tests tracked</small></div>
              <div><span className="num">{formatDate(dateOf(lastReport))}</span><small>latest report</small></div>
            </div>
          </div>
        </section>

        <ProfileCard profile={profile} onEdit={() => onNavigate('profile')} />
      </div>

      {otherPeople > 0 && (
        <div className="alert warn"><Icon name="alert" /> {otherPeople} report{otherPeople > 1 ? 's carry' : ' carries'} a different patient name than your profile. Open My reports to check them.</div>
      )}

      <SystemsGrid series={series} onOpenTest={onOpenTest} />

      <div className="dash-grid wide-left">
        <section className="card">
          <div className="card-head">
            <h2>Needs attention</h2>
            <span className="muted small">latest value outside its printed range</span>
          </div>
          {attention.length === 0 ? (
            <div className="all-good"><Icon name="shield" size={22} /> Every latest result is within its reference range.</div>
          ) : (
            <ul className="attn-list">
              {attention.slice(0, 8).map((s, i) => <AttentionRow key={s.key} s={s} i={i} onClick={() => onOpenTest(s.key)} />)}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Recent reports</h2>
            <button className="link-btn" onClick={() => onNavigate('reports')}>View all <Icon name="chevron" size={14} /></button>
          </div>
          <ol className="timeline">
            {summaries.slice(0, 6).map((r) => {
              const failed = r.status === 'FAILED';
              return (
                <li key={r.reportId} className={failed ? 'failed' : (r.abnormalCount ?? 0) > 0 ? 'flagged' : 'ok'}>
                  <button disabled={failed} onClick={() => onOpenReport(r.reportId)}>
                    <span className="tl-date">{formatDate(r.reportDate ?? r.createdAt)}</span>
                    <span className="tl-title">{r.labName || r.fileName}</span>
                    <span className="tl-meta">
                      {failed ? 'Not accepted' : <>{r.testCount} tests · <b>{r.abnormalCount ?? 0}</b> flagged</>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}

function ProfileCard({ profile, onEdit }: { profile: Profile; onEdit: () => void }) {
  const b = bmi(profile.heightCm, profile.weightKg);
  const band = b ? bmiBand(b) : null;
  const initials = profile.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <section className="card profile-card">
      <div className="pc-top">
        <span className="pc-avatar">{initials}</span>
        <div>
          <h2>{profile.fullName}</h2>
          <span className="muted small">{ageFrom(profile.dateOfBirth)} years · <span className="cap">{profile.sex}</span></span>
        </div>
        <button className="icon-btn" onClick={onEdit} title="Edit profile" aria-label="Edit profile"><Icon name="edit" size={16} /></button>
      </div>
      <div className="pc-facts">
        <div><Icon name="drop" size={16} /><span><small>Blood group</small>{profile.bloodGroup === 'unknown' ? '—' : profile.bloodGroup}</span></div>
        <div><Icon name="ruler" size={16} /><span><small>BMI</small>{b ?? '—'}{band && <em className={`tone-${band.tone}`}>{band.label}</em>}</span></div>
        <div><Icon name="pill" size={16} /><span><small>Medications</small>{profile.medications.length || '—'}</span></div>
      </div>
      {(profile.conditions.length > 0 || profile.allergies.length > 0) && (
        <div className="pc-tags">
          {profile.conditions.map((c) => <span key={c} className="tag soft">{c}</span>)}
          {profile.allergies.map((a) => <span key={a} className="tag warn">Allergy: {a}</span>)}
        </div>
      )}
    </section>
  );
}

function SystemsGrid({ series, onOpenTest }: { series: Series[]; onOpenTest: (key: string) => void }) {
  const panels = PANELS.map((p) => {
    const tests = series.filter((s) => s.panel.id === p.id);
    const flagged = tests.filter((s) => latest(s).flag === 'HIGH' || latest(s).flag === 'LOW');
    return { p, tests, flagged };
  }).filter((x) => x.tests.length);
  return (
    <section>
      <h2 className="section-title">Body systems <span className="muted small">grouped from your test results</span></h2>
      <div className="systems">
        {panels.map(({ p, tests, flagged }, i) => (
          <button key={p.id} className={`system ${flagged.length ? 'flagged' : 'ok'}`} style={{ ['--c' as string]: p.color, ['--i' as string]: i }}
            onClick={() => onOpenTest((flagged[0] ?? tests[0]).key)}>
            <span className="sys-name">{p.name}</span>
            <span className="sys-count">{tests.length} test{tests.length > 1 ? 's' : ''}</span>
            <span className="sys-status">
              {flagged.length ? <><Icon name="alert" size={14} /> {flagged.length} flagged</> : <><Icon name="check" size={14} /> All in range</>}
            </span>
            <span className="sys-bar">{tests.map((s) => <i key={s.key} className={latest(s).flag.toLowerCase()} />)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function AttentionRow({ s, i, onClick }: { s: Series; i: number; onClick: () => void }) {
  const l = latest(s);
  const prev = previous(s);
  const dir = direction(s);
  return (
    <li style={{ ['--i' as string]: i }}>
      <button onClick={onClick}>
        <span className="attn-dot" style={{ background: s.panel.color }} />
        <span className="attn-name">
          <strong>{s.name}</strong>
          <small className="muted">{s.panel.name} · range {rangeLabel(s.low, s.high, s.unit)}</small>
        </span>
        <Sparkline points={s.points} low={s.low} high={s.high} />
        <span className="attn-val">
          <strong className="num">{l.raw}</strong> <small className="muted">{s.unit}</small>
        </span>
        <FlagBadge flag={l.flag} />
        {dir && prev ? (
          <span className={`trend-chip ${dir}`} title={`Previous: ${prev.raw} on ${formatDate(prev.date)}`}>
            {dir === 'better' ? 'Improving' : dir === 'worse' ? 'Worsening' : 'No change'}
          </span>
        ) : <span className="trend-chip none">First reading</span>}
      </button>
    </li>
  );
}
