/**
 * Profile form pieces shared by the sign-up wizard and the Health profile page:
 * identity fields, health fields, list ("chips") input, and the ID card scanner.
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import { getIdUploadUrl, scanId, uploadToS3 } from '../api';
import { formatDate, formatMs } from '../lib/format';
import { BLOOD_GROUPS, type IdScan, type Profile, type Sex } from '../types';
import { Icon, Spinner } from './ui';

export interface Draft {
  fullName: string;
  dateOfBirth: string;
  sex: Sex | '';
  phone: string;
  bloodGroup: string;
  heightCm: string;
  weightKg: string;
  conditions: string[];
  medications: string[];
  allergies: string[];
  idLast4: string | null;
  filledFromId: boolean;
}

export const emptyDraft: Draft = {
  fullName: '', dateOfBirth: '', sex: '', phone: '', bloodGroup: 'unknown', heightCm: '', weightKg: '',
  conditions: [], medications: [], allergies: [], idLast4: null, filledFromId: false,
};

export const fromProfile = (p: Profile): Draft => ({
  fullName: p.fullName, dateOfBirth: p.dateOfBirth, sex: p.sex, phone: p.phone ?? '', bloodGroup: p.bloodGroup,
  heightCm: p.heightCm != null ? String(p.heightCm) : '', weightKg: p.weightKg != null ? String(p.weightKg) : '',
  conditions: p.conditions ?? [], medications: p.medications ?? [], allergies: p.allergies ?? [],
  idLast4: p.idLast4 ?? null, filledFromId: !!p.filledFromId,
});

export const toProfile = (d: Draft): Omit<Profile, 'completedAt' | 'updatedAt'> => ({
  fullName: d.fullName.trim(), dateOfBirth: d.dateOfBirth, sex: d.sex as Sex, phone: d.phone.trim() || null,
  bloodGroup: d.bloodGroup as Profile['bloodGroup'],
  heightCm: d.heightCm ? Number(d.heightCm) : null, weightKg: d.weightKg ? Number(d.weightKg) : null,
  conditions: d.conditions, medications: d.medications, allergies: d.allergies,
  idLast4: d.idLast4, filledFromId: d.filledFromId,
});

/** Same rules as the server (profile-rules.ts), checked early for quick feedback. */
export function identityProblem(d: Draft): string | null {
  if (!/^[\p{L}][\p{L} .'-]{1,79}$/u.test(d.fullName.trim())) return 'Please enter your full name (letters only).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth)) return 'Please enter your date of birth.';
  if (new Date(d.dateOfBirth) > new Date()) return 'Date of birth cannot be in the future.';
  if (!d.sex) return 'Please choose a sex.';
  if (d.phone.trim() && !/^\+?[\d][\d\s-]{6,19}$/.test(d.phone.trim())) return 'Please enter a valid phone number.';
  return null;
}
export function healthProblem(d: Draft): string | null {
  if (d.heightCm && (+d.heightCm < 50 || +d.heightCm > 250)) return 'Height must be between 50 and 250 cm.';
  if (d.weightKg && (+d.weightKg < 2 || +d.weightKg > 400)) return 'Weight must be between 2 and 400 kg.';
  return null;
}

type Set = <K extends keyof Draft>(key: K, value: Draft[K]) => void;

