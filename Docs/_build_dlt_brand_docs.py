"""Generate DLT brand support PDFs for Reloved under Totem Interactive PE."""
from datetime import date
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "Docs" / "dlt-brand-docs"
LOGO = ROOT / "frontend" / "public" / "images" / "reloved-logo.png"
TODAY = date.today().strftime("%d %B %Y")


def ensure_out():
    OUT.mkdir(parents=True, exist_ok=True)


def draw_letterhead(c: canvas.Canvas, width, height):
    c.setFillColorRGB(0.05, 0.05, 0.05)
    c.rect(0, height - 22 * mm, width, 22 * mm, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, height - 13 * mm, "TOTEM INTERACTIVE")
    c.setFont("Helvetica", 8)
    c.drawRightString(width - 20 * mm, height - 10 * mm, "Brand / DLT supporting document")
    c.drawRightString(width - 20 * mm, height - 15 * mm, TODAY)
    c.setStrokeColorRGB(0.93, 0.18, 0.61)  # Reloved pink accent
    c.setLineWidth(3)
    c.line(0, height - 22 * mm, width, height - 22 * mm)


def make_authorization_letter():
    path = OUT / "01_Totem_Reloved_Brand_Authorization_Letter.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    draw_letterhead(c, w, h)

    y = h - 40 * mm
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, y, "TO WHOMSOEVER IT MAY CONCERN")
    y -= 10 * mm

    c.setFont("Helvetica", 10)
    lines = [
        "Subject: Authorisation to use brand name Reloved / Reloved Digital",
        "and Sender ID (Header) RELOVD / RLOVED on DLT platforms.",
        "",
        "We, Totem Interactive, hereby confirm and declare as follows:",
        "",
        "1. Totem Interactive is the Principal Entity (PE) registered on the",
        "   applicable DLT / commercial communication platform(s).",
        "",
        "2. Reloved (also referred to as Reloved Digital) is a digital product /",
        "   brand owned, operated, and/or exclusively managed by Totem Interactive",
        "   for the purpose of facilitating free preloved item giving and claiming",
        "   (Digital Wall of Kindness), including the websites and apps operated",
        "   at reloved.digital and related hosting properties.",
        "",
        "3. Totem Interactive is fully authorised to use the brand names",
        "   \"Reloved\" and \"Reloved Digital\" in SMS / commercial communication",
        "   content templates, including One-Time Password (OTP) messages.",
        "",
        "4. Totem Interactive requests and authorises registration and use of",
        "   Sender ID / Header RELOVD (and, if unavailable, RLOVED or such other",
        "   six-character header as allotted) for transactional / service-implicit",
        "   SMS, including OTP login for the Reloved product.",
        "",
        "5. All SMS headers and templates applied under our PE that reference",
        "   Reloved / Reloved Digital are applied with our knowledge and consent.",
        "",
        "6. We undertake that use of the Reloved brand and related Sender ID(s)",
        "   complies with applicable TRAI / DLT guidelines and that supporting",
        "   brand materials (logo, brand sheet, domain proof) are enclosed.",
        "",
        "We request the DLT operator / aggregator to approve the Reloved brand",
        "correlation with our PE and the header / content templates submitted",
        "pursuant to this authorisation.",
        "",
        "For Totem Interactive",
        "",
        "",
        "_______________________________",
        "Authorised Signatory",
        "Name: ________________________________",
        "Designation: __________________________",
        "Date: ________________________________",
        "Mobile / Email (as on PE): _____________",
        "",
        "Company stamp (if applicable)",
    ]
    for line in lines:
        c.drawString(20 * mm, y, line)
        y -= 5.2 * mm
        if y < 25 * mm:
            c.showPage()
            draw_letterhead(c, w, h)
            y = h - 35 * mm
            c.setFillColorRGB(0, 0, 0)
            c.setFont("Helvetica", 10)

    c.setFont("Helvetica-Oblique", 7)
    c.drawString(
        20 * mm,
        12 * mm,
        "Draft generated for DLT upload. Must be signed by an authorised Totem Interactive signatory before submission.",
    )
    c.save()
    return path


