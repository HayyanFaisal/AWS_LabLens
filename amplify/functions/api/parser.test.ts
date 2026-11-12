/**
 * Offline test for the Textract parser. Builds fake Textract blocks that look
 * like a real lab report response and checks the extracted results.
 * Run: npm run test:parser
 */
import assert from 'node:assert/strict';
import {
  parseTextract,
  parseRange,
  parseNumber,
  normalizeDate,
  computeFlag,
  unionBox,
  type TBlock,
} from './parser';

let n = 0;
const id = () => `b${++n}`;

function makeTable(rows: string[][], page: number, blocks: TBlock[]) {
  const cellIds: string[] = [];
  rows.forEach((row, r) =>
    row.forEach((text, c) => {
      const wordIds = text
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => {
          const wid = id();
          blocks.push({ Id: wid, BlockType: 'WORD', Text: w, Confidence: 99, Page: page });
          return wid;
        });
      const cid = id();
      cellIds.push(cid);
      blocks.push({
        Id: cid,
        BlockType: 'CELL',
        RowIndex: r + 1,
        ColumnIndex: c + 1,
        Confidence: 95,
        Page: page,
        Relationships: wordIds.length ? [{ Type: 'CHILD', Ids: wordIds }] : [],
      });
    }),
  );
  blocks.push({ Id: id(), BlockType: 'TABLE', Page: page, Relationships: [{ Type: 'CHILD', Ids: cellIds }] });
}

function makeQuery(alias: string, question: string, answer: string, blocks: TBlock[]) {
  const aid = id();
  blocks.push({ Id: aid, BlockType: 'QUERY_RESULT', Text: answer, Confidence: 97.26 });
  blocks.push({
    Id: id(),
    BlockType: 'QUERY',
    Query: { Alias: alias, Text: question },
    Relationships: [{ Type: 'ANSWER', Ids: [aid] }],
  });
}

// ---- unit helpers ----
assert.deepEqual(parseRange('13.0 - 17.0'), { low: 13, high: 17 });
assert.deepEqual(parseRange('0.5 to 1.2'), { low: 0.5, high: 1.2 });
assert.deepEqual(parseRange('4,000 – 11,000'), { low: 4000, high: 11000 });
assert.deepEqual(parseRange('< 200'), { low: null, high: 200 });
assert.deepEqual(parseRange('Up to 5.7'), { low: null, high: 5.7 });
assert.deepEqual(parseRange('> 40'), { low: 40, high: null });
assert.deepEqual(parseRange('See note'), { low: null, high: null });
assert.equal(parseNumber('1,250'), 1250);
assert.equal(parseNumber('13.5 H'), 13.5);
assert.equal(parseNumber('Negative'), null);
assert.equal(normalizeDate('12/03/2026'), '2026-03-12');
assert.equal(normalizeDate('03/25/2026'), '2026-03-25');
assert.equal(normalizeDate('12-Mar-2026'), '2026-03-12');
assert.equal(normalizeDate('March 12, 2026'), '2026-03-12');
assert.equal(normalizeDate('2026-03-12'), '2026-03-12');
assert.equal(computeFlag(11.2, 13, 17), 'LOW');
assert.equal(computeFlag(240, null, 200), 'HIGH');
assert.equal(computeFlag(55, 40, null), 'NORMAL');
assert.equal(computeFlag(3, null, null, 'H'), 'HIGH');
assert.equal(computeFlag(3, null, null, ''), 'UNKNOWN');

// ---- full two-page report ----
const blocks: TBlock[] = [
  { Id: id(), BlockType: 'PAGE', Page: 1 },
  { Id: id(), BlockType: 'PAGE', Page: 2 },
];
makeQuery('PATIENT_NAME', 'What is the patient name?', 'Ali Raza', blocks);
makeQuery('REPORT_DATE', 'What is the report date?', '14/09/2026', blocks);
makeQuery('LAB_NAME', 'What is the name of the laboratory?', 'Crescent Diagnostic Laboratory', blocks);

