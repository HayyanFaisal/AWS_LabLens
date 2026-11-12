"""
Generates FAKE lab reports for testing and the demo (fictional labs and patients).
See samples/README.md for what each file tests and the expected result.

Run:  python samples/generate_samples.py   (needs reportlab + Pillow + pdftoppm)
"""
import os
import random
import subprocess
import sys

from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(7)

# ---------------------------------------------------------------------------
# Patient 1: Ali Raza, Demo Diagnostics Laboratory. Values improve over time,
# so the Trends page tells a story. Columns: Dec-2025, Mar, Jun, Sep 2026.
# ---------------------------------------------------------------------------
DEMO_LAB = ("Demo Diagnostics Laboratory", "12-B Sample Road, Demo City · Tel 000-0000000 · Fictional laboratory for testing")
STD_HEADER = ["Test Name", "Result", "Unit", "Reference Range"]

CBC = [
    ("Hemoglobin", "g/dL", "13.0 - 17.0", ["11.2", "12.4", "13.6", "10.8"]),
    ("WBC Count", "/uL", "4,000 - 11,000", ["7,800", "8,200", "6,900", "8,100"]),
    ("Platelet Count", "x10^3/uL", "150 - 400", ["450", "390", "310", "470"]),
]
CHEM = [
    ("Fasting Blood Glucose", "mg/dL", "70 - 100", ["128", "112", "98", "141"]),
    ("HbA1c", "%", "4.0 - 5.6", ["7.1", "6.4", "5.8", "7.6"]),
    ("Serum Creatinine", "mg/dL", "0.7 - 1.3", ["1.0", "1.1", "0.9", "1.1"]),
    ("ALT (SGPT)", "U/L", "7 - 56", ["62", "48", "35", "68"]),
    ("Vitamin D (25-OH)", "ng/mL", "30 - 100", ["14", "22", "34", "11"]),
]
LIPID = [
    ("Total Cholesterol", "mg/dL", "< 200", ["238", "215", "190", "251"]),
    ("LDL Cholesterol", "mg/dL", "< 100", ["162", "140", "118", "171"]),
    ("HDL Cholesterol", "mg/dL", "> 40", ["38", "42", "47", "36"]),
    ("Triglycerides", "mg/dL", "< 150", ["210", "180", "140", "232"]),
]

ALI = dict(name="Ali Raza", age="34 Years / Male", doctor="Dr. Sana Malik")

styles = getSampleStyleSheet()
section = ParagraphStyle("h", parent=styles["Heading3"], fontSize=11, spaceBefore=8, spaceAfter=4)
foot = ParagraphStyle("f", parent=styles["Normal"], fontSize=7.5, textColor=colors.HexColor("#888888"), alignment=1)


def header(lab, patient, lab_no, date_label, date, collected, accent="#0f4c81"):
    title = ParagraphStyle("t", parent=styles["Title"], fontSize=20, textColor=colors.HexColor(accent), spaceAfter=2)
    sub = ParagraphStyle("s", parent=styles["Normal"], fontSize=9, alignment=1, textColor=colors.HexColor("#555555"))
    info = Table(
        [
            ["Patient Name:", patient["name"], "Lab No:", lab_no],
            ["Age / Sex:", patient["age"], f"{date_label}:", date],
            ["Referred By:", patient["doctor"], "Sample Collected:", collected],
        ],
        colWidths=[30 * mm, 55 * mm, 35 * mm, 45 * mm],
    )
    info.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor(accent)),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [Paragraph(lab[0], title), Paragraph(lab[1], sub), Spacer(1, 6 * mm), info, Spacer(1, 4 * mm)]


def results_table(heading, head_row, rows, accent="#0f4c81", head_bg="#dbe7f3"):
    if len(head_row) == 5:
        widths = [44 * mm, 31 * mm, 22 * mm, 57 * mm, 14 * mm]
    else:
        widths = [70 * mm, 28 * mm, 30 * mm, 42 * mm]
    t = Table([head_row] + rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(head_bg)),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#7a8fa6")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    h = ParagraphStyle("hh", parent=section, textColor=colors.HexColor(accent))
    return [Paragraph(heading, h), t]


