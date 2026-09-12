# -*- coding: utf-8 -*-
"""Rebuild all DLT brand PDFs using Totem Interactive letterhead from user file."""
from datetime import date
from pathlib import Path

import fitz
from PIL import Image as PILImage
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "Docs" / "dlt-brand-docs"
SHOTS = OUT / "screenshots"
ASSETS = Path(
    r"C:\Users\PC 3\.cursor\projects\c-Users-PC-3-Desktop-Reloved-main-Reloved-main\assets"
)
TODAY = date.today().strftime("%d %B %Y")
LH_SRC = OUT / "letterhead_source.pdf"
LH_PNG = OUT / "letterhead_blank.png"
SIG_BLOCK = OUT / "signature_block.png"
LOGO = ROOT / "frontend" / "public" / "images" / "reloved-logo.png"

PAGE_W, PAGE_H = A4  # 595.27 x 841.89
# Stay clear of header logo/art and footer contacts/geometry
CONTENT_TOP = 48 * mm
FOOTER_MARGIN = 46 * mm  # above Totem contact footer
STAMP_HEIGHT = 26 * mm  # name + signature on every page
CONTENT_BOTTOM = FOOTER_MARGIN + STAMP_HEIGHT
SIG_INK = OUT / "signature_ink.png"


def prepare_blank_letterhead():
    """Keep Totem letterhead art + footer; remove old body text and old signature."""
    if not LH_SRC.exists():
        raise FileNotFoundError(LH_SRC)
    doc = fitz.open(str(LH_SRC))
    page = doc[0]
    for block in page.get_text("blocks"):
        x0, y0, x1, y1, _text = block[:5]
        if y0 < 90 or y0 > 730:
            continue
        page.add_redact_annot(fitz.Rect(x0 - 2, y0 - 2, x1 + 2, y1 + 2), fill=(1, 1, 1))
    # Old signature image in template
    page.add_redact_annot(fitz.Rect(200, 560, 420, 660), fill=(1, 1, 1))
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)
    page.draw_rect(fitz.Rect(28, 92, page.rect.width - 28, 722), color=(1, 1, 1), fill=(1, 1, 1))
    tmp_pdf = OUT / "letterhead_blank.pdf"
    doc.save(str(tmp_pdf))
    doc.close()

    doc2 = fitz.open(str(tmp_pdf))
    pix = doc2[0].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    raw = OUT / "letterhead_page.png"
    pix.save(str(raw))
    doc2.close()
    im = PILImage.open(raw).convert("RGB")
    scale = 2
    y0, y1 = 92 * scale, 722 * scale
    im.paste(PILImage.new("RGB", (im.width, y1 - y0), (255, 255, 255)), (0, y0))
    im.save(LH_PNG, quality=95)
    return LH_PNG


def _whiten_to_alpha(im: PILImage.Image) -> PILImage.Image:
    im = im.convert("RGBA")
    pixels = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r > 245 and g > 245 and b > 245:
                pixels[x, y] = (255, 255, 255, 0)
    return im


def prepare_signature_block():
    """
    Build clean signature-ink PNG (handwritten mark + underline only).
    Name lines are drawn as text on every page.
    """
    # Prefer clean ink from original letterhead PDF (no text in that image)
    if LH_SRC.exists():
        doc = fitz.open(str(LH_SRC))
        page = doc[0]
        clip = fitz.Rect(230, 585, 390, 645)
        pix = page.get_pixmap(matrix=fitz.Matrix(4, 4), clip=clip, alpha=True)
        pix.save(str(SIG_INK))
        doc.close()
        im = _whiten_to_alpha(PILImage.open(SIG_INK))
        bbox = im.getbbox()
        if bbox:
            im = im.crop(bbox)
        im.save(SIG_INK)
        # Also keep latest user crop as reference block (optional)
        matches = list(ASSETS.glob("*4b7677bf*")) or list(ASSETS.glob("*52e8bd1b*"))
        if matches:
            ref = _whiten_to_alpha(PILImage.open(matches[0]))
            bb = ref.getbbox()
            if bb:
                ref = ref.crop(bb)
            ref.save(SIG_BLOCK)
        return SIG_INK

    matches = list(ASSETS.glob("*4b7677bf*")) or list(ASSETS.glob("*52e8bd1b*"))
    if not matches:
        raise FileNotFoundError("No signature source found")
    im = _whiten_to_alpha(PILImage.open(matches[0]))
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    # Right side only = signature line + ink
    ink = im.crop((int(w * 0.48), int(h * 0.15), w, h))
    ib = ink.getbbox()
    if ib:
        ink = ink.crop(ib)
    ink.save(SIG_INK)
    im.save(SIG_BLOCK)
    return SIG_INK


