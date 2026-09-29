"""
Build a client-shareable PDF of curated claimed items.
  python scripts/_tmp-build-claimed-pdf.py
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
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
IMG_DIR = OUT / "hd-images"


def safe_name(s: str) -> str:
    import re

    return re.sub(r"_+", "_", re.sub(r"[^a-zA-Z0-9._-]+", "_", s or "item"))[:80]


def esc(s) -> str:
    return (
        str(s if s is not None else "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def main() -> None:
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    items = data["items"]

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CoverTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=26,
        leading=32,
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
        spaceBefore=0,
        spaceAfter=6,
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
    body = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1c1917"),
        spaceAfter=3,
    )
    small = ParagraphStyle(
        "Small",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#78716c"),
        alignment=TA_CENTER,
    )
    th_style = ParagraphStyle(
        "Th",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        textColor=colors.HexColor("#1c1917"),
    )
    td_style = ParagraphStyle(
        "Td",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#1c1917"),
    )

    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Reloved — Claimed Items Report",
        author="Reloved",
        subject="Claimed items (excluding Batch 0 seed inventory)",
    )

    story = []
    generated = datetime.now(timezone.utc).strftime("%d %b %Y")

    story.append(Spacer(1, 40 * mm))
    story.append(Paragraph("Reloved", title_style))
    story.append(Paragraph("Claimed Items Report", title_style))
    story.append(Spacer(1, 6 * mm))
    story.append(
        Paragraph(
            f"{len(items)} claimed items · Batch 0 seed inventory excluded<br/>Generated {generated}",
            subtitle,
        )
    )
    story.append(Spacer(1, 10 * mm))
    story.append(
        Paragraph(
            "Curated product images for client review. Each item below includes the selected HD photo, item details, claimer name, and handover status.",
            ParagraphStyle(
                "Intro",
                parent=subtitle,
                alignment=TA_CENTER,
                fontSize=10,
                leading=14,
            ),
        )
    )
    story.append(PageBreak())

    # Summary table
    story.append(Paragraph("Summary", h1))
    story.append(Spacer(1, 3 * mm))
    header = [
        Paragraph("#", th_style),
        Paragraph("Item", th_style),
        Paragraph("Claimer", th_style),
        Paragraph("Handover", th_style),
    ]
    rows = [header]
    for i, item in enumerate(items, 1):
        claim = item.get("claim") or {}
        rows.append(
            [
                Paragraph(str(i), td_style),
                Paragraph(esc(item.get("title")), td_style),
                Paragraph(esc(claim.get("requesterName") or "—"), td_style),
                Paragraph(esc((claim.get("handoverStage") or "—").replace("_", " ")), td_style),
            ]
        )

    table = Table(rows, colWidths=[12 * mm, 85 * mm, 45 * mm, 40 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f4")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e7e5e4")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafaf9")]),
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
            item.get("condition") or "—",
            item.get("locality") or "—",
        ]
        block.append(Paragraph(" · ".join(esc(b) for b in bits), meta))

        block.append(
            Paragraph(
                f"<b>Claimer:</b> {esc(claim.get('requesterName') or '—')}"
                + (
                    f" (@{esc(claim.get('requesterUsername'))})"
                    if claim.get("requesterUsername")
                    else ""
                ),
                body,
            )
        )
        block.append(
            Paragraph(
                f"<b>Handover:</b> {esc((claim.get('handoverStage') or '—').replace('_', ' '))}",
                body,
            )
        )
        if claim.get("requesterLocality"):
            block.append(
                Paragraph(f"<b>Claimer locality:</b> {esc(claim.get('requesterLocality'))}", body)
            )

        downloaded = [d for d in (item.get("downloaded") or []) if not d.get("error")]
        folder = IMG_DIR / safe_name(item.get("slug") or item.get("id"))
        for d in downloaded:
            img_path = folder / d["file"]
            if not img_path.exists():
                continue
            # Fit image nicely on page
            max_w = 160 * mm
            max_h = 150 * mm
            img = Image(str(img_path))
            iw, ih = img.imageWidth, img.imageHeight
            scale = min(max_w / iw, max_h / ih, 1.0)
            img.drawWidth = iw * scale
            img.drawHeight = ih * scale
            block.append(Spacer(1, 4 * mm))
            block.append(img)
            block.append(
                Paragraph(
                    f"{esc(d.get('imageType') or 'image')} · {max(1, round((d.get('bytes') or 0) / 1024))} KB",
                    small,
                )
            )

        story.append(KeepTogether(block))
        if idx < len(items):
            story.append(Spacer(1, 8 * mm))
            # Soft page break every 2 items for breathing room with large images
            if idx % 2 == 0:
                story.append(PageBreak())

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#a8a29e"))
        canvas.drawString(16 * mm, 10 * mm, "Reloved — Claimed Items Report (confidential)")
        canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(str(PDF_PATH))
    print(f"pages_items={len(items)} size_bytes={PDF_PATH.stat().st_size}")


if __name__ == "__main__":
    main()