def footer_block(note="Electronically verified. SAMPLE DOCUMENT FOR SOFTWARE TESTING – NOT A REAL MEDICAL REPORT."):
    return [Spacer(1, 8 * mm), Paragraph(note, foot)]


def rows_for(table, idx):
    return [[name, vals[idx], unit, rng] for name, unit, rng, vals in table]


# ---------------------------------------------------------------------------
# Story builders, one per sample
# ---------------------------------------------------------------------------
def ali_story(idx, date, collected, lab_no, two_pages=False):
    story = header(DEMO_LAB, ALI, lab_no, "Report Date", date, collected)
    story += results_table("COMPLETE BLOOD COUNT (CBC)", STD_HEADER, rows_for(CBC, idx))
    story += results_table("CLINICAL BIOCHEMISTRY", STD_HEADER, rows_for(CHEM, idx))
    if two_pages:
        story += footer_block()
        story.append(PageBreak())
        story += header(DEMO_LAB, ALI, lab_no, "Report Date", date, collected)
    story += results_table("LIPID PROFILE", STD_HEADER, rows_for(LIPID, idx))
    return story + footer_block()


def thyroid_story():
    """Different lab and layout: 'Investigation | Observed Value | Units | Biological Reference Interval | Flag'."""
    lab = ("City Care Pathology", "Plot 7, Model Town · Fictional laboratory for testing")
    head = ["Investigation", "Observed Value", "Units", "Biological Reference Interval", "Flag"]
    accent = "#7a1f5c"
    story = header(lab, ALI, "CCP-1105-221", "Report Date", "05 Nov 2026", "04 Nov 2026", accent)
    story += results_table("THYROID FUNCTION", head, [
        ["TSH", "5.8", "uIU/mL", "0.4 to 4.0", "H"],
        ["Free T4", "1.0", "ng/dL", "0.8 to 1.8", ""],
        ["Free T3", "3.1", "pg/mL", "2.3 to 4.2", ""],
    ], accent, "#f3dfe9")
    story += results_table("DIABETES & RENAL PROFILE", head, [
        ["Fasting Blood Glucose", "94", "mg/dL", "70 to 100", ""],
        ["HbA1c", "5.6", "%", "4.0 to 5.6", ""],
        ["Serum Creatinine", "0.9", "mg/dL", "0.7 to 1.3", ""],
        ["Blood Urea", "38", "mg/dL", "15 to 40", ""],
        ["Uric Acid", "7.4", "mg/dL", "Up to 7.0", "H"],
        ["Sodium", "139", "mmol/L", "135 to 145", ""],
        ["Potassium", "3.3", "mmol/L", "3.5 to 5.1", "L"],
    ], accent, "#f3dfe9")
    return story + footer_block()


def liver_story():
    """Single-page PDF (async API), 'DD-Mon-YYYY' date, a qualitative row that must be skipped."""
    lab = ("Northside Medical Lab", "45 Canal View · Fictional laboratory for testing")
    head = ["Parameter", "Result", "Unit", "Normal Range"]
    accent = "#1d6b3a"
    story = header(lab, ALI, "NML/26/10/0931", "Report Date", "22-Oct-2026", "21-Oct-2026", accent)
    story += results_table("LIVER FUNCTION TEST (LFT)", head, [
        ["Total Bilirubin", "0.8", "mg/dL", "0.3 - 1.2"],
        ["Direct Bilirubin", "0.2", "mg/dL", "Up to 0.3"],
        ["ALT (SGPT)", "31", "U/L", "7 - 56"],
        ["AST (SGOT)", "28", "U/L", "5 - 40"],
        ["Alkaline Phosphatase", "96", "U/L", "44 - 147"],
        ["Gamma GT", "64", "U/L", "Up to 55"],
        ["Total Protein", "7.1", "g/dL", "6.0 - 8.3"],
        ["Albumin", "4.3", "g/dL", "3.5 - 5.0"],
    ], accent, "#dcefe2")
    story += results_table("SEROLOGY", head, [
        ["HBsAg", "Non-Reactive", "", "Non-Reactive"],
        ["Anti-HCV", "Non-Reactive", "", "Non-Reactive"],
    ], accent, "#dcefe2")
    return story + footer_block()