export function IdentityFields({ draft, set }: { draft: Draft; set: Set }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="form-grid">
      <label className="field span-2">
        <span>Full name</span>
        <input value={draft.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="As printed on your lab reports" autoComplete="name" />
      </label>
      <label className="field">
        <span>Date of birth</span>
        <input type="date" value={draft.dateOfBirth} max={today} onChange={(e) => set('dateOfBirth', e.target.value)} />
      </label>
      <div className="field">
        <span>Sex</span>
        <div className="seg-choice" role="radiogroup" aria-label="Sex">
          {(['female', 'male', 'other'] as const).map((s) => (
            <button type="button" key={s} role="radio" aria-checked={draft.sex === s} className={draft.sex === s ? 'on' : ''} onClick={() => set('sex', s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <label className="field span-2">
        <span>Phone <em>optional</em></span>
        <input value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+92 300 1234567" autoComplete="tel" inputMode="tel" />
      </label>
    </div>
  );
}

const CONDITION_SUGGESTIONS = ['Diabetes', 'Hypertension', 'Thyroid disorder', 'Asthma', 'High cholesterol', 'Anaemia', 'Kidney disease'];
const ALLERGY_SUGGESTIONS = ['Penicillin', 'Peanuts', 'Dust', 'Lactose', 'Seafood'];
const MED_SUGGESTIONS = ['Metformin', 'Levothyroxine', 'Atorvastatin', 'Iron supplement', 'Vitamin D'];

export function HealthFields({ draft, set }: { draft: Draft; set: Set }) {
  return (
    <div className="form-grid">
      <div className="field span-2">
        <span>Blood group</span>
        <div className="blood-grid" role="radiogroup" aria-label="Blood group">
          {BLOOD_GROUPS.map((g) => (
            <button type="button" key={g} role="radio" aria-checked={draft.bloodGroup === g} className={draft.bloodGroup === g ? 'on' : ''} onClick={() => set('bloodGroup', g)}>
              {g === 'unknown' ? "Don't know" : g}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Height <em>cm</em></span>
        <input type="number" inputMode="decimal" min={50} max={250} value={draft.heightCm} onChange={(e) => set('heightCm', e.target.value)} placeholder="175" />
      </label>
      <label className="field">
        <span>Weight <em>kg</em></span>
        <input type="number" inputMode="decimal" min={2} max={400} step="0.1" value={draft.weightKg} onChange={(e) => set('weightKg', e.target.value)} placeholder="72" />
      </label>
      <ChipInput label="Known conditions" icon="heart" values={draft.conditions} onChange={(v) => set('conditions', v)} suggestions={CONDITION_SUGGESTIONS} placeholder="Type and press Enter" />
      <ChipInput label="Current medications" icon="pill" values={draft.medications} onChange={(v) => set('medications', v)} suggestions={MED_SUGGESTIONS} placeholder="e.g. Metformin 500 mg" />
      <ChipInput label="Allergies" icon="alert" values={draft.allergies} onChange={(v) => set('allergies', v)} suggestions={ALLERGY_SUGGESTIONS} placeholder="e.g. Penicillin" />
    </div>
  );
}

export function ChipInput({
  label, icon, values, onChange, suggestions, placeholder,
}: { label: string; icon: string; values: string[]; onChange: (v: string[]) => void; suggestions: string[]; placeholder: string }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const t = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!t || values.some((v) => v.toLowerCase() === t.toLowerCase()) || values.length >= 15) return;
    onChange([...values, t]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1));
    }
  };
  const unused = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div className="field span-2">
      <span><Icon name={icon} size={14} /> {label} <em>optional</em></span>
      <div className="chip-input">
        {values.map((v) => (
          <span key={v} className="tag">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}><Icon name="x" size={12} /></button>
          </span>
        ))}
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={() => add(text)} placeholder={values.length ? '' : placeholder} />
      </div>
      {!!unused.length && (
        <div className="suggest">
          {unused.slice(0, 5).map((s) => (
            <button type="button" key={s} onClick={() => add(s)}><Icon name="plus" size={12} /> {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Scan an ID card: presigned upload to S3 (ids/<user>/), then Textract QUERIES
 * read the name, date of birth, sex and ID number. The server deletes the photo.
 */
export function IdScanner({ onApply }: { onApply: (scan: IdScan) => void }) {
  const [state, setState] = useState<'idle' | 'upload' | 'read' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [scan, setScan] = useState<IdScan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handle(file: File) {
    if (!/\.(png|jpe?g)$/i.test(file.name)) return fail('Please use a PNG or JPG photo of the card.');
    if (file.size > 5 * 1024 * 1024) return fail('The photo is larger than 5 MB.');
    setError(null);
    setScan(null);
    setPreview(URL.createObjectURL(file));
    try {
      setState('upload');
      const { uploadUrl, fileKey, contentType } = await getIdUploadUrl(file.name, file.size);
      await uploadToS3(uploadUrl, file, contentType, setProgress);
      setState('read');
      const result = await scanId(fileKey);
      setScan(result);
      setState('done');
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  }
  function fail(msg: string) {
    setError(msg);
    setState('error');
  }

  const busy = state === 'upload' || state === 'read';
  const shown = (f: IdScan['fields'][number]) =>
    f.field === 'dateOfBirth' && f.value ? formatDate(f.value) : f.field === 'sex' && f.value ? f.value[0].toUpperCase() + f.value.slice(1) : f.value;

  return (
    <div className={`id-scanner ${state}`}>
      <div className="id-head">
        <span className="id-icon"><Icon name="id" size={22} /></span>
        <div>
          <strong>Scan your ID card</strong>
          <p className="muted small">Amazon Textract reads your name, date of birth and sex. The photo is deleted right after; only the last 4 digits of the ID number are kept.</p>
        </div>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Spinner /> : <Icon name="camera" size={16} />} {state === 'done' ? 'Scan again' : 'Upload photo'}
        </button>
        <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ''; }} />
      </div>

      {(busy || state === 'done') && (
        <div className="id-body">
          {preview && (
            <div className={`id-preview ${busy ? 'scanning' : ''}`}>
              <img src={preview} alt="ID card being read" />
              {busy && <span className="scan-line" />}
            </div>
          )}
          <div className="id-results">
            {busy ? (
              <div className="id-status">
                <Spinner /> {state === 'upload' ? `Uploading to S3… ${progress}%` : 'Textract is reading the card…'}
              </div>
            ) : (
              scan && (
                <>
                  <ul className="id-fields">
                    {scan.fields.map((f, i) => (
                      <li key={f.field} style={{ ['--i' as string]: i }}>
                        <span className="muted small">{f.label}</span>
                        <strong>{shown(f) ?? <span className="muted">not found</span>}</strong>
                        {f.confidence != null && <span className={`conf-pill ${f.confidence < 90 ? 'low' : ''}`}>{Math.round(f.confidence)}%</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="id-actions">
                    <span className="muted small num">Textract QUERIES · {scan.blockCount} blocks · {formatMs(scan.textractMs)}</span>
                    <button type="button" className="btn-primary" onClick={() => onApply(scan)}>
                      <Icon name="check" size={16} /> Use these details
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} /> {error}</div>}
    </div>
  );
}
