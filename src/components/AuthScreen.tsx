import { useState, type FormEvent } from 'react';
import { demoLogin, login, register, type Session } from '../api';
import { Icon, Logo, Spinner } from './ui';

type Mode = 'login' | 'register';

export const SIGNUP_STEPS = ['Account', 'Identity', 'Health profile', 'Review'];

/** Pre-filled demo accounts (created by POST /auth/demo, reset on every demo sign-in). */
const DEMOS = [
  { key: 'ali' as const, initials: 'AR', name: 'Ali Raza', meta: '36 · Male · Type 2 diabetes', detail: '7 reports · Dec 2025 – Nov 2026 · ID scanned', color: '#0077b6' },
  { key: 'sara' as const, initials: 'SK', name: 'Sara Khan', meta: '27 · Female · Anaemia', detail: '3 reports · Mar – Sep 2026 · ID scanned', color: '#b45309' },
];

export default function AuthScreen({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState<string | null>(null);

  async function openDemo(key: 'ali' | 'sara') {
    setError(null);
    setDemoBusy(key);
    try {
      onSignedIn(await demoLogin(key));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDemoBusy(null);
    }
  }

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const u = username.trim().toLowerCase();
    if (mode === 'register') {
      if (!/^[a-z0-9_]{3,30}$/.test(u)) return setError('Username: 3-30 lowercase letters, numbers or _');
      if (password.length < 8) return setError('Password must be at least 8 characters');
      if (password !== confirm) return setError('The two passwords do not match');
    }
    setBusy(true);
    try {
      onSignedIn(mode === 'login' ? await login(u, password) : await register(u, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-main">
        <div className="auth-brand">
          <Logo size={34} />
          <span>LabLens</span>
        </div>

        <div className="auth-form-wrap">
          {mode === 'login' ? (
            <>
              <h1>Welcome back</h1>
              <p className="page-sub">Sign in to see your lab results, trends and health profile.</p>
            </>
          ) : (
            <>
              <ol className="mini-steps" aria-label="Sign-up steps">
                {SIGNUP_STEPS.map((s, i) => (
                  <li key={s} className={i === 0 ? 'on' : ''}><span>{i + 1}</span>{s}</li>
                ))}
              </ol>
              <h1>Create your account</h1>
              <p className="page-sub">Next you will add your identity (or scan your ID card) and a short health profile.</p>
            </>
          )}

          <form className="auth-form" onSubmit={submit}>
            <label className="field">
              <span>Username</span>
              <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. hayyan" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'} required />
            </label>
            {mode === 'register' && (
              <label className="field">
                <span>Confirm password</span>
                <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" required />
              </label>
            )}

            {error && <div className="form-error" role="alert"><Icon name="alert" size={16} /> {error}</div>}

            <button className="btn-primary btn-lg" disabled={busy}>
              {busy ? <Spinner /> : mode === 'login' ? 'Sign in' : <>Continue <Icon name="arrow" size={17} /></>}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? (
              <>New to LabLens? <button type="button" onClick={() => switchTo('register')}>Create an account</button></>
            ) : (
              <>Already have an account? <button type="button" onClick={() => switchTo('login')}>Sign in</button></>
            )}
          </p>

          <div className="divider"><span>or explore a demo profile</span></div>
          <div className="demo-list">
            {DEMOS.map((d) => (
              <button key={d.key} type="button" className="demo-card" onClick={() => openDemo(d.key)} disabled={!!demoBusy}>
                <span className="demo-avatar" style={{ background: d.color }}>{d.initials}</span>
                <span className="demo-text">
                  <strong>{d.name}</strong>
                  <small>{d.meta}</small>
                  <small className="demo-detail">{d.detail}</small>
                </span>
                {demoBusy === d.key ? <Spinner /> : <Icon name="arrow" size={18} />}
              </button>
            ))}
          </div>

          <p className="fine"><Icon name="lock" size={14} /> Passwords are hashed with scrypt. Sessions are signed tokens valid for 12 hours.</p>
        </div>

        <footer className="auth-foot">AWS Amplify + Amazon Textract · Hayyan Faisal &amp; Ali Sajjad · Demo only, not medical advice</footer>
      </section>

      <section className="auth-side" aria-hidden="true">
        <div className="auth-side-inner">
          <div className="side-kicker"><span className="dot-live" /> Powered by Amazon Textract</div>
          <h2>Paper lab reports in.<br />Clear health data out.</h2>
          <ScanVisual />
          <ul className="side-points">
            <li><Icon name="scan" size={18} /> Reads result tables from photos and PDFs</li>
            <li><Icon name="pulse" size={18} /> Flags every value Low, Normal or High</li>
            <li><Icon name="chart" size={18} /> Tracks each test across all your reports</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

const SCAN_ROWS: { name: string; value: string; range: string; flag: 'HIGH' | 'LOW' | 'NORMAL' }[] = [
  { name: 'Hemoglobin', value: '11.2', range: '13.0 – 17.0', flag: 'LOW' },
  { name: 'WBC Count', value: '7,800', range: '4,000 – 11,000', flag: 'NORMAL' },
  { name: 'Fasting Glucose', value: '128', range: '70 – 100', flag: 'HIGH' },
  { name: 'HbA1c', value: '7.1', range: '4.0 – 5.6', flag: 'HIGH' },
  { name: 'Creatinine', value: '1.0', range: '0.7 – 1.3', flag: 'NORMAL' },
];

/** A mock report being "read": a scan line sweeps down and each row gets a Textract-style box. */
function ScanVisual() {
  return (
    <div className="scan-sheet">
      <div className="sheet-head">
        <div className="sheet-title" />
        <div className="sheet-line" />
        <div className="sheet-info">
          <span className="q-tag">PATIENT_NAME · Ali Raza · 99%</span>
          <span className="q-tag d2">REPORT_DATE · 2026-03-14 · 98%</span>
        </div>
      </div>
      <div className="sheet-table">
        <div className="sheet-row head"><span>Test</span><span>Result</span><span>Range</span></div>
        {SCAN_ROWS.map((r, i) => (
          <div key={r.name} className="sheet-row" style={{ ['--i' as string]: i }}>
            <span>{r.name}</span>
            <span className="num">{r.value}</span>
            <span className="num">{r.range}</span>
            <span className={`scan-box ${r.flag.toLowerCase()}`} />
            <span className={`scan-flag ${r.flag.toLowerCase()}`}>{r.flag}</span>
          </div>
        ))}
      </div>
      <div className="scan-line" />
    </div>
  );
}