def sara_story():
    """Second patient (use with a second account), US-style date 'Mar 08, 2026'."""
    lab = ("Crescent Diagnostic Centre", "3 Garden Avenue · Fictional laboratory for testing")
    sara = dict(name="Sara Khan", age="27 Years / Female", doctor="Dr. Imran Shah")
    head = ["Test Description", "Value", "Unit", "Ref. Range"]
    accent = "#8a4b08"
    story = header(lab, sara, "CDC-2603-118", "Report Date", "Mar 08, 2026", "Mar 07, 2026", accent)
    story += results_table("ANAEMIA PANEL", head, [
        ["Hemoglobin", "10.9", "g/dL", "12.0 - 15.5"],
        ["RBC Count", "4.1", "million/uL", "4.2 - 5.4"],
        ["MCV", "74", "fL", "80 - 100"],
        ["Serum Ferritin", "8", "ng/mL", "15 - 150"],
        ["Serum Iron", "42", "ug/dL", "60 - 170"],
        ["Vitamin B12", "310", "pg/mL", "200 - 900"],
    ], accent, "#f6e7d3")
    story += results_table("OTHER", head, [
        ["TSH", "2.1", "uIU/mL", "0.4 - 4.0"],
        ["Vitamin D (25-OH)", "18", "ng/mL", "30 - 100"],
    ], accent, "#f6e7d3")
    return story + footer_block()


def invoice_story():
    """NOT a lab report: a shop invoice with a table. LabLens must reject it."""
    title = ParagraphStyle("t", parent=styles["Title"], fontSize=22, textColor=colors.HexColor("#333333"))
    story = [
        Paragraph("Demo Electronics Store", title),
        Paragraph("TAX INVOICE · Fictional shop for software testing", foot),
        Spacer(1, 6 * mm),
    ]
    info = Table([["Invoice No:", "INV-2026-0458", "Date:", "02/11/2026"],
                  ["Customer:", "Ali Raza", "Payment:", "Card"]],
                 colWidths=[28 * mm, 55 * mm, 22 * mm, 45 * mm])
    info.setStyle(TableStyle([("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                              ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                              ("BOX", (0, 0), (-1, -1), 0.6, colors.grey)]))
    story += [info, Spacer(1, 6 * mm)]
    items = Table(
        [["Item", "Qty", "Unit Price", "Amount"],
         ["USB-C Charger 65W", "1", "4,500", "4,500"],
         ["Wireless Mouse", "2", "1,800", "3,600"],
         ["HDMI Cable 2m", "3", "650", "1,950"],
         ["Laptop Stand", "1", "5,200", "5,200"],
         ["", "", "Total", "15,250"]],
        colWidths=[80 * mm, 20 * mm, 35 * mm, 35 * mm],
    )
    items.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")),
                               ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                               ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 6)]))
    return story + [items] + footer_block("Thank you for shopping. SAMPLE DOCUMENT FOR SOFTWARE TESTING.")


# ---------------------------------------------------------------------------
# Output formats
# ---------------------------------------------------------------------------
def build_pdf(story, path):
    SimpleDocTemplate(path, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm).build(story)


def render_png(story, dpi=150) -> Image.Image:
    tmp_pdf = os.path.join(OUT, "_tmp.pdf")
    build_pdf(story, tmp_pdf)
    subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-singlefile", tmp_pdf, os.path.join(OUT, "_tmp")], check=True)
    img = Image.open(os.path.join(OUT, "_tmp.png")).convert("RGB")
    img.load()
    os.remove(tmp_pdf)
    os.remove(os.path.join(OUT, "_tmp.png"))
    return img


def phone_photo(img: Image.Image) -> Image.Image:
    """Slightly tilted paper on a desk."""
    img = img.rotate(-1.5, expand=True, fillcolor=(205, 200, 190))
    return ImageOps.expand(img, border=60, fill=(190, 184, 172))