def draw_letterhead_bg(c: canvas.Canvas):
    c.drawImage(
        ImageReader(str(LH_PNG)),
        0,
        0,
        width=PAGE_W,
        height=PAGE_H,
        preserveAspectRatio=False,
        mask="auto",
    )


def draw_page_name_signature(c: canvas.Canvas):
    """On every page: For Totem Interactive / Waseem Javed Khan | MD + signature (no 'Yours faithfully')."""
    c.setFillColorRGB(0.1, 0.1, 0.1)
    name_y = FOOTER_MARGIN + 16 * mm
    title_y = FOOTER_MARGIN + 11 * mm
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, name_y, "For Totem Interactive")
    c.drawString(20 * mm, title_y, "Waseem Javed Khan | MD")

    if SIG_INK.exists():
        max_w, max_h = 48 * mm, 18 * mm
        img = PILImage.open(SIG_INK)
        iw, ih = img.size
        scale = min(max_w / iw, max_h / ih)
        dw, dh = iw * scale, ih * scale
        c.drawImage(
            ImageReader(str(SIG_INK)),
            95 * mm,
            FOOTER_MARGIN + 6 * mm,
            width=dw,
            height=dh,
            mask="auto",
        )


def new_page(c: canvas.Canvas):
    draw_letterhead_bg(c)
    draw_page_name_signature(c)
    return PAGE_H - CONTENT_TOP


def wrap_draw(c, text, x, y, font="Helvetica", size=9.5, max_w=None, leading=4.6 * mm):
    if max_w is None:
        max_w = PAGE_W - 40 * mm
    words = text.split()
    line = ""
    for w in words:
        test = (line + " " + w).strip()
        if c.stringWidth(test, font, size) > max_w:
            c.setFont(font, size)
            c.drawString(x, y, line)
            y -= leading
            line = w
        else:
            line = test
    if line:
        c.setFont(font, size)
        c.drawString(x, y, line)
        y -= leading + 0.8 * mm
    return y


def draw_yours_faithfully(c: canvas.Canvas, y):
    """Closing line only. Name/signature stamp is already on every page."""
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont("Helvetica", 9.5)
    # Keep above the per-page stamp
    y = max(y, CONTENT_BOTTOM + 4 * mm)
    c.drawString(20 * mm, y, "Yours faithfully,")
    return y


def find_asset(suffix: str) -> Path:
    matches = list(ASSETS.glob(f"*{suffix}"))
    if not matches:
        raise FileNotFoundError(suffix)
    return matches[0]


SCREENSHOTS = [
    (
        "01_godaddy_domain_portfolio.png",
        "image-fad5c7d4-3e68-424a-a177-0490e5b82419.png",
        "Exhibit A - GoDaddy Domain Portfolio (reloved.digital + toteminteractive.in)",
    ),
    (
        "02_godaddy_dns_reloved_digital.png",
        "image-7fdb4392-a140-4702-930a-2c775baa8eec.png",
        "Exhibit B - GoDaddy DNS Records for reloved.digital",
    ),
    (
        "03_godaddy_my_products.png",
        "image-45d2d445-3c88-426a-8726-4e8f91f77b2b.png",
        "Exhibit C - GoDaddy My Products (Reloved Digital + Totem Interactive)",
    ),
    (
        "04_reloved_live_brand_page.jpg",
        "image-14911a71-7644-4a05-829b-847d9f791946.jpg",
        "Exhibit D - Live Reloved brand page (hello@reloved.digital)",
    ),
    (
        "05_godaddy_reloved_digital_site.png",
        "image-6ee46025-d0ab-493c-b94b-dec7fafcbdc3.png",
        "Exhibit E - GoDaddy Reloved Digital site product (supporting)",
    ),
]


def ensure_screenshots():
    SHOTS.mkdir(parents=True, exist_ok=True)
    for dest_name, src_suffix, _ in SCREENSHOTS:
        dest = SHOTS / dest_name
        if not dest.exists():
            src = find_asset(src_suffix)
            dest.write_bytes(src.read_bytes())
        img = PILImage.open(dest)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
            if dest.suffix.lower() in (".jpg", ".jpeg"):
                img.save(dest, quality=90)
            else:
                img.save(dest)


