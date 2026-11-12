/**
 * Offline tests for the health profile rules and the ID card reader.
 * Run: npm run test:profile
 */
import assert from 'node:assert/strict';
import { HttpError } from './http';
import { lastFourDigits, normaliseDob, normaliseName, normaliseSex, parseIdCard } from './idcard';
import type { TBlock } from './parser';
import { ageOn, cleanList, isRealDate, validateProfile } from './profile-rules';
import { isOwnedKey } from './rules';

const NOW = new Date('2026-11-13T10:00:00Z');
const base = { fullName: 'Ali Raza', dateOfBirth: '1990-05-20', sex: 'male' };
const rejects = (body: Record<string, unknown>, pattern: RegExp) =>
  assert.throws(() => validateProfile(body, NOW), (e) => e instanceof HttpError && e.status === 400 && pattern.test(e.message));

// ---- dates and age ----
assert.equal(isRealDate('2001-02-28'), true);
assert.equal(isRealDate('2001-02-30'), false, 'no 30th of February');
assert.equal(isRealDate('20-05-1990'), false);
assert.equal(ageOn('1990-05-20', NOW), 36);
assert.equal(ageOn('1990-11-14', NOW), 35, 'birthday tomorrow -> still 35');
assert.equal(ageOn('1990-11-13', NOW), 36, 'birthday today -> 36');

// ---- profile validation ----
{
  const p = validateProfile(
    { ...base, fullName: '  Ali   Raza ', bloodGroup: 'B+', heightCm: '175', weightKg: 78.46, conditions: ['Diabetes', ' diabetes ', '', 'Hypertension'] },
    NOW,
  );
  assert.equal(p.fullName, 'Ali Raza', 'spaces collapsed');
  assert.equal(p.heightCm, 175, 'numeric strings accepted');
  assert.equal(p.weightKg, 78.5, 'rounded to 1 decimal');
  assert.deepEqual(p.conditions, ['Diabetes', 'Hypertension'], 'empties and duplicates removed');
  assert.equal(p.bloodGroup, 'B+');
  assert.equal(p.phone, null);
  assert.equal(p.idLast4, null);
  assert.equal(validateProfile(base, NOW).bloodGroup, 'unknown', 'blood group defaults to unknown');
}
rejects({ ...base, fullName: 'A' }, /full name/);
rejects({ ...base, fullName: 'R2-D2' }, /full name/);
rejects({ ...base, dateOfBirth: '2027-01-01' }, /future/);
rejects({ ...base, dateOfBirth: '1890-01-01' }, /check the date/);
rejects({ ...base, dateOfBirth: '1990-02-31' }, /valid date/);
rejects({ ...base, sex: 'robot' }, /sex/);
rejects({ ...base, heightCm: 20 }, /Height/);
rejects({ ...base, phone: 'call me' }, /phone/);
rejects({ ...base, idLast4: '12345' }, /4 digits/);
rejects({ ...base, conditions: 'Diabetes' }, /list/);
assert.throws(() => cleanList(Array.from({ length: 16 }, (_, i) => `c${i}`), 'Conditions'), /at most 15/);
assert.throws(() => cleanList(['x'.repeat(41)], 'Allergies'), /40 characters/);

// ---- ID files must be in the caller's own ids/ folder ----
assert.equal(isOwnedKey('ids/ali/abc.jpg', 'ali', 'ids'), true);
assert.equal(isOwnedKey('ids/ali_2/abc.jpg', 'ali', 'ids'), false);
assert.equal(isOwnedKey('reports/ali/abc.jpg', 'ali', 'ids'), false, 'report folder is not the id folder');
assert.equal(isOwnedKey('ids/ali/abc.jpg', 'ali'), false, 'default folder is reports/');

// ---- ID card answer normalisation ----
assert.equal(normaliseName('ALI  RAZA'), 'Ali Raza');
assert.equal(normaliseName('Name: sara khan'), 'Sara Khan');
assert.equal(normaliseName('1234'), null);
assert.equal(normaliseSex('M'), 'male');
assert.equal(normaliseSex('Female'), 'female');
assert.equal(normaliseSex('X'), null);
assert.equal(normaliseDob('20.05.1990'), '1990-05-20', 'DD.MM.YYYY on cards');
assert.equal(normaliseDob('20 May 1990'), '1990-05-20');
assert.equal(normaliseDob('31.02.1990'), null, 'impossible date rejected');
assert.equal(lastFourDigits('35202-1234567-9'), '5679');
assert.equal(lastFourDigits('12'), null);

// ---- a fake Textract response for an ID card ----
{
  let n = 0;
  const query = (alias: string, text: string, answer: string | null, conf = 97.4): TBlock[] => {
    const qid = `q${++n}`;
    const blocks: TBlock[] = [{ Id: qid, BlockType: 'QUERY', Query: { Text: text, Alias: alias }, Relationships: [] } as TBlock];
    if (answer) {
      const aid = `a${n}`;
      blocks[0].Relationships = [{ Type: 'ANSWER', Ids: [aid] }];
      blocks.push({ Id: aid, BlockType: 'QUERY_RESULT', Text: answer, Confidence: conf } as TBlock);
    }
    return blocks;
  };
  const blocks = [
    ...query('NAME', 'name?', 'ALI RAZA'),
    ...query('DOB', 'dob?', '20.05.1990', 88.1),
    ...query('GENDER', 'gender?', 'M'),
    ...query('ID_NUMBER', 'id?', '00000-1234567-1'),
  ];
  const scan = parseIdCard(blocks);
  assert.equal(scan.fullName, 'Ali Raza');
  assert.equal(scan.dateOfBirth, '1990-05-20');
  assert.equal(scan.sex, 'male');
  assert.equal(scan.idLast4, '5671');
  assert.equal(scan.fields[1].confidence, 88.1);
  assert.ok(!JSON.stringify(scan).includes('1234567'), 'the full ID number is never returned');

  const empty = parseIdCard(query('NAME', 'name?', null));
  assert.equal(empty.fullName, null);
  assert.equal(empty.sex, null);
}

console.log('All profile tests passed.');
