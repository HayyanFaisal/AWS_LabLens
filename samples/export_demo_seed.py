"""
Builds amplify/functions/api/demo-seed.json: the data behind the two demo
profiles (Ali Raza, Sara Khan) on the login screen.

For every demo document it records exactly what the sample generator printed
(lab, patient, dates and every results-table row) and where each row sits on
the page (found with pdfplumber, then adjusted for the tilted "phone photo" and
"old scan" versions). The Lambda turns these rows into reports with OUR OWN
parser rules (range parsing, LOW/NORMAL/HIGH flags, acceptance rules), so the
demo shows exactly what LabLens would show; only the Textract call is skipped.

Run:  python samples/export_demo_seed.py   (needs reportlab + pdfplumber)
"""
import json
import math
import os
import sys
import tempfile

import pdfplumber

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import generate_samples as g  # noqa: E402

OUT = os.path.join(HERE, "..", "amplify", "functions", "api", "demo-seed.json")
PNG_W, PNG_H = 1240, 1754  # A4 rendered at 150 dpi by render_png()

# file -> (story builder, how the image was made)
DOCS = {
    "report-5-dec-2025-old-scan.jpg": (lambda: g.ali_story(3, "10/12/2025", "09/12/2025", "DL-25-12051"), "scan"),
    "report-1-mar-2026.png": (lambda: g.ali_story(0, "14/03/2026", "13/03/2026", "DL-26-03114"), "png"),
    "report-2-jun-2026.jpg": (lambda: g.ali_story(1, "16/06/2026", "15/06/2026", "DL-26-06277"), "photo"),
    "report-3-sep-2026.pdf": (lambda: g.ali_story(2, "18/09/2026", "17/09/2026", "DL-26-09402", two_pages=True), "pdf"),
    "report-6-oct-2026-liver.pdf": (g.liver_story, "pdf"),
    "report-4-nov-2026-thyroid.png": (g.thyroid_story, "png"),
    "not-a-lab-report-invoice.png": (g.invoice_story, "png"),
    "report-7-sara-khan-mar-2026.png": (lambda: g.sara_story(0), "png"),
    "report-8-sara-khan-jun-2026.png": (lambda: g.sara_story(*g.SARA_EXTRA["report-8-sara-khan-jun-2026.png"]), "png"),
    "report-9-sara-khan-sep-2026.png": (lambda: g.sara_story(*g.SARA_EXTRA["report-9-sara-khan-sep-2026.png"]), "png"),
}

# ---- record what the generator prints ----
REC = {}
_orig_table, _orig_header = g.results_table, g.header


def _table(heading, head_row, rows, *a, **k):
    REC["tables"].append({"head": head_row, "rows": rows})
    return _orig_table(heading, head_row, rows, *a, **k)


def _header(lab, patient, lab_no, date_label, date, collected, *a, **k):
    REC.setdefault("header", {"lab": lab[0], "patient": patient["name"], "date": date, "collected": collected})
    REC["infoBoxes"] = REC.get("infoBoxes", 0) + 1
    return _orig_header(lab, patient, lab_no, date_label, date, collected, *a, **k)


g.results_table, g.header = _table, _header


def transform(box, kind):
    """Moves a page-fraction box the same way phone_photo()/old_scan() moved the image."""
    if kind not in ("photo", "scan"):
        return box
    angle, border = (-1.5, 60) if kind == "photo" else (0.8, 0)
    t = math.radians(angle)
    c, s = math.cos(t), math.sin(t)
    new_w = abs(PNG_W * c) + abs(PNG_H * s)
    new_h = abs(PNG_W * s) + abs(PNG_H * c)
    pts = []
    for fx, fy in ((box["left"], box["top"]), (box["left"] + box["width"], box["top"]),
                   (box["left"], box["top"] + box["height"]), (box["left"] + box["width"], box["top"] + box["height"])):
        dx, dy = fx * PNG_W - PNG_W / 2, fy * PNG_H - PNG_H / 2
        # PIL rotates counter-clockwise on screen (y axis points down)
        pts.append((dx * c + dy * s + new_w / 2 + border, -dx * s + dy * c + new_h / 2 + border))
    W, H = new_w + 2 * border, new_h + 2 * border
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return {"left": min(xs) / W, "top": min(ys) / H, "width": (max(xs) - min(xs)) / W, "height": (max(ys) - min(ys)) / H}


def find_row(pages, name):
    """Page number and box of the table row whose first cell is `name`."""
    target = name.split()
    for pno, page in enumerate(pages, start=1):
        words = page.extract_words(keep_blank_chars=False, use_text_flow=False)
        for i in range(len(words) - len(target) + 1):
            if [w["text"] for w in words[i:i + len(target)]] == target and len({round(w["top"]) for w in words[i:i + len(target)]}) == 1:
                first = words[i]
                line = [w for w in words if abs(w["top"] - first["top"]) < 3 and w["x0"] >= first["x0"] - 1]
                x0, x1 = first["x0"] - 5, max(w["x1"] for w in line) + 5
                top, bottom = min(w["top"] for w in line) - 5, max(w["bottom"] for w in line) + 5
                return pno, {
                    "left": round(x0 / page.width, 4), "top": round(top / page.height, 4),
                    "width": round((x1 - x0) / page.width, 4), "height": round((bottom - top) / page.height, 4),
                }
    return None, None


def main():
    seed = {}
    for name, (story_fn, kind) in DOCS.items():
        REC.clear()
        REC["tables"] = []
        story = story_fn()
        with tempfile.TemporaryDirectory() as tmp:
            pdf = os.path.join(tmp, "doc.pdf")
            g.build_pdf(story, pdf)
            with pdfplumber.open(pdf) as doc:
                pages = list(doc.pages)
                rows = []
                for table in REC["tables"]:
                    for r in table["rows"]:
                        if not r[0]:
                            continue
                        page, box = find_row(pages, r[0])
                        rows.append({
                            "testName": r[0], "rawValue": r[1], "unit": r[2] or None, "rangeText": r[3] or None,
                            "labFlag": r[4] if len(r) > 4 else None, "page": page,
                            "box": transform(box, kind) if box else None,
                        })
                # The invoice has no lab header: it has an info box and an items table
                head = REC.get("header", {"lab": None, "patient": None, "date": "02/11/2026", "collected": None})
                seed[name] = {
                    **head, "pages": len(pages), "mode": "async" if kind == "pdf" else "sync",
                    "tables": len(REC["tables"]) + REC.get("infoBoxes", 0) if "header" in REC else 2, "rows": rows,
                }
        print(f"  {name:36s} {len(seed[name]['rows']):3d} rows")
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(seed, f, indent=1)
        f.write("\n")
    print("Wrote", os.path.relpath(OUT))


if __name__ == "__main__":
    main()