def fit_image(c, path, x, y, max_w, max_h):
    img = PILImage.open(path)
    iw, ih = img.size
    scale = min(max_w / iw, max_h / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(ImageReader(str(path)), x, y + (max_h - dh), width=dw, height=dh, mask="auto")


def make_authorization_letter():
    path = OUT / "01_Totem_Reloved_Brand_Authorization_Letter.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    y = new_page(c)
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont("Helvetica", 9.5)
    c.drawRightString(PAGE_W - 20 * mm, y, f"Date: {TODAY}")
    y -= 4.5 * mm
    c.drawRightString(PAGE_W - 20 * mm, y, "Place: Mumbai")
    y -= 7 * mm
    c.setFont("Helvetica-Bold", 10.5)
    c.drawCentredString(PAGE_W / 2, y, "To Whomsoever It May Concern,")
    y -= 6.5 * mm
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(20 * mm, y, "Sub: Authorisation to use brand Reloved / Reloved Digital and")
    y -= 4.5 * mm
    c.drawString(20 * mm, y, "Sender ID (Header) RELOVD / RLOVED on DLT platforms.")
    y -= 6.5 * mm

    paras = [
        "We, Totem Interactive, having our registered office at Shri Krishna Complex, Mumbai 400053, hereby confirm and declare as follows:",
        "1. Totem Interactive is the Principal Entity (PE) registered on the applicable DLT / commercial communication platform(s).",
        "2. Reloved (also referred to as Reloved Digital) is a digital product / brand owned, operated, and/or exclusively managed by Totem Interactive for facilitating free preloved item giving and claiming (Digital Wall of Kindness), including websites and apps at reloved.digital and related hosting properties.",
        "3. Totem Interactive is fully authorised to use the brand names \"Reloved\" and \"Reloved Digital\" in SMS / commercial communication content templates, including One-Time Password (OTP) messages.",
        "4. Totem Interactive requests and authorises registration and use of Sender ID / Header RELOVD (and if unavailable, RLOVED or such other six-character header as allotted) for service-implicit / transactional SMS, including OTP login for the Reloved product.",
        "5. All SMS headers and templates applied under our PE that reference Reloved / Reloved Digital are applied with our knowledge and consent.",
        "6. We undertake that use of the Reloved brand and related Sender ID(s) complies with applicable TRAI / DLT guidelines. Supporting brand materials (logo / brand sheet, domain proof with screenshots) are enclosed.",
        "We request the DLT operator / aggregator to approve the Reloved brand correlation with our PE and the header / content templates submitted pursuant to this authorisation.",
        "The authorised person for operational coordination on DLT matters may be contacted as:",
        "Name: Aakash Puri | Designation: CEO | Mobile: +91 9619370223",
        "Email: aakashpuri@toteminteractive.in",
    ]
    body_floor = CONTENT_BOTTOM + 8 * mm
    for p in paras:
        if y < body_floor + 10 * mm:
            c.showPage()
            y = new_page(c)
        y = wrap_draw(c, p, 20 * mm, y, size=9.2, leading=4.3 * mm)

    if y < body_floor + 6 * mm:
        c.showPage()
        y = new_page(c)
    draw_yours_faithfully(c, y - 2 * mm)
    c.save()
    return path


def make_brand_sheet():
    path = OUT / "02_Reloved_Brand_Sheet.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    y = new_page(c)
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(PAGE_W / 2, y, "RELOVED - Brand identity sheet")
    y -= 10 * mm
    c.setFont("Helvetica", 10)
    for line in [
        "Brand / product name: Reloved (Reloved Digital)",
        "Operating entity: Totem Interactive",
        "Registered office: Shri Krishna Complex, Mumbai 400053",
        "Primary website: https://reloved.digital",
        "Live app hosting: https://reloved-digital.web.app",
        "Instagram: @reloved.digital",
        "Entity website: https://www.toteminteractive.in/",
        "Category: Digital platform - free preloved clothing / kindness wall",
        "Requested SMS Sender ID (Header): RELOVD (alt: RLOVED)",
        "Brand pink (approx): #EC2F9B",
        "",
        "Primary mark:",
    ]:
        c.drawString(20 * mm, y, line)
        y -= 5.5 * mm

    if LOGO.exists():
        tmp = OUT / "_logo_tmp.png"
        PILImage.open(LOGO).convert("RGBA").save(tmp)
        c.drawImage(ImageReader(str(tmp)), 20 * mm, y - 40 * mm, width=40 * mm, height=40 * mm, mask="auto")
        y -= 48 * mm

    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, "Sample OTP content (for template correlation)")
    y -= 6 * mm
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y, "Your Reloved verification code is {#var#}. Valid for 10 minutes.")
    y -= 5 * mm
    c.drawString(20 * mm, y, "Do not share this OTP with anyone.")
    y -= 5 * mm
    c.drawString(20 * mm, y, "- Reloved Digital")
    y -= 10 * mm
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y, "Submitted as brand supporting material for DLT header/template approval.")
    y -= 6 * mm
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(20 * mm, y, f"Prepared: {TODAY} | Totem Interactive / Reloved")
    c.save()
    return path


