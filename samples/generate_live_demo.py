"""
Fictional lab reports for the LIVE demo: the six people on the CNIC sample cards
who are NOT preloaded demo profiles. In class: sign up as one of them, scan their
card, then upload these reports (they go through real Textract).

Writes samples/live-demo/<person>-<n>-....png|jpg|pdf  (same lab layouts as the
demo profiles; invented labs, DEMO footer, made-up values).

Run:  python samples/generate_live_demo.py
"""
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import generate_demo_people as gdp  # noqa: E402
import generate_samples as old  # noqa: E402

OUT = os.path.join(HERE, "live-demo")
R = gdp.R

# Name, sex and date of birth match the CNIC sample cards (CNIC_Sample folder)
gdp.PEOPLE.update({
    "bilal": dict(name="Muhammad Bilal", sex="Male", dob="1992-08-14", mr="MR-22-410387"),
    "ayesha": dict(name="Ayesha Siddiqui", sex="Female", dob="1995-11-22", mr="MR-23-118264"),
    "usman": dict(name="Usman Farooq", sex="Male", dob="1988-01-05", mr="MR-21-904115"),
    "fatima": dict(name="Fatima Noor", sex="Female", dob="1990-07-19", mr="MR-24-552910"),
    "hamza": dict(name="Hamza Ali Khan", sex="Male", dob="1997-04-30", mr="MR-25-073318"),
    "zainab": dict(name="Zainab Bibi", sex="Female", dob="1985-12-08", mr="MR-20-661042"),
})

F_CBC = lambda hb, rbc, mcv, plt: [  # noqa: E731  female reference ranges
    R("Haemoglobin", hb, "g/dL", "12.0 - 15.5", "L" if float(hb) < 12 else ""),
    R("RBC Count", rbc, "x10^12/L", "3.8 - 5.2", "L" if float(rbc) < 3.8 else ""),
    R("MCV", mcv, "fL", "80 - 100", "L" if float(mcv) < 80 else ""),
    R("Platelet Count", plt, "x10^9/L", "150 - 400"),
]

