/**
 * The health profile collected during sign-up (and editable later).
 * Validation lives here, separate from DynamoDB code, so it can be unit-tested.
 *
 * Stored on the user's item in the Users table as one map attribute "profile".
 * Privacy choices:
 *   - the ID card number is never stored, only its last 4 digits
 *   - the ID card photo itself is deleted right after Textract reads it
 */
import { HttpError } from './http';

export const SEXES = ['female', 'male', 'other'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'] as const;
export type Sex = (typeof SEXES)[number];
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const MAX_LIST_ITEMS = 15;
export const MAX_ITEM_LENGTH = 40;

export interface Profile {
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
  sex: Sex;
  phone: string | null;
  bloodGroup: BloodGroup;
  heightCm: number | null;
  weightKg: number | null;
  conditions: string[];
  medications: string[];
  allergies: string[];
  idLast4: string | null; // filled when the user scanned an ID card
  filledFromId: boolean;
}

const NAME_RE = /^[\p{L}][\p{L} .'-]{1,79}$/u;
const PHONE_RE = /^\+?[\d][\d\s-]{6,19}$/;

/** Whole years between a YYYY-MM-DD birth date and `on`. */
export function ageOn(dateOfBirth: string, on: Date = new Date()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  let age = on.getUTCFullYear() - y;
  const beforeBirthday = on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age;
}

/** True only for real calendar dates like 2001-02-28 (rejects 2001-02-30). */
export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function optionalNumber(v: unknown, field: string, min: number, max: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max)
    throw new HttpError(400, `${field} must be between ${min} and ${max}`);
  return Math.round(n * 10) / 10;
}

/** Trims, drops empties and case-insensitive duplicates, enforces limits. */
export function cleanList(v: unknown, field: string): string[] {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) throw new HttpError(400, `${field} must be a list`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') throw new HttpError(400, `${field} must be a list of text`);
    const t = item.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (t.length > MAX_ITEM_LENGTH) throw new HttpError(400, `Each item in ${field} must be at most ${MAX_ITEM_LENGTH} characters`);
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  if (out.length > MAX_LIST_ITEMS) throw new HttpError(400, `${field} can have at most ${MAX_LIST_ITEMS} items`);
  return out;
}

/** Checks a PUT /profile body and returns a clean Profile, or throws 400. */
export function validateProfile(body: Record<string, unknown>, now: Date = new Date()): Profile {
  const fullName = typeof body.fullName === 'string' ? body.fullName.replace(/\s+/g, ' ').trim() : '';
  if (!NAME_RE.test(fullName)) throw new HttpError(400, 'Please enter your full name (letters only, 2-80 characters)');

  const dateOfBirth = typeof body.dateOfBirth === 'string' ? body.dateOfBirth.trim() : '';
  if (!isRealDate(dateOfBirth)) throw new HttpError(400, 'Please enter a valid date of birth');
  const age = ageOn(dateOfBirth, now);
  if (age < 0 || new Date(dateOfBirth) > now) throw new HttpError(400, 'Date of birth cannot be in the future');
  if (age > 120) throw new HttpError(400, 'Please check the date of birth');

  const sex = body.sex as Sex;
  if (!SEXES.includes(sex)) throw new HttpError(400, 'Please choose a sex');

  let phone: string | null = null;
  if (typeof body.phone === 'string' && body.phone.trim()) {
    phone = body.phone.trim();
    if (!PHONE_RE.test(phone)) throw new HttpError(400, 'Please enter a valid phone number');
  }

  const bloodGroup = (body.bloodGroup ?? 'unknown') as BloodGroup;
  if (!BLOOD_GROUPS.includes(bloodGroup)) throw new HttpError(400, 'Unknown blood group');

  let idLast4: string | null = null;
  if (body.idLast4 !== null && body.idLast4 !== undefined && body.idLast4 !== '') {
    if (typeof body.idLast4 !== 'string' || !/^\d{4}$/.test(body.idLast4))
      throw new HttpError(400, 'idLast4 must be 4 digits');
    idLast4 = body.idLast4;
  }

  return {
    fullName,
    dateOfBirth,
    sex,
    phone,
    bloodGroup,
    heightCm: optionalNumber(body.heightCm, 'Height (cm)', 50, 250),
    weightKg: optionalNumber(body.weightKg, 'Weight (kg)', 2, 400),
    conditions: cleanList(body.conditions, 'Conditions'),
    medications: cleanList(body.medications, 'Medications'),
    allergies: cleanList(body.allergies, 'Allergies'),
    idLast4,
    filledFromId: body.filledFromId === true,
  };
}
