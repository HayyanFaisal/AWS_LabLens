"""
Demo people for the login screen: realistic-looking but FICTIONAL lab reports
and CNIC-style specimen ID cards for the LabLens team demo.

  - The laboratories are invented (no real hospital or lab is named or imitated).
  - Every document says DEMO / SPECIMEN; ID numbers are dummy "00000-..." numbers.
  - All values are made up for the demo story of each person.

Writes:  samples/people/*.png|jpg|pdf   (also copied to public/demo/)
         amplify/functions/api/demo-seed.json  (rows + positions for the API)

Run:  python samples/generate_demo_people.py   (needs reportlab, Pillow, pdfplumber, pdftoppm)
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

import pdfplumber
from PIL import Image, ImageDraw, ImageFont, ImageOps
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import code128, qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import export_demo_seed as seedlib  # noqa: E402  (find_row, transform)
import generate_samples as old  # noqa: E402  (phone_photo, old_scan)

OUT = os.path.join(HERE, "people")
PUBLIC = os.path.join(HERE, "..", "public", "demo")
SEED_OUT = os.path.join(HERE, "..", "amplify", "functions", "api", "demo-seed.json")
W, H = A4

# ---------------------------------------------------------------------------
# Fictional laboratories
# ---------------------------------------------------------------------------
LABS = {
    "ravi": dict(
        name="Ravi Reference Laboratory", tag="Pathology · Clinical Chemistry · Haematology · Immunology",
        addr="22-C Canal Bank Road, Lahore · UAN 042-000-0000 · ravi-lab.example", color="#0b5d8f", soft="#e3f0f8",
        doctor="Dr. Ayesha Malik", quals="MBBS, FCPS (Chemical Pathology) · Consultant Pathologist"),
    "kohsar": dict(
        name="Kohsar Diagnostic Centre", tag="Laboratory Medicine · Endocrinology · Bone & Mineral",
        addr="Plot 14, Jinnah Avenue, Islamabad · 051-000-0000 · kohsar-diagnostics.example", color="#1b6e4a", soft="#e2f2ea",
        doctor="Dr. Usman Qureshi", quals="MBBS, MPhil (Chemical Pathology) · Head of Laboratory"),
    "clifton": dict(
        name="Clifton Pathology Services", tag="Chemistry · Hormones · Haematology · Molecular Diagnostics",
        addr="Block 5, Clifton, Karachi · 021-000-0000 · clifton-path.example", color="#7a2457", soft="#f5e4ee",
        doctor="Dr. Sana Rizvi", quals="MBBS, FCPS (Haematology) · Consultant Pathologist"),
}

# ---------------------------------------------------------------------------
# The four demo people (all values fictional)
# ---------------------------------------------------------------------------
PEOPLE = {
    "rana": dict(name="Rana Ahmad Hassan", sex="Male", dob="2002-02-11", cnic="00000-1000001-4", mr="MR-24-118204"),
    "ali": dict(name="Ali Sajjad", sex="Male", dob="2003-07-23", cnic="00000-1000002-8", mr="MR-25-220931"),
    "hayyan": dict(name="Hayyan Faisal", sex="Male", dob="2004-03-15", cnic="00000-1000003-2", mr="MR-25-301477"),
    "ammar": dict(name="Muhammad Ammar", sex="Male", dob="2003-11-02", cnic="00000-1000004-6", mr="MR-24-190552"),
}

R = lambda test, value, unit, rng, flag="": (test, value, unit, rng, flag)  # noqa: E731

CBC_OK = [R("Haemoglobin", "15.1", "g/dL", "13.0 - 17.0"), R("Total WBC Count", "7.4", "x10^9/L", "4.0 - 11.0"),
          R("RBC Count", "5.2", "x10^12/L", "4.5 - 5.9"), R("Haematocrit (HCT)", "45.2", "%", "40 - 52"),
          R("MCV", "86.9", "fL", "80 - 100"), R("Platelet Count", "262", "x10^9/L", "150 - 400")]

DOCS = [
    # ---- Rana Ahmad Hassan: prediabetes + lipids improving with diet and exercise ----
    dict(file="rana-1-feb-2026-diabetes-lipids.png", person="rana", lab="ravi", kind="png", labno="RRL-2602-10457",
         collected="14-Feb-2026 08:10", reported="14-Feb-2026 16:45", sections=[
            ("CLINICAL CHEMISTRY", "Diabetes Profile", [R("Fasting Blood Glucose", "118", "mg/dL", "70 - 99", "H"), R("HbA1c", "6.3", "%", "4.0 - 5.6", "H")]),
            ("CLINICAL CHEMISTRY", "Lipid Profile (Fasting)", [R("Total Cholesterol", "214", "mg/dL", "< 200", "H"), R("Triglycerides", "236", "mg/dL", "< 150", "H"),
                                                               R("HDL Cholesterol", "36", "mg/dL", "> 40", "L"), R("LDL Cholesterol", "132", "mg/dL", "< 100", "H")]),
         ], note="HbA1c: below 5.7% normal, 5.7-6.4% prediabetes range, 6.5% or above diabetes range (ADA)."),
    dict(file="rana-2-may-2026-followup-photo.jpg", person="rana", lab="ravi", kind="photo", labno="RRL-2605-22318",
         collected="20-May-2026 08:30", reported="20-May-2026 15:20", sections=[
            ("CLINICAL CHEMISTRY", "Diabetes Profile", [R("Fasting Blood Glucose", "108", "mg/dL", "70 - 99", "H"), R("HbA1c", "6.0", "%", "4.0 - 5.6", "H")]),
            ("CLINICAL CHEMISTRY", "Lipid Profile (Fasting)", [R("Total Cholesterol", "198", "mg/dL", "< 200"), R("Triglycerides", "184", "mg/dL", "< 150", "H"),
                                                               R("HDL Cholesterol", "39", "mg/dL", "> 40", "L"), R("LDL Cholesterol", "121", "mg/dL", "< 100", "H")]),
         ], note="Follow-up after 3 months of dietary advice."),
    dict(file="rana-3-sep-2026-annual-checkup.pdf", person="rana", lab="ravi", kind="pdf", labno="RRL-2609-31902",
         collected="02-Sep-2026 08:05", reported="02-Sep-2026 18:30", sections=[
            ("HAEMATOLOGY", "Complete Blood Count (CBC)", CBC_OK),
            ("CLINICAL CHEMISTRY", "Diabetes Profile", [R("Fasting Blood Glucose", "97", "mg/dL", "70 - 99"), R("HbA1c", "5.6", "%", "4.0 - 5.6")]),
            "PAGEBREAK",
            ("CLINICAL CHEMISTRY", "Lipid Profile (Fasting)", [R("Total Cholesterol", "182", "mg/dL", "< 200"), R("Triglycerides", "148", "mg/dL", "< 150"),
                                                               R("HDL Cholesterol", "42", "mg/dL", "> 40"), R("LDL Cholesterol", "108", "mg/dL", "< 100", "H")]),
            ("CLINICAL CHEMISTRY", "Liver Function Tests", [R("ALT (SGPT)", "44", "U/L", "10 - 50"), R("AST (SGOT)", "31", "U/L", "10 - 40"),
                                                           R("Alkaline Phosphatase", "88", "U/L", "40 - 130"), R("Total Bilirubin", "0.7", "mg/dL", "0.3 - 1.2")]),
         ], note="Annual health check. Two-page report (read with the asynchronous Textract job)."),

    # ---- Ali Sajjad: vitamin D deficiency treated with weekly D3 ----
    dict(file="ali-1-jan-2026-bone-profile.png", person="ali", lab="kohsar", kind="png", labno="KDC-2601-04412",
         collected="10-Jan-2026 09:15", reported="11-Jan-2026 12:00", sections=[
            ("HAEMATOLOGY", "Complete Blood Count (CBC)", [R("Haemoglobin", "14.2", "g/dL", "13.0 - 17.0"), R("Total WBC Count", "6.8", "x10^9/L", "4.0 - 11.0"),
                                                            R("Platelet Count", "241", "x10^9/L", "150 - 400")]),
            ("BIOCHEMISTRY", "Bone & Vitamin Profile", [R("Vitamin D (25-OH)", "11", "ng/mL", "30 - 100", "L"), R("Serum Calcium", "8.4", "mg/dL", "8.6 - 10.3", "L"),
                                                         R("Phosphorus", "3.6", "mg/dL", "2.5 - 4.5"), R("Vitamin B12", "260", "pg/mL", "200 - 900")]),
         ], note="Vitamin D: below 20 ng/mL deficient, 20-29 insufficient, 30-100 sufficient."),
    dict(file="ali-2-apr-2026-old-scan.jpg", person="ali", lab="kohsar", kind="scan", labno="KDC-2604-11870",
         collected="18-Apr-2026 09:40", reported="19-Apr-2026 11:30", sections=[
            ("BIOCHEMISTRY", "Bone & Vitamin Profile", [R("Vitamin D (25-OH)", "19", "ng/mL", "30 - 100", "L"), R("Serum Calcium", "8.9", "mg/dL", "8.6 - 10.3"),
                                                         R("Phosphorus", "3.8", "mg/dL", "2.5 - 4.5"), R("Vitamin B12", "284", "pg/mL", "200 - 900")]),
         ], note="Patient on Vitamin D3 50,000 IU weekly."),
    dict(file="ali-3-aug-2026-recovery.png", person="ali", lab="kohsar", kind="png", labno="KDC-2608-20391",
         collected="05-Aug-2026 08:50", reported="06-Aug-2026 10:15", sections=[
            ("BIOCHEMISTRY", "Bone & Vitamin Profile", [R("Vitamin D (25-OH)", "34", "ng/mL", "30 - 100"), R("Serum Calcium", "9.4", "mg/dL", "8.6 - 10.3"),
                                                         R("Phosphorus", "3.7", "mg/dL", "2.5 - 4.5"), R("Vitamin B12", "312", "pg/mL", "200 - 900")]),
            ("ENDOCRINOLOGY", "Thyroid Function", [R("TSH", "2.1", "uIU/mL", "0.4 - 4.0"), R("Free T4", "1.2", "ng/dL", "0.8 - 1.8")]),
         ]),
    dict(file="ali-4-pharmacy-receipt.png", person="ali", lab=None, kind="receipt"),

    # ---- Hayyan Faisal: healthy, everything in range ----
    dict(file="hayyan-1-mar-2026-routine.png", person="hayyan", lab="ravi", kind="png", labno="RRL-2603-14021",
         collected="09-Mar-2026 08:20", reported="09-Mar-2026 14:10", sections=[
            ("HAEMATOLOGY", "Complete Blood Count (CBC)", CBC_OK),
            ("CLINICAL CHEMISTRY", "Renal Function Tests", [R("Serum Creatinine", "0.9", "mg/dL", "0.7 - 1.3"), R("Blood Urea", "28", "mg/dL", "15 - 45"),
                                                           R("Uric Acid", "5.4", "mg/dL", "3.5 - 7.2")]),
         ]),
    dict(file="hayyan-2-sep-2026-annual.pdf", person="hayyan", lab="clifton", kind="pdf", labno="CPS-2609-08814",
         collected="21-Sep-2026 08:00", reported="21-Sep-2026 17:40", sections=[
            ("CHEMISTRY", "Diabetes & Lipids", [R("Fasting Blood Glucose", "86", "mg/dL", "70 - 99"), R("HbA1c", "5.1", "%", "4.0 - 5.6"),
                                                R("Total Cholesterol", "164", "mg/dL", "< 200"), R("Triglycerides", "102", "mg/dL", "< 150"),
                                                R("HDL Cholesterol", "52", "mg/dL", "> 40"), R("LDL Cholesterol", "91", "mg/dL", "< 100")]),
            ("HORMONES", "Thyroid Function", [R("TSH", "1.8", "uIU/mL", "0.4 - 4.0"), R("Free T4", "1.3", "ng/dL", "0.8 - 1.8")]),
            ("CHEMISTRY", "Liver Function Tests", [R("ALT (SGPT)", "24", "U/L", "10 - 50"), R("AST (SGOT)", "22", "U/L", "10 - 40"),
                                                   R("Total Bilirubin", "0.6", "mg/dL", "0.3 - 1.2")]),
         ], note="All results within reference intervals."),

    # ---- Muhammad Ammar: hypothyroidism, controlled on levothyroxine ----
    dict(file="ammar-1-feb-2026-thyroid.png", person="ammar", lab="clifton", kind="png", labno="CPS-2602-03377",
         collected="03-Feb-2026 09:00", reported="03-Feb-2026 19:05", sections=[
            ("HORMONES", "Thyroid Function", [R("TSH", "8.9", "uIU/mL", "0.4 - 4.0", "H"), R("Free T4", "0.7", "ng/dL", "0.8 - 1.8", "L"),
                                              R("Free T3", "2.4", "pg/mL", "2.3 - 4.2")]),
            ("CHEMISTRY", "Lipid Profile", [R("Total Cholesterol", "221", "mg/dL", "< 200", "H"), R("LDL Cholesterol", "138", "mg/dL", "< 100", "H"),
                                            R("HDL Cholesterol", "45", "mg/dL", "> 40")]),
            ("HAEMATOLOGY", "Complete Blood Count (CBC)", [R("Haemoglobin", "14.6", "g/dL", "13.0 - 17.0"), R("Platelet Count", "228", "x10^9/L", "150 - 400")]),
         ], note="Raised TSH with low Free T4. Clinical correlation advised."),
    dict(file="ammar-2-may-2026-photo.jpg", person="ammar", lab="clifton", kind="photo", labno="CPS-2605-12950",
         collected="12-May-2026 09:20", reported="12-May-2026 18:00", sections=[
            ("HORMONES", "Thyroid Function", [R("TSH", "5.6", "uIU/mL", "0.4 - 4.0", "H"), R("Free T4", "0.9", "ng/dL", "0.8 - 1.8"),
                                              R("Free T3", "2.9", "pg/mL", "2.3 - 4.2")]),
            ("CHEMISTRY", "Lipid Profile", [R("Total Cholesterol", "205", "mg/dL", "< 200", "H"), R("LDL Cholesterol", "124", "mg/dL", "< 100", "H"),
                                            R("HDL Cholesterol", "46", "mg/dL", "> 40")]),
         ], note="On levothyroxine 50 mcg daily."),
    dict(file="ammar-3-oct-2026-controlled.png", person="ammar", lab="clifton", kind="png", labno="CPS-2610-21704",
         collected="14-Oct-2026 08:45", reported="14-Oct-2026 17:30", sections=[
            ("HORMONES", "Thyroid Function", [R("TSH", "2.8", "uIU/mL", "0.4 - 4.0"), R("Free T4", "1.2", "ng/dL", "0.8 - 1.8"),
                                              R("Free T3", "3.3", "pg/mL", "2.3 - 4.2")]),
            ("CHEMISTRY", "Lipid Profile", [R("Total Cholesterol", "186", "mg/dL", "< 200"), R("LDL Cholesterol", "104", "mg/dL", "< 100", "H"),
                                            R("HDL Cholesterol", "48", "mg/dL", "> 40")]),
         ]),
]


def age_on(dob, date_text):
    y, m, d = map(int, dob.split("-"))
    months = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
    dd, mon, yy = date_text.split(" ")[0].split("-")
    ry, rm, rd = int(yy), months[mon], int(dd)
    return ry - y - ((rm, rd) < (m, d))


# ---------------------------------------------------------------------------
# Lab report PDF
# ---------------------------------------------------------------------------
def build_report(doc, path):
    lab = LABS[doc["lab"]]
    person = PEOPLE[doc["person"]]
    accent = colors.HexColor(lab["color"])
    soft = colors.HexColor(lab["soft"])

    def page_frame(c, d):
        c.saveState()
        # header band
        c.setFillColor(accent)
        c.rect(0, H - 30 * mm, W, 30 * mm, stroke=0, fill=1)
        # simple generic logo: white ring with a cross
        c.setFillColor(colors.white)
        c.circle(18 * mm, H - 15 * mm, 8 * mm, stroke=0, fill=1)
        c.setFillColor(accent)
        c.rect(16.6 * mm, H - 20 * mm, 2.8 * mm, 10 * mm, stroke=0, fill=1)
        c.rect(13 * mm, H - 16.4 * mm, 10 * mm, 2.8 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 17)
        c.drawString(30 * mm, H - 13 * mm, lab["name"])
        c.setFont("Helvetica", 8.5)
        c.drawString(30 * mm, H - 18.5 * mm, lab["tag"])
        c.drawString(30 * mm, H - 23 * mm, lab["addr"])
        # barcode of the lab number
        bc = code128.Code128(doc["labno"], barHeight=9 * mm, barWidth=0.24 * mm, quiet=False)
        c.setFillColor(colors.white)
        c.rect(W - 62 * mm, H - 26 * mm, 52 * mm, 20 * mm, stroke=0, fill=1)
        c.setFillColor(colors.black)
        bc.drawOn(c, W - 36 * mm - bc.width / 2, H - 19 * mm)
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 7)
        c.drawCentredString(W - 36 * mm, H - 23.5 * mm, doc["labno"])
        # footer
        c.setStrokeColor(accent)
        c.line(15 * mm, 22 * mm, W - 15 * mm, 22 * mm)
        c.setFont("Helvetica", 7.5)
        c.setFillColor(colors.HexColor("#555555"))
        c.drawString(15 * mm, 17 * mm, "This is a computer-generated report. Results relate only to the sample received.")
        c.drawRightString(W - 15 * mm, 17 * mm, f"Page {d.page}")
        c.setFillColor(colors.HexColor("#999999"))
        c.drawCentredString(W / 2, 11 * mm, "DEMO DOCUMENT · fictional laboratory and values, generated for LabLens software testing")
        # QR code "verify" box
        q = qr.QrCodeWidget(f"DEMO-VERIFY:{doc['labno']}")
        b = q.getBounds()
        size = 17 * mm
        dr = Drawing(size, size, transform=[size / (b[2] - b[0]), 0, 0, size / (b[3] - b[1]), 0, 0])
        dr.add(q)
        renderPDF.draw(dr, c, W - 33 * mm, 25 * mm)
        c.restoreState()

    lbl = ParagraphStyle("lbl", fontName="Helvetica-Bold", fontSize=8.8, leading=11)
    val = ParagraphStyle("val", fontName="Helvetica", fontSize=8.8, leading=11)
    reported_date = doc["reported"].split(" ")[0]
    info = Table([
        [Paragraph("Patient Name:", lbl), Paragraph(person["name"], val), Paragraph("Lab No:", lbl), Paragraph(doc["labno"], val)],
        [Paragraph("Age / Gender:", lbl), Paragraph(f"{age_on(person['dob'], doc['collected'])} Years / {person['sex']}", val), Paragraph("MR No:", lbl), Paragraph(person["mr"], val)],
        [Paragraph("Referred By:", lbl), Paragraph("Self", val), Paragraph("Specimen:", lbl), Paragraph("Blood (Serum / EDTA)", val)],
        [Paragraph("Collected On:", lbl), Paragraph(doc["collected"], val), Paragraph("Report Date:", lbl), Paragraph(reported_date, val)],
    ], colWidths=[28 * mm, 60 * mm, 26 * mm, 66 * mm])
    info.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, accent), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fbfcfd")),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))

    story = [Spacer(1, 4 * mm), info, Spacer(1, 5 * mm)]
    head = ["Test", "Result", "Unit", "Reference Range", "Flag"]
    dept_style = ParagraphStyle("dept", fontName="Helvetica-Bold", fontSize=10, textColor=colors.white)
    title_style = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=10.5, textColor=accent, spaceBefore=2, spaceAfter=3)
    for sec in doc["sections"]:
        if sec == "PAGEBREAK":
            story += [PageBreak(), Spacer(1, 4 * mm), info, Spacer(1, 5 * mm)]
            continue
        dept, title, rows = sec
        band = Table([[Paragraph(dept, dept_style)]], colWidths=[180 * mm])
        band.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), accent), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        data = [head] + [list(r) for r in rows]
        t = Table(data, colWidths=[62 * mm, 26 * mm, 26 * mm, 48 * mm, 18 * mm])
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), soft), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9.5), ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#c9d3dd")),
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#9aa9b8")), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
        for i, r in enumerate(rows, start=1):
            if r[4]:
                style += [("FONTNAME", (1, i), (1, i), "Helvetica-Bold"), ("FONTNAME", (4, i), (4, i), "Helvetica-Bold"),
                          ("TEXTCOLOR", (4, i), (4, i), colors.HexColor("#b42318"))]
        t.setStyle(TableStyle(style))
        story.append(KeepTogether([band, Spacer(1, 2 * mm), Paragraph(title, title_style), t, Spacer(1, 5 * mm)]))

    if doc.get("note"):
        story.append(Paragraph(f"<b>Comments:</b> {doc['note']}", ParagraphStyle("n", fontName="Helvetica", fontSize=8.8, leading=12)))
    story += [Spacer(1, 8 * mm), Paragraph(
        f"<b>Electronically verified by:</b> {lab['doctor']}<br/>{lab['quals']}",
        ParagraphStyle("sig", fontName="Helvetica", fontSize=8.8, leading=12, leftIndent=95 * mm))]

    SimpleDocTemplate(path, pagesize=A4, topMargin=33 * mm, bottomMargin=45 * mm, leftMargin=15 * mm, rightMargin=15 * mm).build(
        story, onFirstPage=page_frame, onLaterPages=page_frame)
    return story


def build_receipt(path):
    """Not a lab report: a pharmacy receipt (LabLens must reject it)."""
    styles = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=18, alignment=1)
    small = ParagraphStyle("s", fontName="Helvetica", fontSize=8.5, alignment=1, textColor=colors.HexColor("#666666"))
    items = Table([
        ["Item", "Qty", "Rate", "Amount"],
        ["Vitamin D3 50,000 IU caps (4)", "1", "980", "980"],
        ["Calcium + D tablets (30)", "1", "650", "650"],
        ["Multivitamin syrup 120 ml", "1", "420", "420"],
        ["", "", "Total (Rs)", "2,050"],
    ], colWidths=[85 * mm, 18 * mm, 30 * mm, 30 * mm])
    items.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                               ("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    info = Table([["Receipt No:", "CP-26-08812", "Date:", "07/08/2026"], ["Customer:", "Ali Sajjad", "Payment:", "Cash"]],
                 colWidths=[25 * mm, 60 * mm, 20 * mm, 45 * mm])
    story = [Paragraph("City Care Pharmacy", styles), Paragraph("DEMO RECEIPT · fictional pharmacy for software testing", small),
             Spacer(1, 8 * mm), info, Spacer(1, 6 * mm), items]
    SimpleDocTemplate(path, pagesize=A4, topMargin=25 * mm).build(story)


# ---------------------------------------------------------------------------
# CNIC-style specimen card (layout inspired by a national ID card; no emblem,
# hologram, signature or real number; large SPECIMEN marking)
# ---------------------------------------------------------------------------
def font(size, bold=False):
    for name in (("arialbd.ttf" if bold else "arial.ttf"), ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def id_card(person, path):
    w, h = 1012, 638
    card = Image.new("RGB", (w, h), "#e8f3ea")
    d = ImageDraw.Draw(card)
    for x in range(-h, w, 18):  # faint guilloche-like stripes
        d.line([(x, h), (x + h, 0)], fill="#dcebdf", width=2)
    d.rectangle([0, 0, w, 96], fill="#0f5c3a")
    d.text((34, 16), "NATIONAL IDENTITY CARD", font=font(36, True), fill="white")
    d.text((36, 60), "SPECIMEN FOR SOFTWARE DEMO · NOT A VALID DOCUMENT", font=font(19, True), fill="#cfe9d8")
    d.rounded_rectangle([w - 280, 118, w - 40, 418], radius=14, fill="#d3e4d7", outline="#8fb59a", width=2)
    d.ellipse([w - 215, 150, w - 105, 260], fill="#9fbca8")
    d.rounded_rectangle([w - 245, 275, w - 75, 400], radius=60, fill="#9fbca8")
    yy, mm_, dd = person["dob"].split("-")
    fields = [("Name", person["name"].upper()), ("Gender", person["sex"][0]), ("Country of Stay", "Pakistan"),
              ("Identity Number", person["cnic"]), ("Date of Birth", f"{dd}.{mm_}.{yy}"), ("Date of Expiry", "01.01.2034")]
    x, y = 40, 120
    for i, (label, value) in enumerate(fields):
        col = x if i < 3 else x + 340
        row = y + (i if i < 3 else i - 3) * 100 + (0 if i < 3 else 0)
        if i == 0:
            d.text((col, row), label, font=font(21), fill="#2f5d44")
            d.text((col, row + 28), value, font=font(34, True), fill="#111111")
            continue
        if i < 3:
            row = y + i * 100
        d.text((col, row), label, font=font(21), fill="#2f5d44")
        d.text((col, row + 28), value, font=font(30, True), fill="#111111")
    # big SPECIMEN watermark in the empty band under the fields, so it never covers
    # data Textract has to read (it used to hide the date of birth)
    wm = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(wm).text((40, 440), "SPECIMEN", font=font(120, True), fill=(180, 30, 30, 80))
    card = Image.alpha_composite(card.convert("RGBA"), wm).convert("RGB")
    d = ImageDraw.Draw(card)
    d.text((40, h - 52), "LabLens demo card · dummy number · no government design elements", font=font(18), fill="#4b6b57")
    photo = card.rotate(-1.8, expand=True, fillcolor=(196, 190, 178))
    ImageOps.expand(photo, border=46, fill=(186, 180, 168)).save(path, quality=88)


# ---------------------------------------------------------------------------
def render_png(pdf_path):
    base = os.path.splitext(pdf_path)[0]
    subprocess.run(["pdftoppm", "-r", "150", "-png", "-singlefile", pdf_path, base], check=True, capture_output=True)
    img = Image.open(base + ".png").convert("RGB")
    img.load()
    os.remove(base + ".png")
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PUBLIC, exist_ok=True)
    seed = {}
    for key, person in PEOPLE.items():
        name = f"cnic-{key}-specimen.jpg"
        id_card(person, os.path.join(OUT, name))
        print(f"  {name:40s}")

    for doc in DOCS:
        path = os.path.join(OUT, doc["file"])
        with tempfile.TemporaryDirectory() as tmp:
            pdf = os.path.join(tmp, "doc.pdf")
            if doc["kind"] == "receipt":
                build_receipt(pdf)
            else:
                build_report(doc, pdf)
            with pdfplumber.open(pdf) as p:
                pages = list(p.pages)
                rows = []
                for sec in doc.get("sections", []):
                    if sec == "PAGEBREAK":
                        continue
                    for test, value, unit, rng, flag in sec[2]:
                        page, box = seedlib.find_row(pages, test)
                        kind = {"photo": "photo", "scan": "scan"}.get(doc["kind"], "png")
                        rows.append({"testName": test, "rawValue": value, "unit": unit, "rangeText": rng, "labFlag": flag or None,
                                     "page": page, "box": seedlib.transform(box, kind) if box else None})
                n_pages = len(pages)
            if doc["kind"] == "pdf":
                shutil.copy(pdf, path)
            else:
                img = render_png(pdf)
                if doc["kind"] == "photo":
                    old.phone_photo(img).save(path, quality=86)
                elif doc["kind"] == "scan":
                    old.old_scan(img).save(path, quality=72)
                else:
                    img.save(path, optimize=True)

        person = PEOPLE[doc["person"]]
        if doc["kind"] == "receipt":
            seed[doc["file"]] = {"lab": None, "patient": None, "date": "07/08/2026", "collected": None, "pages": 1,
                                 "mode": "sync", "tables": 2, "rows": []}
        else:
            seed[doc["file"]] = {
                "lab": LABS[doc["lab"]]["name"], "patient": person["name"],
                "date": doc["reported"].split(" ")[0], "collected": doc["collected"].split(" ")[0],
                "pages": n_pages, "mode": "async" if doc["kind"] == "pdf" else "sync",
                # patient info box (once per page) + one results table per section
                "tables": n_pages + len([s for s in doc["sections"] if s != "PAGEBREAK"]), "rows": rows,
            }
        print(f"  {doc['file']:40s} {len(seed[doc['file']]['rows']):3d} rows, {os.path.getsize(path) // 1024} KB")

    for f in os.listdir(OUT):
        shutil.copy(os.path.join(OUT, f), os.path.join(PUBLIC, f))
    with open(SEED_OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(seed, fh, indent=1)
        fh.write("\n")
    print("Wrote", os.path.relpath(SEED_OUT), "and copied files to public/demo/")


if __name__ == "__main__":
    main()
