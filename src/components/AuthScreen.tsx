import { useState, type FormEvent } from 'react';
import { login, register, type Session } from '../api';
import { Logo, Spinner } from './ui';

type Mode = 'login' | 'register';

export default function AuthScreen({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const u = username.trim().toLowerCase();
    if (mode === 'register') {
      if (!/^[a-z0-9_]{3,30}$/.test(u)) return setError('Username: 3-30 lowercase letters, numbers or _');
      if (password.length < 8) return setError('Password must be at least 8 characters');
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
      <div className="auth-glow" aria-hidden="true" />
      <section className="auth-left">
        <div className="auth-brand">
          <Logo size={34} />
          <span>LabLens</span>
        </div>
        <h1 className="auth-title">
          Paper lab reports in.
          <br />
          <span className="gradient-text">Health data out.</span>
        </h1>
        <p className="auth-sub">
          Upload a photo or PDF of a blood test. Amazon Textract reads the results table, LabLens flags
          every value against its reference range and tracks it over time.
        </p>

        <form className="auth-card" onSubmit={submit}>
          <div className="seg" role="tablist">
            <span className="seg-pill" style={{ transform: `translateX(${mode === 'login' ? 0 : 100}%)` }} />
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(null); }}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setError(null); }}>
              Create account
            </button>
          </div>

          <label className="field">
            <span>Username</span>
            <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. hayyan" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'} required />
          </label>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <button className="btn-glow" disabled={busy}>
            {busy ? <Spinner /> : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <p className="auth-fine">
            Passwords are hashed with scrypt; sessions are HMAC-signed tokens valid for 12 hours.
          </p>
        </form>

        <div className="auth-powered">
          <span className="chip-dark">AWS Amplify</span>
          <span className="chip-dark">Amazon Textract</span>
          <span className="chip-dark">Lambda · S3 · DynamoDB</span>
        </div>
      </section>

      <section className="auth-right" aria-hidden="true">
        <ScanVisual />
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
  { name: 'Vitamin D', value: '14', range: '30 – 100', flag: 'LOW' },
];

/** A mock report being "read": a scan line sweeps down and each row gets a Textract-style box. */
function ScanVisual() {
  return (
    <div className="scan-stage">
      <div className="scan-sheet">
        <div className="sheet-head">
          <div className="sheet-title" />
          <div className="sheet-line w60" />
          <div className="sheet-info">
            <span className="q-tag">PATIENT_NAME · Ali Raza · 99%</span>
            <span className="q-tag d2">REPORT_DATE · 2026-03-14 · 98%</span>
          </div>
        </div>
        <div className="sheet-table">
          <div className="sheet-row head">
            <span>Test</span><span>Result</span><span>Range</span>
          </div>
          {SCAN_ROWS.map((r, i) => (
            <div key={r.name} className={`sheet-row r${i}`} style={{ ['--i' as string]: i }}>
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
      <div className="scan-caption">
        <span className="dot-live" /> Textract · TABLES + QUERIES
      </div>
    </div>
  );
}
