"""
Build client PDF from claimed-items.json (delivered/scheduled till today).
  python scripts/_tmp-build-till-today-pdf.py
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(os.environ["USERPROFILE"]) / "Desktop" / "Reloved-claimed-items-report"
JSON_PATH = OUT / "claimed-items.json"
PDF_PATH = OUT / "Reloved-Claimed-Items-Report.pdf"
HTML_PATH = OUT / "report.html"
IMG_DIR = OUT / "hd-images"


def safe_name(s: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-zA-Z0-9._-]+", "_", s or "item"))[:80]


def esc(s) -> str:
    return (
        str(s if s is not None else "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def build_html(items: list) -> str:
    rows = []
    cards = []
    for i, c in enumerate(items, 1):
        claim = c.get("claim") or {}
        rows.append(
            "<tr><td>"
            + str(i)
            + "</td><td>"
            + esc(c["title"])
            + "</td><td>"
            + esc(claim.get("requesterName") or "—")
            + "</td><td>"
            + esc(claim.get("slotLabel") or "—")
            + "</td><td>"
            + esc(claim.get("deliveryStatus") or (claim.get("handoverStage") or "—").replace("_", " "))
            + "</td></tr>"
        )
        imgs = ""
        for d in c.get("downloaded") or []:
            imgs += (
                '<figure><img src="hd-images/'
                + safe_name(c.get("slug") or c["id"])
                + "/"
                + d["file"]
                + '" alt="'
                + esc(c["title"])
                + '"/><figcaption>'
                + esc(d.get("imageType") or "")
                + "</figcaption></figure>"
            )
        cards.append(
            '<section class="card"><h2>'
            + esc(c["title"])
            + '</h2><p class="meta">'
            + esc(c.get("category") or "—")
            + " · "
            + esc(c.get("brand") or "no brand")
            + " · size "
            + esc(c.get("size") or "—")
            + " · "
            + esc(c.get("locality") or "—")
            + "</p><dl>"
            + "<dt>Claimer</dt><dd>"
            + esc(claim.get("requesterName") or "—")
            + "</dd>"
            + "<dt>Scheduled</dt><dd>"
            + esc(claim.get("slotLabel") or "—")
            + "</dd>"
            + "<dt>Status</dt><dd>"
            + esc(claim.get("deliveryStatus") or (claim.get("handoverStage") or "—").replace("_", " "))
            + "</dd></dl>"
            + '<div class="gallery">'
            + imgs
            + "</div></section>"
        )
    return (
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>"
        "<title>Delivered claims scheduled till today</title>"
        "<style>"
        "body{font-family:Georgia,serif;background:#f7f4ef;color:#1c1917;margin:0;padding:32px}"
        "h1{font-size:28px;margin:0 0 8px}.sub{color:#78716c;margin-bottom:28px}"
        ".card{background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:20px 24px;margin-bottom:20px}"
        ".meta{color:#78716c}"
        "dl{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin:12px 0}"
        "dt{color:#78716c} dd{margin:0}"
        ".gallery{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}"
        "figure{margin:0;width:280px} img{width:100%;height:360px;object-fit:contain;background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px}"
        "table{border-collapse:collapse;width:100%;margin:16px 0 28px;background:#fff}"
        "th,td{border:1px solid #e7e5e4;padding:8px 10px;text-align:left;font-size:14px}"
        "th{background:#f5f5f4}"
        "</style></head><body>"
        "<h1>Delivered claims — scheduled till today</h1>"
        '<p class="sub">All delivered/handed-over items with handover scheduled on or before 29 Sep 2026 (IST) · '
        + str(len(items))
        + " items</p>"
        "<table><thead><tr><th>#</th><th>Item</th><th>Claimer</th><th>Scheduled</th><th>Status</th></tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table>"
        + "".join(cards)
        + "</body></html>"
    )


def build_pdf(items: list) -> None:
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CoverTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1c1917"),
        alignment=TA_CENTER,
        spaceAfter=4,
    )
    subtitle = ParagraphStyle(
        "CoverSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=16,
        textColor=colors.HexColor("#78716c"),
        alignment=TA_CENTER,
    )
    h1 = ParagraphStyle(
        "ItemTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#1c1917"),
        spaceAfter=6,
    )
    body = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1c1917"),
        spaceAfter=3,
    )
    meta = ParagraphStyle(
        "Meta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#57534e"),
        spaceAfter=4,
    )
    th_style = ParagraphStyle("Th", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9)
    td_style = ParagraphStyle("Td", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=12)
    small = ParagraphStyle(
        "Small",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=colors.HexColor("#78716c"),
        alignment=TA_CENTER,
    )

    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Reloved — Delivered Claims Till Today",
        author="Reloved",
    )
    story = []
    # Cover + summary consolidated on page 1
    story.append(Paragraph("Reloved", title_style))
    story.append(Paragraph("Delivered Claims Till Today", title_style))
    story.append(Spacer(1, 3 * mm))
    story.append(
        Paragraph(
            f"{len(items)} claimed items scheduled on/before 29 Sep 2026 (delivered + today's Agnes handovers)",
            subtitle,
        )
    )
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("Summary", h1))
    header = [
        Paragraph("#", th_style),
        Paragraph("Item", th_style),
        Paragraph("Claimer", th_style),
        Paragraph("Scheduled", th_style),
        Paragraph("Status", th_style),
    ]
    rows = [header]
    for i, item in enumerate(items, 1):
        claim = item.get("claim") or {}
        status = claim.get("deliveryStatus") or (claim.get("handoverStage") or "—").replace("_", " ")
        rows.append(
            [
                Paragraph(str(i), td_style),
                Paragraph(esc(item.get("title")), td_style),
                Paragraph(esc(claim.get("requesterName") or "—"), td_style),
                Paragraph(esc(claim.get("slotLabel") or "—"), td_style),
                Paragraph(esc(status), td_style),
            ]
        )
    table = Table(rows, colWidths=[10 * mm, 55 * mm, 35 * mm, 50 * mm, 30 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f4")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e7e5e4")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(table)
    story.append(PageBreak())

    for idx, item in enumerate(items, 1):
        claim = item.get("claim") or {}
        block = []
        block.append(Paragraph(f"{idx}. {esc(item.get('title'))}", h1))
        bits = [
            item.get("category") or "—",
            item.get("brand") or "no brand",
            f"size {item.get('size') or '—'}",
            item.get("locality") or "—",
        ]
        block.append(Paragraph(" · ".join(esc(b) for b in bits), meta))
        block.append(Paragraph(f"<b>Claimer:</b> {esc(claim.get('requesterName') or '—')}", body))
        block.append(Paragraph(f"<b>Scheduled:</b> {esc(claim.get('slotLabel') or '—')}", body))
        status = claim.get("deliveryStatus") or (claim.get("handoverStage") or "—").replace("_", " ")
        block.append(Paragraph(f"<b>Status:</b> {esc(status)}", body))

        folder = IMG_DIR / safe_name(item.get("slug") or item.get("id"))
        for d in item.get("downloaded") or []:
            img_path = folder / d["file"]
            if not img_path.exists():
                continue
            max_w, max_h = 160 * mm, 150 * mm
            img = Image(str(img_path))
            scale = min(max_w / img.imageWidth, max_h / img.imageHeight, 1.0)
            img.drawWidth = img.imageWidth * scale
            img.drawHeight = img.imageHeight * scale
            block.append(Spacer(1, 4 * mm))
            block.append(img)
            block.append(Paragraph(esc(d.get("imageType") or "image"), small))

        story.append(KeepTogether(block))
        if idx < len(items):
            story.append(PageBreak())

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#a8a29e"))
        canvas.drawString(16 * mm, 10 * mm, "Reloved — Delivered claims scheduled till today")
        canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main() -> None:
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    items = data["items"]
    HTML_PATH.write_text(build_html(items), encoding="utf-8")
    build_pdf(items)
    print(json.dumps({"count": len(items), "pdf": str(PDF_PATH), "titles": [i["title"] for i in items]}, indent=2))


if __name__ == "__main__":
    main()
