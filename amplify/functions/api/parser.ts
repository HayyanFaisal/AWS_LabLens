/**
 * Turns Amazon Textract's raw "Blocks" into clean lab test results.
 *
 * Textract returns a flat list of blocks (PAGE, LINE, WORD, TABLE, CELL,
 * QUERY, QUERY_RESULT ...) linked together by IDs. This file:
 *   1. rebuilds each TABLE as rows and columns of text,
 *   2. finds the header row (Test / Result / Unit / Reference Range),
 *   3. converts every data row into a test result with a LOW/NORMAL/HIGH flag,
 *   4. reads the answers to our Queries (patient name, report date, lab name).
 *
 * It has no AWS dependencies, so it can be unit tested offline.
 */

// Minimal shape of a Textract block (compatible with @aws-sdk/client-textract Block)
export interface TBlock {
  Id?: string;
  BlockType?: string;
  Text?: string;
  Confidence?: number;
  RowIndex?: number;
  ColumnIndex?: number;
  Page?: number;
  Query?: { Text?: string; Alias?: string };
  Relationships?: { Type?: string; Ids?: string[] }[];
  /** Position on the page as fractions (0..1) of page width/height. */
  Geometry?: { BoundingBox?: { Left?: number; Top?: number; Width?: number; Height?: number } };
}

/** Where a test row sits on its page, as fractions of the page (0..1). */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Flag = 'LOW' | 'NORMAL' | 'HIGH' | 'UNKNOWN';

export interface ExtractedTest {
  testName: string;
  value: number | null;
  rawValue: string | null;
  unit: string | null;
  rangeText: string | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  flag: Flag;
  confidence: number | null;
  page: number | null;
  /** Union of the row's cells: lets the UI draw a box over the original image. */
  box?: Box | null;
}

export interface QueryAnswer {
  question: string | null;
  answer: string | null;
  confidence: number | null;
}

export interface ExtractionResult {
  patientName: string | null;
  labName: string | null;
  reportDate: string | null;
  pages: number;
  mode: string;
  tables: number;
  queryAnswers: QueryAnswer[];
  tests: ExtractedTest[];
}

/** Natural-language questions sent to Textract's Queries feature. */
export const QUERIES = [
  { alias: 'PATIENT_NAME', text: 'What is the patient name?' },
  { alias: 'REPORT_DATE', text: 'What is the report date?' },
  { alias: 'COLLECTION_DATE', text: 'What is the sample collection date?' },
  { alias: 'LAB_NAME', text: 'What is the name of the laboratory?' },
] as const;

// ---------- helpers ----------

const clean = (s: string | null | undefined) =>
  (s ?? '').replace(/\s+/g, ' ').trim();

function childIds(block: TBlock, type = 'CHILD'): string[] {
  return (block.Relationships ?? [])
    .filter((r) => r.Type === type)
    .flatMap((r) => r.Ids ?? []);
}

function textOf(block: TBlock, index: Map<string, TBlock>): string {
  return clean(
    childIds(block)
      .map((id) => index.get(id))
      .filter((b): b is TBlock => !!b && b.BlockType === 'WORD')
      .map((b) => b.Text ?? '')
      .join(' '),
  );
}

/** First number in a string: "13.5 H" -> 13.5, "1,250" -> 1250, "<0.5" -> 0.5 */
export function parseNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** "13.0 - 17.0", "0.5 to 1.2", "< 200", "> 40", "Up to 5.0" -> {low, high} */
export function parseRange(raw: string | null | undefined): {
  low: number | null;
  high: number | null;
} {
  const s = clean(raw).replace(/,/g, '').replace(/[–—]/g, '-');
  if (!s) return { low: null, high: null };
  const num = '(\\d*\\.?\\d+)';

  const between = s.match(new RegExp(`${num}\\s*(?:-|to)\\s*${num}`, 'i'));
  if (between) return { low: Number(between[1]), high: Number(between[2]) };

  // Textract sometimes drops a thin dash: "13.0 - 17.0" comes back as "13.0 17.0".
  // Two numbers and nothing else, rising, is still a low-high range.
  const pair = s.match(new RegExp(`^${num}\\s+${num}$`));
  if (pair && Number(pair[1]) < Number(pair[2])) return { low: Number(pair[1]), high: Number(pair[2]) };

  const upper = s.match(
    new RegExp(`^(?:<=?|≤|less than|up\\s*to|upto|below)\\s*${num}`, 'i'),
  );
  if (upper) return { low: null, high: Number(upper[1]) };

  const lower = s.match(
    new RegExp(`^(?:>=?|≥|more than|greater than|above)\\s*${num}`, 'i'),
  );
  if (lower) return { low: Number(lower[1]), high: null };

  return { low: null, high: null };
}

