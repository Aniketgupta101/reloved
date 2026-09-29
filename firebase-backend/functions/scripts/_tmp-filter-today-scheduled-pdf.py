"""
Filter claimed report to items scheduled for today (IST), rebuild HTML + PDF.
  python scripts/_tmp-filter-today-scheduled-pdf.py
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone, timedelta
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

# Items with proposed/agreed slot on 2026-09-29 (IST) from Firestore
TODAY_SCHEDULED_IDS = {
    "2hBW3NhD51AdeRkjy3RT",  # Colorful Embroidered Sling Bag — 14:30 IST proposed
    "YVPpkTX5lNR2D8fJJx1w",  # Animal Print Bodycon Dress — 10:30 delivered
    "iElsGgahUMnfVCgVftJT",  # Green Clutch Bag — 14:30 delivered
    "Vi2Kc8xYTTr0prVGejrz",  # Black Sequin Clutch Bag — 14:30 proposed
}

SLOT_META = {
    "2hBW3NhD51AdeRkjy3RT": {
        "slot": "2026-09-29T14:30:00.000Z",
        "slotLabel": "29 Sep 2026, 8:00 PM IST",
        "deliveryStatus": None,
    },
    "YVPpkTX5lNR2D8fJJx1w": {
        "slot": "2026-09-29T10:30:00.000Z",
        "slotLabel": "29 Sep 2026, 4:00 PM IST",
        "deliveryStatus": "delivered",
    },
    "iElsGgahUMnfVCgVftJT": {
        "slot": "2026-09-29T14:30:00.000Z",
        "slotLabel": "29 Sep 2026, 8:00 PM IST",
        "deliveryStatus": "delivered",
    },
    "Vi2Kc8xYTTr0prVGejrz": {
        "slot": "2026-09-29T14:30:00.000Z",
        "slotLabel": "29 Sep 2026, 8:00 PM IST",
        "deliveryStatus": None,
    },
}


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
    table_rows = []
    cards = []
    for i, c in enumerate(items, 1):
        claim = c.get("claim") or {}
        meta = SLOT_META.get(c["id"], {})
        table_rows.append(
            "<tr><td>"
            + str(i)
            + "</td><td>"
            + esc(c["title"])
            + "</td><td>"
            + esc(claim.get("requesterName") or "—")
            + "</td><td>"
            + esc((claim.get("handoverStage") or "—").replace("_", " "))
            + "</td><td>"
            + esc(meta.get("slotLabel") or "—")
            + "</td><td>"
            + esc(meta.get("deliveryStatus") or claim.get("handoverStage") or "—")
            + "</td></tr>"
        )
        imgs = ""
        for d in c.get("downloaded") or []:
            if d.get("error"):
                continue
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
            + "<dt>Handover</dt><dd>"
            + esc((claim.get("handoverStage") or "—").replace("_", " "))
            + "</dd>"
            + "<dt>Scheduled</dt><dd>"
            + esc(meta.get("slotLabel") or "—")
            + "</dd>"
            + "<dt>Delivery</dt><dd>"
            + esc(meta.get("deliveryStatus") or "pending")
            + "</dd></dl>"
            + '<div class="gallery">'
            + (imgs or '<p class="muted">No image</p>')
            + "</div></section>"
        )

    return (
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>"
        "<title>Claimed items scheduled for today</title>"
        "<style>"
        "body{font-family:Georgia,serif;background:#f7f4ef;color:#1c1917;margin:0;padding:32px}"
        "h1{font-size:28px;margin:0 0 8px}.sub{color:#78716c;margin-bottom:28px}"
        ".card{background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:20px 24px;margin-bottom:20px}"
        ".meta{color:#78716c;margin:4px 0 12px}"
        "dl{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin:12px 0}"
        "dt{color:#78716c} dd{margin:0}"
        ".gallery{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}"
        "figure{margin:0;width:280px} img{width:100%;height:360px;object-fit:contain;background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px}"
        "table{border-collapse:collapse;width:100%;margin:16px 0 28px;background:#fff}"
        "th,td{border:1px solid #e7e5e4;padding:8px 10px;text-align:left;font-size:14px}"
        "th{background:#f5f5f4}"
        "</style></head><body>"
        "<h1>Claimed items — scheduled for today</h1>"
        '<p class="sub">29 Sep 2026 (IST) · '
        + str(len(items))
        + " items with handover slots today</p>"
        "<table><thead><tr><th>#</th><th>Item</th><th>Claimer</th><th>Handover</th>"
        "<th>Scheduled</th><th>Delivery</th></tr></thead><tbody>"
        + "".join(table_rows)
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
        fontSize=24,
        leading=30,
        textColor=colors.HexColor("#1c1917"),
        alignment=TA_CENTER,
        spaceAfter=8,
    )
    subtitle = ParagraphStyle(
        "CoverSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=16,
        textColor=colors.HexColor("#78716c"),
        alignment=TA_CENTER,
        spaceAfter=6,
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
    th_style = ParagraphStyle(
        "Th", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9
    )
    td_style = ParagraphStyle(
        "Td", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=12
    )
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
        title="Reloved — Today's Scheduled Claims",
        author="Reloved",
    )
    story = []
    story.append(Spacer(1, 36 * mm))
    story.append(Paragraph("Reloved", title_style))
    story.append(Paragraph("Today's Scheduled Claims", title_style))
    story.append(Spacer(1, 4 * mm))
    story.append(
        Paragraph(
            f"{len(items)} claimed items scheduled for handover on 29 Sep 2026 (IST)",
            subtitle,
        )
    )
    story.append(PageBreak())

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
        sm = SLOT_META.get(item["id"], {})
        status = sm.get("deliveryStatus") or (claim.get("handoverStage") or "—").replace("_", " ")
        rows.append(
            [
                Paragraph(str(i), td_style),
                Paragraph(esc(item.get("title")), td_style),
                Paragraph(esc(claim.get("requesterName") or "—"), td_style),
                Paragraph(esc(sm.get("slotLabel") or "—"), td_style),
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
        sm = SLOT_META.get(item["id"], {})
        block = []
        block.append(Paragraph(f"{idx}. {esc(item.get('title'))}", h1))
        bits = [
            item.get("category") or "—",
            item.get("brand") or "no brand",
            f"size {item.get('size') or '—'}",
            item.get("locality") or "—",
        ]
        block.append(Paragraph(" · ".join(esc(b) for b in bits), meta))
        block.append(
            Paragraph(f"<b>Claimer:</b> {esc(claim.get('requesterName') or '—')}", body)
        )
        block.append(
            Paragraph(
                f"<b>Handover:</b> {esc((claim.get('handoverStage') or '—').replace('_', ' '))}",
                body,
            )
        )
        block.append(Paragraph(f"<b>Scheduled:</b> {esc(sm.get('slotLabel') or '—')}", body))
        block.append(
            Paragraph(
                f"<b>Delivery:</b> {esc(sm.get('deliveryStatus') or 'pending')}",
                body,
            )
        )

        folder = IMG_DIR / safe_name(item.get("slug") or item.get("id"))
        for d in item.get("downloaded") or []:
            if d.get("error"):
                continue
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
        canvas.drawString(16 * mm, 10 * mm, "Reloved — Today's scheduled claims")
        canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main() -> None:
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    filtered = [i for i in data["items"] if i["id"] in TODAY_SCHEDULED_IDS]
    # Stable order by schedule time then title
    filtered.sort(
        key=lambda i: (
            SLOT_META.get(i["id"], {}).get("slot") or "",
            i.get("title") or "",
        )
    )

    out_data = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "filter": "scheduled_for_2026-09-29_IST",
        "count": len(filtered),
        "items": filtered,
    }
    JSON_PATH.write_text(json.dumps(out_data, indent=2), encoding="utf-8")
    HTML_PATH.write_text(build_html(filtered), encoding="utf-8")
    build_pdf(filtered)
    print(json.dumps({"count": len(filtered), "titles": [i["title"] for i in filtered], "pdf": str(PDF_PATH)}, indent=2))


if __name__ == "__main__":
    main()
