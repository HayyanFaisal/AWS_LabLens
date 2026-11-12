/**
 * Plain-language notes about common lab tests, grouped into panels.
 * General educational text only, written for this demo; it is not medical
 * advice and does not diagnose anything. Unknown tests fall into "Other".
 */
import { testKey } from './format';

export type PanelId = 'cbc' | 'diabetes' | 'kidney' | 'liver' | 'lipids' | 'thyroid' | 'iron' | 'vitamins' | 'electrolytes' | 'other';

export interface Panel {
  id: PanelId;
  name: string;
  short: string;
  color: string; // accent used for the panel chip
}

export const PANELS: Panel[] = [
  { id: 'cbc', name: 'Blood count', short: 'CBC', color: '#e11d48' },
  { id: 'diabetes', name: 'Blood sugar', short: 'Sugar', color: '#d97706' },
  { id: 'lipids', name: 'Cholesterol & lipids', short: 'Lipids', color: '#ca8a04' },
  { id: 'kidney', name: 'Kidney function', short: 'Kidney', color: '#0891b2' },
  { id: 'liver', name: 'Liver function', short: 'Liver', color: '#16a34a' },
  { id: 'thyroid', name: 'Thyroid', short: 'Thyroid', color: '#0077b6' },
  { id: 'iron', name: 'Iron studies', short: 'Iron', color: '#9f1239' },
  { id: 'vitamins', name: 'Vitamins', short: 'Vitamins', color: '#ea580c' },
  { id: 'electrolytes', name: 'Electrolytes', short: 'Salts', color: '#0284c7' },
  { id: 'other', name: 'Other tests', short: 'Other', color: '#64748b' },
];
export const panelById = Object.fromEntries(PANELS.map((p) => [p.id, p])) as Record<PanelId, Panel>;

export interface TestInfo {
  panel: PanelId;
  about: string; // what the test measures
  high?: string; // what a high value can be associated with
  low?: string; // what a low value can be associated with
}

