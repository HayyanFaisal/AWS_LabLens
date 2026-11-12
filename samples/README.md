# Sample lab reports (all fictional)

Every file here is **made up** for software testing: fictional labs, fictional patients.
Regenerate them with `python samples/generate_samples.py` (needs `reportlab`, `Pillow` and `pdftoppm`).

## What LabLens accepts

The rules live in [`amplify/functions/api/rules.ts`](../amplify/functions/api/rules.ts).

**File rules**: checked *before* Textract runs, so a bad file costs nothing.

| Rule | Limit |
|---|---|
| File type | PNG, JPG/JPEG, PDF (multi-page OK), TIFF |
| File size | at most 10 MB |
| Reports per user | at most 50 |
| Location | the file must be in the caller's own S3 folder `reports/<username>/` (ownership check) |

**Content rules**: checked on what Textract found.

| Rule | Why |
|---|---|
| At least 1 table | results are read from tables, not loose text |
| A header row with a **test-name** column (Test / Investigation / Parameter …) and a **result** column (Result / Value / Observed …) | tells `parser.ts` which column is which |
| At least **3 numeric results** | rejects random tables such as invoices or timetables |
| At least 1 printed **reference range** | without ranges nothing can be flagged LOW / NORMAL / HIGH |

A report that passes can still show **warnings**: patient name or date not found, results without a
range, or values read with under 90% confidence. A report that fails is saved with status **FAILED**
and the reason, so it shows up in *My reports* and can be deleted.

Not supported: handwritten reports, qualitative-only results ("Positive", "Non-Reactive" rows are skipped),
and age- or sex-specific ranges beyond what is printed on the report.

## The files

| # | File | Textract API | What it tests | Expected result |
|---|---|---|---|---|
| 1 | `report-1-mar-2026.png` | sync | Clean standard layout (Test Name / Result / Unit / Reference Range), DD/MM/YYYY date | 12 tests, 10 out of range |
| 2 | `report-2-jun-2026.jpg` | sync | "Phone photo": tilted paper on a desk | 12 tests, 7 out of range |
| 3 | `report-3-sep-2026.pdf` | **async** | 2-page PDF, header box repeated on page 2, lipid table continues on page 2 | 12 tests, 2 out of range (HbA1c 5.8, LDL 118) |
| 4 | `report-4-nov-2026-thyroid.png` | sync | Different lab and layout: *Investigation / Observed Value / Units / Biological Reference Interval / Flag*, "05 Nov 2026" date, "Up to 7.0" range | 10 tests, 3 out of range (TSH, Uric Acid HIGH, Potassium LOW) |
| 5 | `report-5-dec-2025-old-scan.jpg` | sync | Grey, blurry, noisy old scan: lower confidence | 12 tests, 10 out of range; may show low-confidence warnings |
| 6 | `report-6-oct-2026-liver.pdf` | **async** | Single-page PDF, *Parameter / Normal Range* headers, "22-Oct-2026" date, qualitative serology rows skipped | 8 tests, 1 out of range (Gamma GT HIGH) |
| 7 | `report-7-sara-khan-mar-2026.png` | sync | **Second patient** (use with a second account), "Mar 08, 2026" US-style date, *Ref. Range* header | 8 tests, 6 out of range |
| 8 | `not-a-lab-report-invoice.png` | sync | A shop invoice with a table | **Rejected**: "does not look like a lab report" |

Expected counts are what the rules should produce if Textract reads every cell correctly; small
differences on the noisy scan are normal and are exactly what the confidence warnings are for.

## Suggested demo set

- **Pre-load** (before the presentation) on the demo account: #5 (Dec 2025), #1 (Mar), #2 (Jun), #6 (Oct liver).
- **Upload live**: #3 (2-page PDF, shows the async job) and #4 (different layout), then #8 to show a rejection.
- **Trends** then shows HbA1c 7.6 → 7.1 → 6.4 → 5.8 → 5.6 across five reports.
- Use #7 on Ali's account to show that each user only sees their own reports.

## ID card for the sign-up "Scan your ID card" step

| File | What it is | Expected result |
|---|---|---|
| `id-card-ali-raza-specimen.jpg` | Fictional "Demoland" identity card, marked SPECIMEN, photographed slightly tilted | Textract QUERIES fill **Name: Ali Raza**, **Date of birth: 20 May 1990**, **Sex: Male**, ID number shown only as **•••• 5671** |

Regenerate it with `python samples/generate_samples.py id`. The name matches the demo
reports, so after sign-up every Ali Raza report shows "matches profile", while the
Sara Khan report (#7) is marked "different person".