def old_scan(img: Image.Image) -> Image.Image:
    """Grey, low-contrast, slightly blurred and noisy: like an old fax/scan."""
    img = ImageOps.grayscale(img)
    img = ImageEnhance.Contrast(img).enhance(0.55)
    img = ImageEnhance.Brightness(img).enhance(0.93)
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    px = img.load()
    w, h = img.size
    for _ in range(w * h // 60):
        x, y = random.randrange(w), random.randrange(h)
        px[x, y] = max(0, min(255, px[x, y] + random.randint(-70, 40)))
    return img.rotate(0.8, expand=True, fillcolor=200).convert("RGB")


def id_card(path):
    """
    A FICTIONAL identity card for the sign-up "Scan your ID card" step.
    It is clearly marked SPECIMEN and copies no real government design.
    Ali Raza's details match the demo reports, so name matching works.
    """
    from PIL import ImageDraw, ImageFont

    def font(size, bold=False):
        for name in (("arialbd.ttf" if bold else "arial.ttf"), ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")):
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                continue
        return ImageFont.load_default()

    W, H = 1012, 638
    card = Image.new("RGB", (W, H), "#f4f7f2")
    d = ImageDraw.Draw(card)
    d.rectangle([0, 0, W, 92], fill="#1f6f5c")
    d.text((36, 22), "DEMOLAND IDENTITY CARD", font=font(38, True), fill="white")
    d.text((W - 300, 34), "SPECIMEN · NOT A REAL ID", font=font(20, True), fill="#d9f2e8")
    # photo placeholder
    d.rounded_rectangle([40, 130, 290, 440], radius=12, fill="#dfe6df", outline="#9fb3a8", width=2)
    d.ellipse([115, 170, 215, 270], fill="#a9bab0")
    d.rounded_rectangle([85, 285, 245, 420], radius=60, fill="#a9bab0")
    fields = [
        ("Name", "ALI RAZA"),
        ("Father Name", "RAZA AHMED"),
        ("Gender", "M"),
        ("Country of Stay", "DEMOLAND"),
        ("Identity Number", "00000-1234567-1"),
        ("Date of Birth", "20.05.1990"),
        ("Date of Expiry", "01.01.2032"),
    ]
    x, y = 330, 122
    for i, (label, value) in enumerate(fields):
        col = x if i < 4 else x + 330
        row = y + (i if i < 4 else i - 4) * 98
        d.text((col, row), label, font=font(21), fill="#3f6b5c")
        d.text((col, row + 28), value, font=font(32, True), fill="#111111")
    d.text((40, H - 70), "Fictional card generated for LabLens software testing", font=font(20), fill="#6b7f75")
    d.rectangle([0, H - 14, W, H], fill="#1f6f5c")
    # photographed on a desk, slightly tilted
    photo = card.rotate(-2.2, expand=True, fillcolor=(196, 190, 178))
    photo = ImageOps.expand(photo, border=50, fill=(186, 180, 168))
    photo.save(path, quality=88)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "id":
        path = os.path.join(OUT, "id-card-ali-raza-specimen.jpg")
        id_card(path)
        print(f"  {os.path.basename(path):36s} {os.path.getsize(path) // 1024:5d} KB")
        return
    jobs = [
        ("report-1-mar-2026.png", lambda: ali_story(0, "14/03/2026", "13/03/2026", "DL-26-03114"), "png"),
        ("report-2-jun-2026.jpg", lambda: ali_story(1, "16/06/2026", "15/06/2026", "DL-26-06277"), "photo"),
        ("report-3-sep-2026.pdf", lambda: ali_story(2, "18/09/2026", "17/09/2026", "DL-26-09402", two_pages=True), "pdf"),
        ("report-4-nov-2026-thyroid.png", thyroid_story, "png"),
        ("report-5-dec-2025-old-scan.jpg", lambda: ali_story(3, "10/12/2025", "09/12/2025", "DL-25-12051"), "scan"),
        ("report-6-oct-2026-liver.pdf", liver_story, "pdf"),
        ("report-7-sara-khan-mar-2026.png", sara_story, "png"),
        ("not-a-lab-report-invoice.png", invoice_story, "png"),
    ]
    for name, story_fn, kind in jobs:
        path = os.path.join(OUT, name)
        if kind == "pdf":
            build_pdf(story_fn(), path)
        else:
            img = render_png(story_fn())
            if kind == "photo":
                phone_photo(img).save(path, quality=85)
            elif kind == "scan":
                old_scan(img).save(path, quality=70)
            else:
                img.save(path, optimize=True)
        print(f"  {name:36s} {os.path.getsize(path) // 1024:5d} KB")
    print("Samples written to", OUT)


if __name__ == "__main__":
    sys.exit(main())
