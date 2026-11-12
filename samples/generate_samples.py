"""
Generates FAKE lab reports for testing/demo (fictional lab and patient).
  report-1-mar-2026.png   single page image  -> Textract sync API
  report-2-jun-2026.jpg   single page "photo" (slightly tilted) -> sync API
  report-3-sep-2026.pdf   two-page PDF       -> Textract async API
Values improve over time so the Trends chart tells a story.

Run:  python3 samples/generate_samples.py   (needs reportlab + Pillow + pdftoppm)
"""
import os
import subprocess
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from PIL import Image, ImageOps

OUT = os.path.dirname(os.path.abspath(__file__))

LAB = "Demo Diagnostics Laboratory"
PATIENT = "Ali Raza"

# name, unit, reference range, [Mar, Jun, Sep]
CBC = [
    ("Hemoglobin", "g/dL", "13.0 - 17.0", ["11.2", "12.4", "13.6"]),
    ("WBC Count", "/uL", "4,000 - 11,000", ["7,800", "8,200", "6,900"]),
    ("Platelet Count", "x10^3/uL", "150 - 400", ["450", "390", "310"]),
]
CHEM = [
    ("Fasting Blood Glucose", "mg/dL", "70 - 100", ["128", "112", "98"]),
    ("HbA1c", "%", "4.0 - 5.6", ["7.1", "6.4", "5.8"]),
    ("Serum Creatinine", "mg/dL", "0.7 - 1.3", ["1.0", "1.1", "0.9"]),
    ("ALT (SGPT)", "U/L", "7 - 56", ["62", "48", "35"]),
    ("Vitamin D (25-OH)", "ng/mL", "30 - 100", ["14", "22", "34"]),
]
LIPID = [
    ("Total Cholesterol", "mg/dL", "< 200", ["238", "215", "190"]),
    ("LDL Cholesterol", "mg/dL", "< 100", ["162", "140", "118"]),
    ("HDL Cholesterol", "mg/dL", "> 40", ["38", "42", "47"]),
    ("Triglycerides", "mg/dL", "< 150", ["210", "180", "140"]),
]

REPORTS = [
    dict(idx=0, date="14/03/2026", collected="13/03/2026", lab_no="DL-26-03114", file="report-1-mar-2026", kind="png"),
    dict(idx=1, date="16/06/2026", collected="15/06/2026", lab_no="DL-26-06277", file="report-2-jun-2026", kind="jpg"),
    dict(idx=2, date="18/09/2026", collected="17/09/2026", lab_no="DL-26-09402", file="report-3-sep-2026", kind="pdf"),
]

styles = getSampleStyleSheet()
title = ParagraphStyle("t", parent=styles["Title"], fontSize=20, textColor=colors.HexColor("#0f4c81"), spaceAfter=2)
sub = ParagraphStyle("s", parent=styles["Normal"], fontSize=9, alignment=1, textColor=colors.HexColor("#555555"))
section = ParagraphStyle("h", parent=styles["Heading3"], fontSize=11, textColor=colors.HexColor("#0f4c81"), spaceBefore=8, spaceAfter=4)
foot = ParagraphStyle("f", parent=styles["Normal"], fontSize=7.5, textColor=colors.HexColor("#888888"), alignment=1)


def header(r):
    info = Table(
        [
            ["Patient Name:", PATIENT, "Lab No:", r["lab_no"]],
            ["Age / Sex:", "34 Years / Male", "Report Date:", r["date"]],
            ["Referred By:", "Dr. Sana Malik", "Sample Collected:", r["collected"]],
        ],
        colWidths=[30 * mm, 55 * mm, 35 * mm, 45 * mm],
    )
    info.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#0f4c81")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [
        Paragraph(LAB, title),
        Paragraph("12-B Sample Road, Demo City · Tel 000-0000000 · Fictional laboratory for testing", sub),
        Spacer(1, 6 * mm),
        info,
        Spacer(1, 4 * mm),
    ]


def results_table(heading, rows, idx):
    data = [["Test Name", "Result", "Unit", "Reference Range"]]
    for name, unit, rng, vals in rows:
        data.append([name, vals[idx], unit, rng])
    t = Table(data, colWidths=[70 * mm, 28 * mm, 30 * mm, 42 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbe7f3")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#7a8fa6")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [Paragraph(heading, section), t]


def footer_block():
    return [
        Spacer(1, 8 * mm),
        Paragraph("Electronically verified. SAMPLE DOCUMENT FOR SOFTWARE TESTING – NOT A REAL MEDICAL REPORT.", foot),
    ]


def build_pdf(r, path):
    doc = SimpleDocTemplate(path, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    i = r["idx"]
    story = header(r)
    story += results_table("COMPLETE BLOOD COUNT (CBC)", CBC, i)
    story += results_table("CLINICAL BIOCHEMISTRY", CHEM, i)
    if r["kind"] == "pdf":
        story += footer_block()
        story.append(PageBreak())
        story += header(r)
    story += results_table("LIPID PROFILE", LIPID, i)
    story += footer_block()
    doc.build(story)


def main():
    for r in REPORTS:
        if r["kind"] == "pdf":
            build_pdf(r, os.path.join(OUT, r["file"] + ".pdf"))
            continue
        tmp = os.path.join(OUT, "_tmp.pdf")
        build_pdf(r, tmp)
        subprocess.run(["pdftoppm", "-r", "150", "-png", "-singlefile", tmp, os.path.join(OUT, "_tmp")], check=True)
        img = Image.open(os.path.join(OUT, "_tmp.png")).convert("RGB")
        if r["kind"] == "jpg":
            # make it look like a phone photo of a paper on a desk
            img = img.rotate(-1.5, expand=True, fillcolor=(205, 200, 190))
            img = ImageOps.expand(img, border=60, fill=(190, 184, 172))
            img.save(os.path.join(OUT, r["file"] + ".jpg"), quality=85)
        else:
            img.save(os.path.join(OUT, r["file"] + ".png"), optimize=True)
        os.remove(tmp)
        os.remove(os.path.join(OUT, "_tmp.png"))
    print("Samples written to", OUT)


if __name__ == "__main__":
    sys.exit(main())
