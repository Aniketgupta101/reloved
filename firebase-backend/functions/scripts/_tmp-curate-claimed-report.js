/**
 * Curate claimed-report images per ops selection, rewrite report.html
 *   node scripts/_tmp-curate-claimed-report.js
 */
const fs = require("fs")
const path = require("path")

const OUT = path.join(process.env.USERPROFILE, "Desktop", "Reloved-claimed-items-report")
const IMG_DIR = path.join(OUT, "hd-images")
const j = JSON.parse(fs.readFileSync(path.join(OUT, "claimed-items.json"), "utf8"))

// 1-based keep indices from user (by current downloaded order)
const KEEP = {
  "Adidas Track Pants": [2],
  "Animal Print Bodycon Dress": [2],
  "Black Leather Jacket": [2],
  "BOSS Black Polo Shirt": [2],
  "BOSS Red Polo Shirt(Regular Fit)": [2],
  "Canali Men's Patterned Long-Sleeve Shirt": [1],
  "Colorful Embroidered Sling Bag": [2],
  "HRX Performance T-shirt": [1],
  "Pink Corduroy Cropped Jacket": [1],
}

function safeName(s) {
  return String(s || "item")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80)
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

for (const item of j.items) {
  const keep = KEEP[item.title]
  if (!keep) continue
  const folder = path.join(IMG_DIR, safeName(item.slug || item.id))
  const before = [...(item.downloaded || [])]
  item.downloaded = before.filter((_d, i) => keep.includes(i + 1))
  for (let i = 0; i < before.length; i++) {
    if (keep.includes(i + 1)) continue
    const f = path.join(folder, before[i].file)
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }
}

j.generatedAt = new Date().toISOString()
j.note = "Image selection curated per ops request"
fs.writeFileSync(path.join(OUT, "claimed-items.json"), JSON.stringify(j, null, 2))

const claimed = j.items

const tableRows = claimed
  .map(
    (c, i) =>
      "<tr><td>" +
      (i + 1) +
      "</td><td>" +
      esc(c.title) +
      "</td><td>" +
      esc(c.batch) +
      "</td><td>" +
      esc(c.claim?.requesterName || "—") +
      "</td><td>" +
      esc(c.claim?.handoverStage || "—") +
      "</td><td>" +
      (c.downloaded || []).filter((d) => !d.error).length +
      "</td></tr>"
  )
  .join("")

const cards = claimed
  .map((c) => {
    const imgs =
      (c.downloaded || [])
        .filter((d) => !d.error)
        .map(
          (d) =>
            "<figure><img src=\"hd-images/" +
            safeName(c.slug || c.id) +
            "/" +
            d.file +
            "\" alt=\"" +
            esc(c.title) +
            " " +
            esc(d.imageType) +
            "\"/><figcaption>" +
            esc(d.imageType) +
            " · " +
            Math.round((d.bytes || 0) / 1024) +
            " KB</figcaption></figure>"
        )
        .join("") || '<p class="muted">No images</p>'
    const claim = c.claim
      ? "<dl><dt>Claimer</dt><dd>" +
        esc(c.claim.requesterName || "—") +
        (c.claim.requesterUsername ? " (@" + esc(c.claim.requesterUsername) + ")" : "") +
        "</dd>" +
        "<dt>Phone</dt><dd>" +
        esc(c.claim.requesterPhone || "—") +
        "</dd>" +
        "<dt>Locality</dt><dd>" +
        esc(c.claim.requesterLocality || "—") +
        "</dd>" +
        "<dt>Handover</dt><dd>" +
        esc(c.claim.handoverStage || "—") +
        "</dd>" +
        "<dt>Claimed at</dt><dd>" +
        esc(c.claim.claimedAt || "—") +
        "</dd>" +
        "<dt>Handed over</dt><dd>" +
        esc(c.claim.handedOverAt || "—") +
        "</dd></dl>"
      : '<p class="muted">No approved claim record found.</p>'
    return (
      '<section class="card"><h2>' +
      esc(c.title) +
      '</h2><p class="meta">' +
      esc(c.batch) +
      " · " +
      esc(c.category || "—") +
      " · " +
      esc(c.brand || "no brand") +
      " · size " +
      esc(c.size || "—") +
      " · " +
      esc(c.condition || "—") +
      " · " +
      esc(c.locality || "—") +
      "</p><p><a href=\"https://reloved.digital/item/" +
      esc(c.slug || c.id) +
      "\" target=\"_blank\">Open on wall</a> · id <code>" +
      esc(c.id) +
      "</code></p>" +
      claim +
      '<div class="gallery">' +
      imgs +
      "</div></section>"
    )
  })
  .join("\n")

const html =
  "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Claimed items report (excl. Batch 0)</title>" +
  "<style>" +
  ":root{--bg:#f7f4ef;--ink:#1c1917;--muted:#78716c;--card:#fff;--line:#e7e5e4}" +
  "body{font-family:Georgia,serif;background:var(--bg);color:var(--ink);margin:0;padding:32px}" +
  "h1{font-size:28px;margin:0 0 8px}.sub{color:var(--muted);margin-bottom:28px}" +
  ".card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 24px;margin-bottom:20px}" +
  ".meta{color:var(--muted);margin:4px 0 12px}" +
  "dl{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin:12px 0}" +
  "dt{color:var(--muted)} dd{margin:0}" +
  ".gallery{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}" +
  "figure{margin:0;width:280px} img{width:100%;height:360px;object-fit:contain;background:#fafaf9;border:1px solid var(--line);border-radius:8px}" +
  "figcaption{font-size:12px;color:var(--muted);margin-top:4px}" +
  ".muted{color:var(--muted)} code{font-size:12px}" +
  "table{border-collapse:collapse;width:100%;margin:16px 0 28px;background:#fff}" +
  "th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;font-size:14px}" +
  "th{background:#f5f5f4}" +
  "</style></head><body>" +
  "<h1>Claimed items report</h1>" +
  '<p class="sub">Excludes Batch 0. Curated images · Generated ' +
  new Date().toISOString() +
  " · " +
  claimed.length +
  " items</p>" +
  "<table><thead><tr><th>#</th><th>Title</th><th>Batch</th><th>Claimer</th><th>Handover</th><th>HD imgs</th></tr></thead><tbody>" +
  tableRows +
  "</tbody></table>" +
  cards +
  "</body></html>"

fs.writeFileSync(path.join(OUT, "report.html"), html)

console.log(
  JSON.stringify(
    claimed.map((c) => ({ title: c.title, kept: (c.downloaded || []).map((d) => d.file) })),
    null,
    2
  )
)