export function computeFlag(
  value: number | null,
  low: number | null,
  high: number | null,
  labFlag?: string | null,
): Flag {
  if (value !== null && (low !== null || high !== null)) {
    if (low !== null && value < low) return 'LOW';
    if (high !== null && value > high) return 'HIGH';
    return 'NORMAL';
  }
  // No usable range: fall back to the lab's own H / L marker if printed
  const f = clean(labFlag).toUpperCase();
  if (f.startsWith('H')) return 'HIGH';
  if (f.startsWith('L')) return 'LOW';
  if (f.startsWith('N')) return 'NORMAL';
  return 'UNKNOWN';
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;

/** Normalises common report date formats to YYYY-MM-DD (assumes DD/MM/YYYY). */
export function normalizeDate(raw: string | null | undefined): string | null {
  const s = clean(raw);
  if (!s) return null;
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]) ?? s;

  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [d, mo] = [+m[1], +m[2]];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // clearly MM/DD/YYYY
    let y = +m[3];
    if (y < 100) y += 2000;
    return iso(y, mo, d) ?? s;
  }

  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,})[\s,-]+(\d{4})/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()])
    return iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]) ?? s;

  m = s.match(/([A-Za-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()])
    return iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]) ?? s;

  return s;
}

// ---------- tables ----------

interface Grid {
  page: number;
  rows: { text: string[]; conf: number[]; boxes: (Box | null)[] }[];
}

function boxOf(block: TBlock): Box | null {
  const b = block.Geometry?.BoundingBox;
  if (!b || b.Left == null || b.Top == null || b.Width == null || b.Height == null) return null;
  return { left: b.Left, top: b.Top, width: b.Width, height: b.Height };
}

/** Smallest box containing all given boxes (null if none have geometry). */
export function unionBox(boxes: (Box | null | undefined)[]): Box | null {
  const valid = boxes.filter((b): b is Box => !!b);
  if (!valid.length) return null;
  const left = Math.min(...valid.map((b) => b.left));
  const top = Math.min(...valid.map((b) => b.top));
  const right = Math.max(...valid.map((b) => b.left + b.width));
  const bottom = Math.max(...valid.map((b) => b.top + b.height));
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  return { left: r4(left), top: r4(top), width: r4(right - left), height: r4(bottom - top) };
}

function buildGrids(blocks: TBlock[], index: Map<string, TBlock>): Grid[] {
  return blocks
    .filter((b) => b.BlockType === 'TABLE')
    .map((table) => {
      const rows: Grid['rows'] = [];
      for (const id of childIds(table)) {
        const cell = index.get(id);
        if (!cell || cell.BlockType !== 'CELL') continue;
        const r = (cell.RowIndex ?? 1) - 1;
        const c = (cell.ColumnIndex ?? 1) - 1;
        rows[r] ??= { text: [], conf: [], boxes: [] };
        rows[r].text[c] = textOf(cell, index);
        rows[r].conf[c] = cell.Confidence ?? 0;
        rows[r].boxes[c] = boxOf(cell);
      }
      const width = Math.max(0, ...rows.filter(Boolean).map((r) => r.text.length));
      const filled = rows
        .filter(Boolean)
        .map((r) => ({
          text: Array.from({ length: width }, (_, i) => r.text[i] ?? ''),
          conf: Array.from({ length: width }, (_, i) => r.conf[i] ?? 0),
          boxes: Array.from({ length: width }, (_, i) => r.boxes[i] ?? null),
        }));
      return { page: table.Page ?? 1, rows: filled };
    });
}

interface ColumnMap {
  test: number;
  value: number;
  unit: number;
  range: number;
  flag: number;
  width: number;
}

/** Recognises a header row like "Test | Result | Unit | Reference Range". */
export function mapHeader(cells: string[]): ColumnMap | null {
  const map: ColumnMap = { test: -1, value: -1, unit: -1, range: -1, flag: -1, width: cells.length };
  cells.forEach((raw, i) => {
    const h = raw.toLowerCase();
    if (!h) return;
    if (map.unit < 0 && /\bunits?\b|\buom\b/.test(h)) map.unit = i;
    else if (map.range < 0 && /range|reference|normal|\bref\b|biological|interval/.test(h)) map.range = i;
    else if (map.value < 0 && /result|value|observed|reading|your/.test(h)) map.value = i;
    else if (map.flag < 0 && /flag|status|remark|indicator/.test(h)) map.flag = i;
    else if (map.test < 0 && /test|investigation|parameter|analyte|description|name|examination/.test(h)) map.test = i;
  });
  return map.test >= 0 && map.value >= 0 ? map : null;
}