/** Keys are names after testKey(): lower-case letters and digits only. */
const LIB: Record<string, TestInfo> = {
  hemoglobin: { panel: 'cbc', about: 'The oxygen-carrying protein in red blood cells.', low: 'Often seen with anaemia (e.g. iron, B12 or folate deficiency, blood loss).', high: 'Can occur with dehydration, smoking or living at altitude.' },
  wbccount: { panel: 'cbc', about: 'White blood cells, the immune system cells that fight infection.', high: 'Commonly rises with infection, inflammation or stress.', low: 'Can follow viral infections or some medicines.' },
  rbccount: { panel: 'cbc', about: 'Number of red blood cells carrying oxygen.', low: 'Usually goes with anaemia.', high: 'Can occur with dehydration.' },
  plateletcount: { panel: 'cbc', about: 'Cell fragments that help blood clot.', high: 'Can rise with inflammation or iron deficiency.', low: 'Can increase bruising or bleeding tendency.' },
  mcv: { panel: 'cbc', about: 'Average size of red blood cells.', low: 'Small cells are typical of iron deficiency.', high: 'Large cells can point to B12 or folate deficiency.' },
  hematocrit: { panel: 'cbc', about: 'Share of blood volume made of red cells.', low: 'Usually goes with anaemia.', high: 'Can occur with dehydration.' },

  fastingbloodglucose: { panel: 'diabetes', about: 'Blood sugar after not eating for 8+ hours.', high: 'Raised fasting sugar can indicate prediabetes or diabetes.', low: 'Low sugar can cause shakiness or dizziness.' },
  randombloodglucose: { panel: 'diabetes', about: 'Blood sugar at any time of day.', high: 'Can indicate poorly controlled blood sugar.' },
  hba1c: { panel: 'diabetes', about: 'Average blood sugar over the last ~3 months.', high: 'Used to diagnose and monitor diabetes; lower is better controlled.' },

  totalcholesterol: { panel: 'lipids', about: 'All cholesterol carried in the blood.', high: 'Linked with higher risk of heart disease.' },
  ldlcholesterol: { panel: 'lipids', about: '"Bad" cholesterol that can build up in arteries.', high: 'A key target for lowering heart risk.' },
  hdlcholesterol: { panel: 'lipids', about: '"Good" cholesterol that helps clear fat from arteries.', low: 'Low HDL is linked with higher heart risk; exercise can raise it.' },
  triglycerides: { panel: 'lipids', about: 'A type of fat in the blood, affected by diet.', high: 'Linked with diet, alcohol, weight and diabetes.' },

  serumcreatinine: { panel: 'kidney', about: 'A waste product filtered out by the kidneys.', high: 'Can indicate reduced kidney filtering or dehydration.' },
  creatinine: { panel: 'kidney', about: 'A waste product filtered out by the kidneys.', high: 'Can indicate reduced kidney filtering or dehydration.' },
  bloodurea: { panel: 'kidney', about: 'Urea, a waste product from protein breakdown.', high: 'Can rise with dehydration, high protein intake or kidney issues.' },
  uricacid: { panel: 'kidney', about: 'A waste product from breaking down purines (in some foods).', high: 'High levels are linked with gout and kidney stones.' },

  altsgpt: { panel: 'liver', about: 'An enzyme found mainly in the liver.', high: 'Can rise when liver cells are irritated (fatty liver, medicines, alcohol, hepatitis).' },
  astsgot: { panel: 'liver', about: 'An enzyme found in the liver and muscles.', high: 'Can rise with liver or muscle injury.' },
  alkalinephosphatase: { panel: 'liver', about: 'An enzyme from the liver, bile ducts and bones.', high: 'Can rise with bile duct or bone conditions.' },
  gammagt: { panel: 'liver', about: 'A liver enzyme sensitive to alcohol and bile flow.', high: 'Often rises with alcohol use or bile duct issues.' },
  totalbilirubin: { panel: 'liver', about: 'A yellow pigment from old red cells, cleared by the liver.', high: 'High levels can cause jaundice (yellow skin or eyes).' },
  directbilirubin: { panel: 'liver', about: 'Bilirubin already processed by the liver.', high: 'Can point to bile flow problems.' },
  totalprotein: { panel: 'liver', about: 'All proteins in the blood (albumin and globulins).', low: 'Can go with poor nutrition or liver/kidney issues.' },
  albumin: { panel: 'liver', about: 'The main blood protein, made by the liver.', low: 'Can go with poor nutrition, liver or kidney conditions.' },

  tsh: { panel: 'thyroid', about: 'Pituitary hormone that tells the thyroid how hard to work.', high: 'A high TSH often means an under-active thyroid.', low: 'A low TSH often means an over-active thyroid.' },
  freet4: { panel: 'thyroid', about: 'The main hormone made by the thyroid.', low: 'Can go with an under-active thyroid.', high: 'Can go with an over-active thyroid.' },
  freet3: { panel: 'thyroid', about: 'The active form of thyroid hormone.', high: 'Can go with an over-active thyroid.' },

  serumferritin: { panel: 'iron', about: "The body's iron stores.", low: 'Low ferritin is the earliest sign of iron deficiency.', high: 'Can rise with inflammation.' },
  serumiron: { panel: 'iron', about: 'Iron currently circulating in the blood.', low: 'Often low with iron deficiency.' },

  vitamind25oh: { panel: 'vitamins', about: 'Vitamin D, important for bones, muscles and immunity.', low: 'Very common; linked with low sun exposure.' },
  vitaminb12: { panel: 'vitamins', about: 'Vitamin B12, needed for nerves and red blood cells.', low: 'Can cause anaemia, tiredness and tingling.' },

  sodium: { panel: 'electrolytes', about: 'A salt that controls fluid balance.', low: 'Can cause confusion or tiredness.', high: 'Usually linked with dehydration.' },
  potassium: { panel: 'electrolytes', about: 'A salt that keeps nerves and heart rhythm steady.', low: 'Can cause cramps or weakness.', high: 'Very high levels can affect the heart rhythm.' },
};

export function testInfo(name: string): TestInfo {
  const k = testKey(name);
  if (LIB[k]) return LIB[k];
  // loose match: "Haemoglobin (Hb)" -> hemoglobin, "Vitamin D" -> vitamind25oh
  const hit = Object.keys(LIB).find((key) => k.includes(key) || key.includes(k));
  if (hit && k.length >= 3) return LIB[hit];
  if (k.includes('haemoglobin')) return LIB.hemoglobin;
  return { panel: 'other', about: 'No description available for this test yet.' };
}

export const panelOf = (name: string): Panel => panelById[testInfo(name).panel];