makeTable(
  [
    ['Complete Blood Count', '', '', ''],
    ['Test Name', 'Result', 'Unit', 'Reference Range'],
    ['Hemoglobin', '11.2', 'g/dL', '13.0 - 17.0'],
    ['WBC Count', '7,800', '/uL', '4,000 - 11,000'],
    ['Platelets', '450', 'x10^3/uL', '150 - 400'],
    ['HAEMATOLOGY', '', '', ''],
  ],
  1,
  blocks,
);
// patient info box repeated at the top of page 2: must NOT become test results
makeTable(
  [
    ['Patient Name:', 'Ali Raza', 'Lab No:', 'DL-26-09402'],
    ['Age / Sex:', '34 Years / Male', 'Report Date:', '18/09/2026'],
    ['Referred By:', 'Dr. Sana Malik', 'Sample Collected:', '17/09/2026'],
  ],
  2,
  blocks,
);
// page 2 table has no header row: should reuse page 1's column layout
makeTable(
  [
    ['Total Cholesterol', '238', 'mg/dL', '< 200'],
    ['HDL Cholesterol', '52', 'mg/dL', '> 40'],
    ['Urine Sugar', 'Negative', '', 'Negative'],
  ],
  2,
  blocks,
);

const out = parseTextract(blocks, 'async');
console.log(JSON.stringify(out, null, 2));

assert.equal(out.patientName, 'Ali Raza');
assert.equal(out.labName, 'Crescent Diagnostic Laboratory');
assert.equal(out.reportDate, '2026-09-14');
assert.equal(out.pages, 2);
assert.equal(out.tables, 3);
assert.ok(!out.tests.some((t) => t.testName.includes('Age')), 'info box leaked into results');
assert.equal(out.tests.length, 5);
const byName = Object.fromEntries(out.tests.map((t) => [t.testName, t]));
assert.equal(byName['Hemoglobin'].flag, 'LOW');
assert.equal(byName['WBC Count'].value, 7800);
assert.equal(byName['WBC Count'].flag, 'NORMAL');
assert.equal(byName['Platelets'].flag, 'HIGH');
assert.equal(byName['Total Cholesterol'].flag, 'HIGH');
assert.equal(byName['Total Cholesterol'].page, 2);
assert.equal(byName['HDL Cholesterol'].flag, 'NORMAL');
assert.equal(byName['Hemoglobin'].unit, 'g/dL');

// ---- bounding boxes (used to draw boxes over the original image) ----
assert.deepEqual(
  unionBox([
    { left: 0.1, top: 0.2, width: 0.2, height: 0.05 },
    { left: 0.3, top: 0.2, width: 0.1, height: 0.06 },
    null,
  ]),
  { left: 0.1, top: 0.2, width: 0.3, height: 0.06 },
);
assert.equal(unionBox([null, undefined]), null);
assert.equal(byName['Hemoglobin'].box, null, 'no Geometry in input -> no box');

const geoBlocks: TBlock[] = [{ Id: id(), BlockType: 'PAGE', Page: 1 }];
makeTable(
  [
    ['Test', 'Result', 'Unit', 'Reference Range'],
    ['HbA1c', '7.1', '%', '4.0 - 5.6'],
  ],
  1,
  geoBlocks,
);
for (const b of geoBlocks) {
  if (b.BlockType !== 'CELL') continue;
  // every cell is 0.2 wide and 0.04 tall; columns start at x=0.1, rows at y=0.3
  b.Geometry = {
    BoundingBox: {
      Left: 0.1 + (b.ColumnIndex! - 1) * 0.2,
      Top: 0.3 + (b.RowIndex! - 1) * 0.04,
      Width: 0.2,
      Height: 0.04,
    },
  };
}
const geo = parseTextract(geoBlocks, 'sync');
assert.equal(geo.tests.length, 1);
assert.deepEqual(geo.tests[0].box, { left: 0.1, top: 0.34, width: 0.8, height: 0.04 });
assert.equal(geo.tests[0].flag, 'HIGH');

console.log('\nAll parser tests passed.');
