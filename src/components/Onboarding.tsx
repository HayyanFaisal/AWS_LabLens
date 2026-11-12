/**
 * Sign-up wizard, steps 2-4 (step 1, the account, is on the AuthScreen).
 * Nothing is saved until "Finish": then PUT /profile stores it on the user's
 * DynamoDB item. If the user leaves halfway, the wizard shows again next login.
 */
import { useState } from 'react';
import { saveProfile } from '../api';
import { bmi, bmiBand, ageFrom } from '../lib/health';
import { formatDate } from '../lib/format';
import type { IdScan, Profile } from '../types';
import { SIGNUP_STEPS } from './AuthScreen';
import { emptyDraft, healthProblem, HealthFields, identityProblem, IdentityFields, IdScanner, toProfile, type Draft } from './ProfileForm';
import { Icon, Logo, Spinner } from './ui';

export default function Onboarding({ username, onDone, onSignOut }: { username: string; onDone: (p: Profile) => void; onSignOut: () => void }) {
  const [step, setStep] = useState(1); // index into SIGNUP_STEPS; 0 (Account) is already done
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const applyScan = (s: IdScan) => {
    setDraft((d) => ({
      ...d,
      fullName: s.fullName ?? d.fullName,
      dateOfBirth: s.dateOfBirth ?? d.dateOfBirth,
      sex: s.sex ?? d.sex,
      idLast4: s.idLast4 ?? d.idLast4,
      filledFromId: true,
    }));
    setApplied(true);
  };

  function next() {
    const problem = step === 1 ? identityProblem(draft) : step === 2 ? healthProblem(draft) : null;
    if (problem) return setError(problem);
    setError(null);
    setStep((s) => s + 1);
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      onDone(await saveProfile(toProfile(draft)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboard">
      <header className="onboard-top">
        <div className="brand"><Logo /><span className="brand-name">LabLens</span></div>
        <button className="btn-ghost" onClick={onSignOut}><Icon name="logout" size={16} /> Sign out</button>
      </header>

      <div className="onboard-body">
        <ol className="stepper" aria-label="Sign-up progress">
          {SIGNUP_STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'on' : ''}>
              <span className="step-num">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
              <span className="step-name">{s}</span>
            </li>
          ))}
        </ol>

        <section className="card onboard-card" key={step}>
          {step === 1 && (
            <>
              <div className="eyebrow">Step 2 of 4</div>
              <h1>Who are the reports for?</h1>
              <p className="page-sub">We use this to check that uploaded reports carry your name and to show your age next to results.</p>
              <IdScanner onApply={applyScan} />
              {applied && <div className="form-ok"><Icon name="check" size={16} /> Filled from your ID card. Check the details below.</div>}
              <div className="divider"><span>or type them in</span></div>
              <IdentityFields draft={draft} set={set} />
            </>
          )}

          {step === 2 && (
            <>
              <div className="eyebrow">Step 3 of 4</div>
              <h1>Your health profile</h1>
              <p className="page-sub">Optional, but it makes your dashboard more useful. You can change it any time.</p>
              <HealthFields draft={draft} set={set} />
            </>
          )}

          {step === 3 && <Review draft={draft} username={username} goTo={setStep} />}

          {error && <div className="form-error" role="alert"><Icon name="alert" size={16} /> {error}</div>}

          <div className="onboard-actions">
            {step > 1 ? (
              <button className="btn-ghost" onClick={() => { setError(null); setStep(step - 1); }}><Icon name="back" size={16} /> Back</button>
            ) : <span />}
            {step < 3 ? (
              <button className="btn-primary btn-lg" onClick={next}>Continue <Icon name="arrow" size={17} /></button>
            ) : (
              <button className="btn-primary btn-lg" onClick={finish} disabled={busy}>
                {busy ? <Spinner /> : <><Icon name="check" size={17} /> Finish and open dashboard</>}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Review({ draft, username, goTo }: { draft: Draft; username: string; goTo: (s: number) => void }) {
  const p = toProfile(draft);
  const b = bmi(p.heightCm, p.weightKg);
  const list = (v: string[]) => (v.length ? v.join(', ') : 'None');
  return (
    <>
      <div className="eyebrow">Step 4 of 4</div>
      <h1>Check your details</h1>
      <p className="page-sub">This is saved to your private record in Amazon DynamoDB.</p>
      <div className="review-grid">
        <div className="review-block">
          <div className="review-head"><strong>Identity</strong><button type="button" onClick={() => goTo(1)}><Icon name="edit" size={14} /> Edit</button></div>
          <dl>
            <dt>Username</dt><dd>{username}</dd>
            <dt>Full name</dt><dd>{p.fullName}</dd>
            <dt>Date of birth</dt><dd>{formatDate(p.dateOfBirth)} · {ageFrom(p.dateOfBirth)} years</dd>
            <dt>Sex</dt><dd className="cap">{p.sex}</dd>
            <dt>Phone</dt><dd>{p.phone ?? '—'}</dd>
            <dt>ID card</dt><dd>{p.idLast4 ? <>•••• {p.idLast4} <span className="chip ok">read by Textract</span></> : 'Not scanned'}</dd>
          </dl>
        </div>
        <div className="review-block">
          <div className="review-head"><strong>Health profile</strong><button type="button" onClick={() => goTo(2)}><Icon name="edit" size={14} /> Edit</button></div>
          <dl>
            <dt>Blood group</dt><dd>{p.bloodGroup === 'unknown' ? 'Not known' : p.bloodGroup}</dd>
            <dt>Height / weight</dt><dd>{p.heightCm ?? '—'} cm · {p.weightKg ?? '—'} kg</dd>
            <dt>BMI</dt><dd>{b ? <>{b} <span className={`chip ${bmiBand(b).tone}`}>{bmiBand(b).label}</span></> : '—'}</dd>
            <dt>Conditions</dt><dd>{list(p.conditions)}</dd>
            <dt>Medications</dt><dd>{list(p.medications)}</dd>
            <dt>Allergies</dt><dd>{list(p.allergies)}</dd>
          </dl>
        </div>
      </div>
    </>
  );
}