DOCS = [
    # Muhammad Bilal: high cholesterol, fatty-liver pattern
    dict(file="bilal-1-jul-2026-lipids.png", person="bilal", lab="ravi", kind="png", labno="RRL-2607-18822",
         collected="11-Jul-2026 08:15", reported="11-Jul-2026 15:40", sections=[
            ("CLINICAL CHEMISTRY", "Lipid Profile (Fasting)", [R("Total Cholesterol", "246", "mg/dL", "< 200", "H"), R("Triglycerides", "212", "mg/dL", "< 150", "H"),
                                                               R("HDL Cholesterol", "38", "mg/dL", "> 40", "L"), R("LDL Cholesterol", "158", "mg/dL", "< 100", "H")]),
            ("CLINICAL CHEMISTRY", "Diabetes Profile", [R("Fasting Blood Glucose", "96", "mg/dL", "70 - 99"), R("HbA1c", "5.5", "%", "4.0 - 5.6")]),
         ]),
    dict(file="bilal-2-oct-2026-liver.pdf", person="bilal", lab="clifton", kind="pdf", labno="CPS-2610-30117",
         collected="20-Oct-2026 09:00", reported="20-Oct-2026 18:10", sections=[
            ("CHEMISTRY", "Liver Function Tests", [R("ALT (SGPT)", "71", "U/L", "10 - 50", "H"), R("AST (SGOT)", "48", "U/L", "10 - 40", "H"),
                                                   R("Alkaline Phosphatase", "102", "U/L", "40 - 130"), R("Total Bilirubin", "0.9", "mg/dL", "0.3 - 1.2"),
                                                   R("Albumin", "4.4", "g/dL", "3.5 - 5.0")]),
            ("CHEMISTRY", "Lipid Profile", [R("Total Cholesterol", "221", "mg/dL", "< 200", "H"), R("LDL Cholesterol", "139", "mg/dL", "< 100", "H"),
                                            R("HDL Cholesterol", "41", "mg/dL", "> 40")]),
         ], note="Raised liver enzymes with dyslipidaemia. Clinical correlation advised."),

    # Ayesha Siddiqui: iron-deficiency anaemia
    dict(file="ayesha-1-may-2026-anaemia.png", person="ayesha", lab="kohsar", kind="png", labno="KDC-2605-09934",
         collected="06-May-2026 10:05", reported="06-May-2026 16:30", sections=[
            ("HAEMATOLOGY", "Complete Blood Count (CBC)", F_CBC("10.4", "3.9", "72", "318")),
            ("BIOCHEMISTRY", "Iron Studies", [R("Serum Ferritin", "7", "ng/mL", "15 - 150", "L"), R("Serum Iron", "38", "ug/dL", "60 - 170", "L")]),
         ]),
    dict(file="ayesha-2-sep-2026-followup-photo.jpg", person="ayesha", lab="kohsar", kind="photo", labno="KDC-2609-21170",
         collected="15-Sep-2026 09:40", reported="15-Sep-2026 15:10", sections=[
            ("HAEMATOLOGY", "Complete Blood Count (CBC)", F_CBC("12.3", "4.3", "81", "296")),
            ("BIOCHEMISTRY", "Iron Studies", [R("Serum Ferritin", "29", "ng/mL", "15 - 150"), R("Serum Iron", "71", "ug/dL", "60 - 170")]),
         ], note="Follow-up after oral iron therapy."),

    # Usman Farooq: type 2 diabetes with early kidney strain
    dict(file="usman-1-mar-2026-diabetes-photo.jpg", person="usman", lab="ravi", kind="photo", labno="RRL-2603-07745",
         collected="02-Mar-2026 08:20", reported="02-Mar-2026 14:55", sections=[
            ("CLINICAL CHEMISTRY", "Diabetes Profile", [R("Fasting Blood Glucose", "162", "mg/dL", "70 - 99", "H"), R("HbA1c", "8.1", "%", "4.0 - 5.6", "H")]),
            ("CLINICAL CHEMISTRY", "Renal Function Tests", [R("Serum Creatinine", "1.4", "mg/dL", "0.7 - 1.3", "H"), R("Blood Urea", "44", "mg/dL", "15 - 45"),
                                                           R("Uric Acid", "7.8", "mg/dL", "3.5 - 7.2", "H")]),
         ]),
    dict(file="usman-2-aug-2026-followup.png", person="usman", lab="ravi", kind="png", labno="RRL-2608-26604",
         collected="27-Aug-2026 08:10", reported="27-Aug-2026 15:25", sections=[
            ("CLINICAL CHEMISTRY", "Diabetes Profile", [R("Fasting Blood Glucose", "128", "mg/dL", "70 - 99", "H"), R("HbA1c", "7.2", "%", "4.0 - 5.6", "H")]),
            ("CLINICAL CHEMISTRY", "Renal Function Tests", [R("Serum Creatinine", "1.2", "mg/dL", "0.7 - 1.3"), R("Blood Urea", "38", "mg/dL", "15 - 45"),
                                                           R("Uric Acid", "6.9", "mg/dL", "3.5 - 7.2")]),
         ], note="Improved control on metformin."),

    # Fatima Noor: vitamin D deficiency, healthy otherwise
    dict(file="fatima-1-apr-2026-vitamins.png", person="fatima", lab="clifton", kind="png", labno="CPS-2604-11402",
         collected="14-Apr-2026 09:30", reported="15-Apr-2026 11:00", sections=[
            ("CHEMISTRY", "Bone & Vitamin Profile", [R("Vitamin D (25-OH)", "9", "ng/mL", "30 - 100", "L"), R("Serum Calcium", "8.5", "mg/dL", "8.6 - 10.3", "L"),
                                                     R("Vitamin B12", "410", "pg/mL", "200 - 900")]),
            ("HORMONES", "Thyroid Function", [R("TSH", "2.4", "uIU/mL", "0.4 - 4.0"), R("Free T4", "1.1", "ng/dL", "0.8 - 1.8")]),
         ]),
    dict(file="fatima-2-oct-2026-recheck.pdf", person="fatima", lab="clifton", kind="pdf", labno="CPS-2610-28859",
         collected="09-Oct-2026 09:15", reported="10-Oct-2026 12:20", sections=[
            ("HAEMATOLOGY", "Complete Blood Count (CBC)", F_CBC("13.1", "4.5", "88", "274")),
            ("CHEMISTRY", "Bone & Vitamin Profile", [R("Vitamin D (25-OH)", "27", "ng/mL", "30 - 100", "L"), R("Serum Calcium", "9.2", "mg/dL", "8.6 - 10.3"),
                                                     R("Vitamin B12", "455", "pg/mL", "200 - 900")]),
         ], note="Vitamin D improving on supplementation."),

    # Hamza Ali Khan: healthy athlete, everything in range
    dict(file="hamza-1-jun-2026-checkup.png", person="hamza", lab="kohsar", kind="png", labno="KDC-2606-14478",
         collected="18-Jun-2026 08:00", reported="18-Jun-2026 13:45", sections=[
            ("HAEMATOLOGY", "Complete Blood Count (CBC)", gdp.CBC_OK),
            ("BIOCHEMISTRY", "Lipid Profile", [R("Total Cholesterol", "168", "mg/dL", "< 200"), R("HDL Cholesterol", "56", "mg/dL", "> 40"),
                                               R("LDL Cholesterol", "88", "mg/dL", "< 100")]),
         ], note="All results within reference intervals."),
    dict(file="hamza-2-nov-2026-annual.pdf", person="hamza", lab="ravi", kind="pdf", labno="RRL-2611-33205",
         collected="04-Nov-2026 08:05", reported="04-Nov-2026 17:15", sections=[
            ("CLINICAL CHEMISTRY", "Diabetes Profile", [R("Fasting Blood Glucose", "84", "mg/dL", "70 - 99"), R("HbA1c", "5.0", "%", "4.0 - 5.6")]),
            ("CLINICAL CHEMISTRY", "Renal Function Tests", [R("Serum Creatinine", "1.0", "mg/dL", "0.7 - 1.3"), R("Blood Urea", "31", "mg/dL", "15 - 45")]),
            ("CLINICAL CHEMISTRY", "Liver Function Tests", [R("ALT (SGPT)", "26", "U/L", "10 - 50"), R("AST (SGOT)", "24", "U/L", "10 - 40")]),
         ]),

    # Zainab Bibi: hypothyroidism and anaemia
    dict(file="zainab-1-feb-2026-thyroid.png", person="zainab", lab="clifton", kind="png", labno="CPS-2602-05561",
         collected="10-Feb-2026 09:20", reported="10-Feb-2026 19:00", sections=[
            ("HORMONES", "Thyroid Function", [R("TSH", "9.6", "uIU/mL", "0.4 - 4.0", "H"), R("Free T4", "0.6", "ng/dL", "0.8 - 1.8", "L")]),
            ("HAEMATOLOGY", "Complete Blood Count (CBC)", F_CBC("11.2", "3.9", "84", "241")),
         ], note="Raised TSH with low Free T4."),
    dict(file="zainab-2-sep-2026-scan.jpg", person="zainab", lab="clifton", kind="scan", labno="CPS-2609-24480",
         collected="22-Sep-2026 09:10", reported="22-Sep-2026 18:35", sections=[
            ("HORMONES", "Thyroid Function", [R("TSH", "3.9", "uIU/mL", "0.4 - 4.0"), R("Free T4", "1.0", "ng/dL", "0.8 - 1.8")]),
            ("HAEMATOLOGY", "Complete Blood Count (CBC)", F_CBC("12.4", "4.2", "86", "255")),
         ], note="On levothyroxine."),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for doc in DOCS:
        path = os.path.join(OUT, doc["file"])
        with tempfile.TemporaryDirectory() as tmp:
            pdf = os.path.join(tmp, "doc.pdf")
            gdp.build_report(doc, pdf)
            if doc["kind"] == "pdf":
                shutil.copy(pdf, path)
            else:
                img = gdp.render_png(pdf)
                if doc["kind"] == "photo":
                    old.phone_photo(img).save(path, quality=86)
                elif doc["kind"] == "scan":
                    old.old_scan(img).save(path, quality=72)
                else:
                    img.save(path, optimize=True)
        print(f"  {doc['file']:40s} {os.path.getsize(path) // 1024:4d} KB")
    print("Live demo reports written to", os.path.relpath(OUT))


if __name__ == "__main__":
    main()
