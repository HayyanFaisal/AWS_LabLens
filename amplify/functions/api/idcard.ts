/**
 * Reading an identity card with Textract QUERIES (no tables needed).
 * We ask four plain-English questions and normalise the answers so they can
 * pre-fill the sign-up form. The full ID number is never returned or stored:
 * only its last 4 digits.
 */
import { normalizeDate, readQueries, type TBlock } from './parser';
import { isRealDate } from './profile-rules';

export const ID_QUERIES = [
  { alias: 'NAME', text: 'What is the name of the card holder?' },
  { alias: 'DOB', text: 'What is the date of birth?' },
  { alias: 'GENDER', text: 'What is the gender?' },
  { alias: 'ID_NUMBER', text: 'What is the identity card number?' },
] as const;

export interface IdField {
  field: 'fullName' | 'dateOfBirth' | 'sex' | 'idLast4';
  label: string;
  value: string | null;
  raw: string | null; // what Textract read (ID number masked)
  confidence: number | null;
}

export interface IdScan {
  fullName: string | null;
  dateOfBirth: string | null;
  sex: 'male' | 'female' | null;
  idLast4: string | null;
  fields: IdField[];
}

/** "ALI  RAZA" -> "Ali Raza" */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function normaliseName(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.replace(/^(name|holder)\s*[:-]?\s*/i, '').replace(/[^\p{L} .'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= 80 ? titleCase(s) : null;
}

export function normaliseSex(raw: string | null): 'male' | 'female' | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (/^(m|male|man)\b/.test(s)) return 'male';
  if (/^(f|female|woman)\b/.test(s)) return 'female';
  return null;
}

export function lastFourDigits(raw: string | null): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(-4) : null;
}

export function normaliseDob(raw: string | null): string | null {
  const d = normalizeDate(raw);
  return d && isRealDate(d) ? d : null;
}

export function parseIdCard(blocks: TBlock[]): IdScan {
  const { answers } = readQueries(blocks);
  const a = (alias: string) => answers[alias] ?? { answer: null, confidence: null };

  const fullName = normaliseName(a('NAME').answer);
  const dateOfBirth = normaliseDob(a('DOB').answer);
  const sex = normaliseSex(a('GENDER').answer);
  const idLast4 = lastFourDigits(a('ID_NUMBER').answer);

  return {
    fullName,
    dateOfBirth,
    sex,
    idLast4,
    fields: [
      { field: 'fullName', label: 'Name', value: fullName, raw: a('NAME').answer, confidence: a('NAME').confidence },
      { field: 'dateOfBirth', label: 'Date of birth', value: dateOfBirth, raw: a('DOB').answer, confidence: a('DOB').confidence },
      { field: 'sex', label: 'Sex', value: sex, raw: a('GENDER').answer, confidence: a('GENDER').confidence },
      {
        field: 'idLast4',
        label: 'ID number',
        value: idLast4 ? `•••• ${idLast4}` : null,
        raw: idLast4 ? `•••• ${idLast4}` : null, // never echo the full number
        confidence: a('ID_NUMBER').confidence,
      },
    ],
  };
}