def make_brand_sheet():
    path = OUT / "02_Reloved_Brand_Sheet.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    draw_letterhead(c, w, h)

    y = h - 40 * mm
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, y, "RELOVED — Brand identity sheet")
    y -= 8 * mm
    c.setFont("Helvetica", 10)
    for line in [
        "Brand / product name: Reloved (Reloved Digital)",
        "Operating entity: Totem Interactive",
        "Primary website: https://reloved.digital",
        "Live app hosting: https://reloved-digital.web.app",
        "Instagram: @reloved.digital",
        "Category: Digital platform — free preloved clothing / kindness wall",
        "Requested SMS Sender ID (Header): RELOVD (alt: RLOVED)",
        "Brand pink (approx): #EC2F9B",
        "",
        "Primary mark (circular badge):",
    ]:
        c.drawString(20 * mm, y, line)
        y -= 5.5 * mm

    if LOGO.exists():
        # Convert webp/png safely via Pillow
        img = PILImage.open(LOGO).convert("RGBA")
        tmp = OUT / "_logo_tmp.png"
        img.save(tmp)
        iw, ih = img.size
        display = 45 * mm
        c.drawImage(
            ImageReader(str(tmp)),
            20 * mm,
            y - display,
            width=display,
            height=display,
            mask="auto",
        )
        y -= display + 8 * mm
    else:
        c.drawString(20 * mm, y, "[Logo file missing — attach reloved-logo.png manually]")
        y -= 10 * mm

    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, y, "Sample OTP content (for template correlation)")
    y -= 7 * mm
    c.setFont("Helvetica", 9)
    sample = (
        "Your Reloved verification code is {#var#}. Valid for 10 minutes. "
        "Do not share this OTP with anyone.\n- Reloved Digital"
    )
    for para in sample.split("\n"):
        c.drawString(20 * mm, y, para)
        y -= 5 * mm

    y -= 8 * mm
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y, "This sheet is submitted as brand supporting material for DLT header/template approval.")
    y -= 12 * mm
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(20 * mm, y, f"Prepared: {TODAY} · Totem Interactive / Reloved")

    c.save()
    return path


def make_domain_proof():
    path = OUT / "03_Reloved_Domain_Proof_Checklist.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    draw_letterhead(c, w, h)

    y = h - 40 * mm
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, y, "Domain proof — reloved.digital")
    y -= 10 * mm
    c.setFont("Helvetica", 10)
    lines = [
        "Domain: reloved.digital",
        "Observed A record (DNS lookup on document date): 118.139.180.238",
        "Also associated hosting: reloved-digital.web.app (Firebase Hosting)",
        "",
        "Please attach screenshots behind / with this cover page:",
        "",
        "1. ICANN Lookup: https://lookup.icann.org/en  → search reloved.digital",
        "   Save PDF or full-page screenshot showing registrar / status.",
        "",
        "2. Registrar account screenshot (GoDaddy / Namecheap / Cloudflare / etc.)",
        "   showing domain owned or managed by Totem Interactive / authorised person.",
        "",
        "3. Browser screenshot of https://reloved.digital homepage (live site).",
        "",
        "4. Optional: Firebase / hosting console showing domain connected.",
        "",
        "Declaration:",
        "The domain reloved.digital is used for the Reloved product operated by",
        "Totem Interactive. This pack is submitted to correlate the Reloved brand",
        "with our DLT Principal Entity and Sender ID RELOVD / RLOVED.",
        "",
        "For Totem Interactive",
        "",
        "_______________________________  Authorised Signatory",
        "Name / Date: ________________________________________",
    ]
    for line in lines:
        c.drawString(20 * mm, y, line)
        y -= 5.5 * mm

    c.setFont("Helvetica-Oblique", 7)
    c.drawString(
        20 * mm,
        12 * mm,
        "DNS IP may change; attach fresh ICANN/registrar proof on the day of DLT upload.",
    )
    c.save()
    return path


def make_readme():
    path = OUT / "README_UPLOAD_ORDER.txt"
    path.write_text(
        f"""DLT brand document pack — Reloved under Totem Interactive
Generated: {TODAY}

UPLOAD ORDER (STPL / Smartping — New Header RELOVD):
1. 01_Totem_Reloved_Brand_Authorization_Letter.pdf  ← SIGN first (wet ink or digital)
2. 02_Reloved_Brand_Sheet.pdf
3. 03_Reloved_Domain_Proof_Checklist.pdf + your ICANN/registrar/homepage screenshots

THEN:
- Apply header RELOVD (or RLOVED) with these docs
- After header Active → submit OTP template with Reloved body

IMPORTANT:
- Fill Name, Designation, Date, signatory signature on letter + domain pack
- Add company stamp if you use one
- Do not upload unsigned letter

Contact if rejected: dlt.helpdesk@stpl.ai / 9907922122 option 2
""",
        encoding="utf-8",
    )
    return path


def main():
    ensure_out()
    files = [
        make_authorization_letter(),
        make_brand_sheet(),
        make_domain_proof(),
        make_readme(),
    ]
    for f in files:
        print(f"Wrote {f}")


if __name__ == "__main__":
    main()
