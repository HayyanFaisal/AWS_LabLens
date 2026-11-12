import { useState } from 'react';
import { saveProfile } from '../api';
import { formatDate } from '../lib/format';
import { ageFrom, bmi, bmiBand } from '../lib/health';
import type { IdScan, Profile } from '../types';
import { fromProfile, healthProblem, HealthFields, identityProblem, IdentityFields, IdScanner, toProfile, type Draft } from './ProfileForm';
import { Icon, PageHeader, Spinner } from './ui';

export default function ProfilePage({ username, createdAt, profile, onSaved, demo = false }: {
  demo?: boolean;
  username: string;
  createdAt: string | null;
  profile: Profile;
  onSaved: (p: Profile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => fromProfile(profile));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const applyScan = (s: IdScan) =>
    setDraft((d) => ({ ...d, fullName: s.fullName ?? d.fullName, dateOfBirth: s.dateOfBirth ?? d.dateOfBirth, sex: s.sex ?? d.sex, idLast4: s.idLast4 ?? d.idLast4, filledFromId: true }));

  async function save() {
    const problem = identityProblem(draft) ?? healthProblem(draft);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const p = await saveProfile(toProfile(draft));
      onSaved(p);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const b = bmi(profile.heightCm, profile.weightKg);
  const band = b ? bmiBand(b) : null;

  return (
    <div className="page">
      <PageHeader
        title="Health profile"
        subtitle="Stored on your private user record in Amazon DynamoDB. Used to match reports to you and to show your age next to results."
        actions={
          editing ? (
            <>
              <button className="btn-ghost" onClick={() => { setDraft(fromProfile(profile)); setEditing(false); setError(null); }}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : <><Icon name="check" size={16} /> Save changes</>}</button>
            </>
          ) : (
            <button className="btn-secondary" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Edit profile</button>
          )
        }
      />

      {saved && <div className="form-ok"><Icon name="check" size={16} /> Profile saved.</div>}
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} /> {error}</div>}

      {editing ? (
        <div className="profile-edit">
          <section className="card">
            <h2 className="card-title">Identity</h2>
            <IdScanner onApply={applyScan} />
            <IdentityFields draft={draft} set={set} />
          </section>
          <section className="card">
            <h2 className="card-title">Health details</h2>
            <HealthFields draft={draft} set={set} />
          </section>
        </div>
      ) : (
        <div className="profile-grid">
          <section className="card id-card-view">
            <div className="idv-top">
              <span className="pc-avatar lg">{profile.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
              <div>
                <h2>{profile.fullName}</h2>
                <span className="muted">@{username}</span>
              </div>
            </div>
            <dl className="facts">
              <dt>Date of birth</dt><dd>{formatDate(profile.dateOfBirth)}</dd>
              <dt>Age</dt><dd>{ageFrom(profile.dateOfBirth)} years</dd>
              <dt>Sex</dt><dd className="cap">{profile.sex}</dd>
              <dt>Phone</dt><dd>{profile.phone ?? '—'}</dd>
              <dt>ID card</dt><dd>{profile.idLast4 ? <>•••• {profile.idLast4} {demo ? <span className="chip demo">demo ID card</span> : <span className="chip ok">read by Textract</span>}</> : 'Not scanned'}</dd>
              <dt>Member since</dt><dd>{createdAt ? formatDate(createdAt) : '—'}</dd>
            </dl>
            {demo && (
              <a className="id-thumb" href={`/demo/id-card-${profile.fullName.toLowerCase().replace(/\s+/g, '-')}-specimen.jpg`} target="_blank" rel="noreferrer" title="Fictional specimen ID card used for this demo profile">
                <img src={`/demo/id-card-${profile.fullName.toLowerCase().replace(/\s+/g, '-')}-specimen.jpg`} alt="Fictional specimen ID card" />
              </a>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">Body</h2>
            <div className="body-tiles">
              <div className="body-tile"><Icon name="drop" size={20} /><small>Blood group</small><strong>{profile.bloodGroup === 'unknown' ? '—' : profile.bloodGroup}</strong></div>
              <div className="body-tile"><Icon name="ruler" size={20} /><small>Height</small><strong>{profile.heightCm ?? '—'}<em> cm</em></strong></div>
              <div className="body-tile"><Icon name="pulse" size={20} /><small>Weight</small><strong>{profile.weightKg ?? '—'}<em> kg</em></strong></div>
              <div className={`body-tile ${band ? `tone-${band.tone}` : ''}`}><Icon name="heart" size={20} /><small>BMI</small><strong>{b ?? '—'}</strong>{band && <em>{band.label}</em>}</div>
            </div>
            <ListBlock icon="heart" title="Known conditions" items={profile.conditions} />
            <ListBlock icon="pill" title="Current medications" items={profile.medications} />
            <ListBlock icon="alert" title="Allergies" items={profile.allergies} tone="warn" />
          </section>

          <section className="card privacy">
            <h2 className="card-title"><Icon name="shield" size={18} /> How your data is kept</h2>
            <ul>
              <li><strong>Profile</strong> lives on your user item in DynamoDB, readable only through your signed token.</li>
              <li><strong>ID card photos</strong> are deleted from S3 right after Textract reads them (plus a 1-day S3 lifecycle rule as a safety net). Only the last 4 digits of the number are kept.</li>
              <li><strong>Lab reports</strong> sit in your own private S3 folder, encrypted at rest, opened through 15-minute presigned links.</li>
              <li><strong>Password</strong> is stored only as a salted scrypt hash.</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function ListBlock({ icon, title, items, tone }: { icon: string; title: string; items: string[]; tone?: 'warn' }) {
  return (
    <div className="list-block">
      <span className="lb-title"><Icon name={icon} size={15} /> {title}</span>
      <div className="lb-items">
        {items.length ? items.map((t) => <span key={t} className={`tag ${tone ?? 'soft'}`}>{t}</span>) : <span className="muted small">None recorded</span>}
      </div>
    </div>
  );
}