function rowToTest(
  row: Grid['rows'][number],
  map: ColumnMap,
  page: number,
): ExtractedTest | null {
  const get = (i: number) => (i >= 0 ? clean(row.text[i]) : '');
  const testName = get(map.test);
  const rawValue = get(map.value);
  if (!testName || !rawValue) return null; // section headings, blank rows
  if (testName.endsWith(':')) return null; // "Label: value" info rows, not tests
  const value = parseNumber(rawValue);
  if (value === null) return null; // qualitative results ("Negative") skipped

  const rangeText = get(map.range) || null;
  const { low, high } = parseRange(rangeText);
  const used = [map.test, map.value, map.unit, map.range].filter((i) => i >= 0);
  const confidence =
    used.reduce((sum, i) => sum + (row.conf[i] ?? 0), 0) / Math.max(1, used.length);

  return {
    testName,
    value,
    rawValue,
    unit: get(map.unit) || null,
    rangeText,
    rangeLow: low,
    rangeHigh: high,
    flag: computeFlag(value, low, high, get(map.flag)),
    confidence: Math.round(confidence * 10) / 10,
    page,
    box: unionBox(row.boxes),
  };
}

// ---------- queries ----------

/**
 * Collects Textract Queries results: each QUERY block points (via an ANSWER
 * relationship) to QUERY_RESULT blocks; we keep the most confident answer.
 * Also used for ID cards (idcard.ts).
 */
export function readQueries(
  blocks: TBlock[],
  index: Map<string, TBlock> = new Map(blocks.filter((b) => b.Id).map((b) => [b.Id!, b])),
): { answers: Record<string, QueryAnswer>; queryAnswers: QueryAnswer[] } {
  const answers: Record<string, QueryAnswer> = {};
  const queryAnswers: QueryAnswer[] = [];
  for (const q of blocks.filter((b) => b.BlockType === 'QUERY')) {
    const best = childIds(q, 'ANSWER')
      .map((id) => index.get(id))
      .filter((b): b is TBlock => !!b)
      .sort((a, b) => (b.Confidence ?? 0) - (a.Confidence ?? 0))[0];
    const qa: QueryAnswer = {
      question: q.Query?.Text ?? null,
      answer: best ? clean(best.Text) : null,
      confidence: best?.Confidence != null ? Math.round(best.Confidence * 10) / 10 : null,
    };
    queryAnswers.push(qa);
    if (q.Query?.Alias) answers[q.Query.Alias] = qa;
  }
  return { answers, queryAnswers };
}

// ---------- main entry ----------

export function parseTextract(blocks: TBlock[], mode: string): ExtractionResult {
  const index = new Map<string, TBlock>();
  for (const b of blocks) if (b.Id) index.set(b.Id, b);

  // 1) Queries -> patient name, dates, lab name
  const { answers, queryAnswers } = readQueries(blocks, index);

  // 2) Tables -> test results
  const tests: ExtractedTest[] = [];
  const grids = buildGrids(blocks, index);
  let lastMap: ColumnMap | null = null;
  for (const grid of grids) {
    let map: ColumnMap | null = null;
    let start = 0;
    // header is usually the first row, but allow a title row above it
    for (let r = 0; r < Math.min(3, grid.rows.length); r++) {
      map = mapHeader(grid.rows[r].text);
      if (map) {
        start = r + 1;
        break;
      }
    }
    // Table continued from the previous page without its own header.
    // Only accept it if it really looks like results: same column count and
    // most rows have a number in the value column (rejects "Patient Name:" boxes).
    if (!map && lastMap && grid.rows[0]?.text.length === lastMap.width) {
      const numeric = grid.rows.filter((r) => parseNumber(r.text[lastMap!.value]) !== null).length;
      if (numeric / Math.max(1, grid.rows.length) >= 0.5) map = lastMap;
    }
    if (!map) continue;
    lastMap = map;
    for (const row of grid.rows.slice(start)) {
      const t = rowToTest(row, map, grid.page);
      if (t) tests.push(t);
    }
  }

  const pages = blocks.filter((b) => b.BlockType === 'PAGE').length || 1;
  const rawDate = answers.REPORT_DATE?.answer || answers.COLLECTION_DATE?.answer || null;

  return {
    patientName: answers.PATIENT_NAME?.answer || null,
    labName: answers.LAB_NAME?.answer || null,
    reportDate: normalizeDate(rawDate),
    pages,
    mode,
    tables: grids.length,
    queryAnswers,
    tests,
  };
}