def make_domain_proof():
    ensure_screenshots()
    path = OUT / "03_Reloved_Domain_Proof_WITH_SCREENSHOTS.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    y = new_page(c)
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(PAGE_W / 2, y, "Domain proof - reloved.digital (with screenshots)")
    y -= 9 * mm
    c.setFont("Helvetica", 9.2)
    for line in [
        "Prepared for DLT header / template approval (Sender ID RELOVD / RLOVED).",
        "Principal Entity: Totem Interactive | Brand: Reloved / Reloved Digital",
        "Domain: reloved.digital (GoDaddy) | Related PE domain: toteminteractive.in",
        "",
        "Exhibits enclosed:",
        "  A. GoDaddy Domain Portfolio (reloved.digital + toteminteractive.in)",
        "  B. GoDaddy DNS records for reloved.digital",
        "  C. GoDaddy My Products (Reloved Digital + Totem Interactive)",
        "  D. Live Reloved brand page (hello@reloved.digital)",
        "  E. GoDaddy Reloved Digital site product (supporting)",
        "  F. ICANN / RDAP summary for reloved.digital",
        "",
        "Declaration: The domain reloved.digital is used for the Reloved product",
        "operated by Totem Interactive. Screenshots demonstrate common GoDaddy",
        "account control of Reloved and Totem Interactive properties.",
    ]:
        c.drawString(18 * mm, y, line)
        y -= 5 * mm

    draw_yours_faithfully(c, y - 4 * mm)
    c.showPage()

    for dest_name, _src, caption in SCREENSHOTS:
        y = new_page(c)
        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(18 * mm, y, caption)
        max_h = PAGE_H - CONTENT_TOP - CONTENT_BOTTOM - 12 * mm
        fit_image(c, SHOTS / dest_name, 15 * mm, CONTENT_BOTTOM, PAGE_W - 30 * mm, max_h - 8 * mm)
        c.showPage()

    y = new_page(c)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(18 * mm, y, "Exhibit F - ICANN Lookup / RDAP summary - reloved.digital")
    y -= 8 * mm
    c.setFont("Helvetica", 9)
    for line in [
        "Source: https://lookup.icann.org/en (queried 09 September 2026)",
        "",
        "Domain name: reloved.digital",
        "Registrar: GoDaddy.com, LLC (IANA ID 146)",
        "Created: 2026-08-04 12:09:50 UTC",
        "Expiration: 2027-08-04 12:09:50 UTC",
        "Updated: 2026-08-11 20:28:13 UTC",
        "Nameservers: ns17.domaincontrol.com , ns18.domaincontrol.com",
        "Status: clientDelete/Renew/Transfer/Update Prohibited",
        "",
        "Registrant (privacy): Domains By Proxy, LLC (reloveddigital-reg)",
        "WHOIS privacy is enabled; account control is shown in Exhibits A-C,",
        "which also list toteminteractive.in on the same GoDaddy account.",
        "",
        "Observed A-record: 118.139.180.238 (see Exhibit B).",
        "Live brand uses Reloved mark and hello@reloved.digital (Exhibit D).",
    ]:
        c.drawString(18 * mm, y, line)
        y -= 5 * mm
    c.save()
    return path


def merge_final(parts):
    final = OUT / "RELOVED_DLT_Brand_Docs_FINAL.pdf"
    w = PdfWriter()
    for p in parts:
        r = PdfReader(str(p))
        for page in r.pages:
            w.add_page(page)
    w.write(str(final))
    return final


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    prepare_blank_letterhead()
    prepare_signature_block()
    parts = [
        make_authorization_letter(),
        make_brand_sheet(),
        make_domain_proof(),
    ]
    final = merge_final(parts)
    print("Wrote:")
    for p in parts + [final]:
        print(" ", p, p.stat().st_size)


if __name__ == "__main__":
    main()
