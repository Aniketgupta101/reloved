# -*- coding: utf-8 -*-
"""Rebuild domain-proof PDF with embedded GoDaddy / brand / ICANN evidence."""
from datetime import date
from pathlib import Path

from PIL import Image as PILImage
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

SOURCES = [
    (
        "01_godaddy_domain_portfolio.png",
        "image-fad5c7d4-3e68-424a-a177-0490e5b82419.png",
        "GoDaddy Domain Portfolio - reloved.digital + toteminteractive.in (same account)",
    ),
    (
        "02_godaddy_dns_reloved_digital.png",
        "image-7fdb4392-a140-4702-930a-2c775baa8eec.png",
        "GoDaddy DNS Records - reloved.digital (A / NS)",
    ),
    (
        "03_godaddy_my_products.png",
        "image-45d2d445-3c88-426a-8726-4e8f91f77b2b.png",
        "GoDaddy My Products - Reloved Digital + Totem Interactive",
    ),
    (
        "04_reloved_live_brand_page.jpg",
        "image-14911a71-7644-4a05-829b-847d9f791946.jpg",
        "Live Reloved brand page - RELOVED + hello@reloved.digital",
    ),
    (
        "05_godaddy_reloved_digital_site.png",
        "image-6ee46025-d0ab-493c-b94b-dec7fafcbdc3.png",
        "GoDaddy Reloved Digital site product (supporting)",
    ),
]


def find_asset(suffix: str) -> Path:
    matches = list(ASSETS.glob(f"*{suffix}"))
    if not matches:
        raise FileNotFoundError(suffix)
    return matches[0]


def copy_screenshots():
    SHOTS.mkdir(parents=True, exist_ok=True)
    for dest_name, src_suffix, _caption in SOURCES:
        src = find_asset(src_suffix)
        dest = SHOTS / dest_name
        dest.write_bytes(src.read_bytes())
        img = PILImage.open(dest)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        if dest.suffix.lower() in (".jpg", ".jpeg"):
            img.save(dest, quality=90)
        else:
            img.save(dest)


def letterhead(c: canvas.Canvas, w, h, subtitle: str):
    c.setFillColorRGB(0.05, 0.05, 0.05)
    c.rect(0, h - 18 * mm, w, 18 * mm, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(15 * mm, h - 11 * mm, "TOTEM INTERACTIVE")
    c.setFont("Helvetica", 8)
    c.drawRightString(w - 15 * mm, h - 8 * mm, subtitle)
    c.drawRightString(w - 15 * mm, h - 13 * mm, TODAY)
    c.setStrokeColorRGB(0.93, 0.18, 0.61)
    c.setLineWidth(2.5)
    c.line(0, h - 18 * mm, w, h - 18 * mm)


def fit_image(c: canvas.Canvas, path: Path, x, y, max_w, max_h):
    img = PILImage.open(path)
    iw, ih = img.size
    scale = min(max_w / iw, max_h / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(
        ImageReader(str(path)),
        x,
        y + (max_h - dh),
        width=dw,
        height=dh,
        preserveAspectRatio=True,
        mask="auto",
    )


def build_pdf():
    OUT.mkdir(parents=True, exist_ok=True)
    copy_screenshots()
    path = OUT / "03_Reloved_Domain_Proof_WITH_SCREENSHOTS.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4

    letterhead(c, w, h, "Domain / brand proof pack")
    y = h - 32 * mm
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(15 * mm, y, "Domain proof - reloved.digital (with screenshots)")
    y -= 8 * mm
    c.setFont("Helvetica", 10)
    for line in [
        "Prepared for DLT header / template approval (Sender ID RELOVD / RLOVED).",
        "Principal Entity: Totem Interactive",
        "Brand / product: Reloved / Reloved Digital",
        "Domain: reloved.digital (GoDaddy) | Related: toteminteractive.in",
        "",
        "This pack includes:",
        "  1. Cover and declaration",
        "  2. GoDaddy Domain Portfolio (reloved.digital + toteminteractive.in)",
        "  3. GoDaddy DNS records for reloved.digital",
        "  4. GoDaddy My Products (Reloved Digital + Totem Interactive)",
        "  5. Live Reloved brand page (hello@reloved.digital)",
        "  6. GoDaddy Reloved Digital site product (supporting)",
        "  7. ICANN / RDAP summary for reloved.digital",
        "",
        "Declaration: The domain reloved.digital is used for the Reloved product",
        "operated by Totem Interactive. Screenshots demonstrate common account",
        "control of Reloved and Totem Interactive properties on GoDaddy.",
        "",
        "Authorised Signatory: ___________________________  Date: ____________",
        "Name / Designation: ________________________________________________",
    ]:
        c.drawString(15 * mm, y, line)
        y -= 5.2 * mm
    c.showPage()

    for dest_name, _src, caption in SOURCES:
        letterhead(c, w, h, "Exhibit - screenshot")
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(15 * mm, h - 28 * mm, caption)
        fit_image(c, SHOTS / dest_name, 12 * mm, 18 * mm, w - 24 * mm, h - 52 * mm)
        c.setFont("Helvetica", 7)
        c.drawString(15 * mm, 10 * mm, f"File: {dest_name} | Totem Interactive / Reloved DLT | {TODAY}")
        c.showPage()

    letterhead(c, w, h, "Exhibit - ICANN / RDAP")
    y = h - 30 * mm
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(15 * mm, y, "ICANN Lookup / RDAP summary - reloved.digital")
    y -= 8 * mm
    c.setFont("Helvetica", 9)
    for line in [
        "Source: https://lookup.icann.org/en (queried 09 September 2026)",
        "",
        "Domain name: reloved.digital",
        "Registrar: GoDaddy.com, LLC (IANA ID 146)",
        "Created: 2026-08-04 12:09:50 UTC",
        "Registry / Registrar expiration: 2027-08-04 12:09:50 UTC",
        "Updated: 2026-08-11 20:28:13 UTC",
        "Nameservers: ns17.domaincontrol.com , ns18.domaincontrol.com",
        "Domain status: clientDeleteProhibited, clientRenewProhibited,",
        "               clientTransferProhibited, clientUpdateProhibited",
        "",
        "Registrant (privacy / proxy):",
        "  Organization: Domains By Proxy, LLC",
        "  Handle: reloveddigital-reg",
        "  WHOIS privacy enabled - public registrant shows proxy.",
        "  Account control is evidenced by GoDaddy portfolio / DNS screenshots",
        "  in this pack, which also list toteminteractive.in.",
        "",
        "DNSSEC: Unsigned",
        "Observed A-record: 118.139.180.238 (see DNS exhibit).",
        "Live brand uses Reloved mark and hello@reloved.digital (see live exhibit).",
    ]:
        c.drawString(15 * mm, y, line)
        y -= 5 * mm

    c.save()
    # Also replace the simple checklist with a pointer note in README
    readme = OUT / "README_UPLOAD_ORDER.txt"
    readme.write_text(
        f"""DLT brand document pack - Reloved under Totem Interactive
Generated: {TODAY}

UPLOAD TO STPL (New Header RELOVD):
1. 01_Totem_Reloved_Brand_Authorization_Letter.pdf  (SIGN first)
2. 02_Reloved_Brand_Sheet.pdf
3. 03_Reloved_Domain_Proof_WITH_SCREENSHOTS.pdf   <-- use this (screenshots included)

Screenshots folder (also embedded in PDF #3): Docs/dlt-brand-docs/screenshots/
""",
        encoding="utf-8",
    )
    return path


if __name__ == "__main__":
    out = build_pdf()
    print(f"Wrote {out}")
