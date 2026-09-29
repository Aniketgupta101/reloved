/**
 * Export claimed items report (excluding Batch 0) + download HD images.
 *   node scripts/_tmp-export-claimed-report.js
 */
const fs = require("fs")
const path = require("path")
const https = require("https")
const http = require("http")

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8")
)
const access = cfg.tokens.access_token

const OUT = path.join(process.env.USERPROFILE, "Desktop", "Reloved-claimed-items-report")
const IMG_DIR = path.join(OUT, "hd-images")
fs.mkdirSync(IMG_DIR, { recursive: true })

function fieldVal(f) {
  if (!f) return null
  if (f.stringValue != null) return f.stringValue
  if (f.booleanValue != null) return f.booleanValue
  if (f.integerValue != null) return Number(f.integerValue)
  if (f.doubleValue != null) return f.doubleValue
  if (f.timestampValue != null) return f.timestampValue
  if (f.arrayValue) return (f.arrayValue.values || []).map(fieldVal)
  if (f.mapValue) {
    const o = {}
    for (const [k, v] of Object.entries(f.mapValue.fields || {})) o[k] = fieldVal(v)
    return o
  }
  if (f.nullValue !== undefined) return null
  return f
}

function req(method, fullPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const r = https.request(
      {
        hostname: "firestore.googleapis.com",
        path: fullPath,
        method,
        headers: {
          Authorization: "Bearer " + access,
          ...(data
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
            : {}),
        },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => {
          let p
          try {
            p = JSON.parse(b)
          } catch {
            p = b
          }
          resolve({ status: res.statusCode, body: p })
        })
      }
    )
    r.on("error", reject)
    if (data) r.write(data)
    r.end()
  })
}

async function listAll(collection) {
  const docs = []
  let pageToken = ""
  do {
    const url =
      "/v1/projects/reloved-digital/databases/(default)/documents/" +
      collection +
      "?pageSize=300" +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "")
    const list = await req("GET", url)
    if (list.status !== 200) {
      throw new Error(collection + " " + list.status + " " + JSON.stringify(list.body).slice(0, 300))
    }
    docs.push(...(list.body.documents || []))
    pageToken = list.body.nextPageToken || ""
  } while (pageToken)
  return docs
}

const BATCH1 = [
  "bluegrey striped boss",
  "red boss polo",
  "navy boss polo striped",
  "olive scotch",
  "sage giordano",
  "white giordano",
  "blauwrecords",
  "navy boss polo green",
  "white boss polo contrast",
  "canali floral",
  "canali arrow",
  "brooks brothers houndstooth",
  "canali crosshatch",
  "canali geometric",
  "boss chambray",
  "hugo wavydot",
]
const BATCH2 = [
  "black dress pants",
  "brooks brothers khaki",
  "boss charcoal",
  "armani jeans",
  "navy corduroy",
  "scotch and soda stuart",
  "scotch and soda mott",
  "brooks brothers soho",
  "scotch and soda thedrop",
]

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function matchesAny(title, needles) {
  const t = norm(title)
  return needles.some((n) => t.includes(norm(n)))
}

function classify(title, imagesJson) {
  if (matchesAny(title, BATCH1)) return "batch1"
  if (matchesAny(title, BATCH2)) return "batch2"
  if (String(imagesJson).includes("/curated/")) {
    if (/pant|chino|jean|corduroy/i.test(title)) return "batch2"
    return "batch1"
  }
  const t = norm(title)
  // Apostrophes become spaces in norm(), so "Don't Tell" → "don t tell"
  if (
    String(imagesJson).includes("/images/wall-items/") ||
    /kids|batman|marvel|hulk|thor|robin|spider|orca|shark|skeleton|converse|abercrombie|ralph lauren|true religion|hunter|surf|grunge|pajama|costume|don ?t tell|zanella|henley|chino shorts|cargo|moose|hisoka|lego|zara lemon|distressed|long sleeve crewneck|soft cotton|everyday crew|classic crew|navy crew/i.test(
      t
    )
  ) {
    return "batch0"
  }
  return "other"
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error("empty url"))
    const lib = url.startsWith("https") ? https : http
    const file = fs.createWriteStream(dest)
    lib
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          try {
            fs.unlinkSync(dest)
          } catch {}
          return download(res.headers.location, dest).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          file.close()
          try {
            fs.unlinkSync(dest)
          } catch {}
          return reject(new Error("HTTP " + res.statusCode + " " + url))
        }
        res.pipe(file)
        file.on("finish", () =>
          file.close(() => resolve({ bytes: fs.statSync(dest).size, status: res.statusCode }))
        )
      })
      .on("error", (e) => {
        try {
          fs.unlinkSync(dest)
        } catch {}
        reject(e)
      })
  })
}

function extFromUrl(url) {
  const m = String(url).match(/\.([a-zA-Z0-9]{3,4})(?:\?|$)/)
  return m ? m[1].toLowerCase() : "jpg"
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

;(async () => {
  const [items, requests] = await Promise.all([listAll("items"), listAll("itemRequests")])
  const reqByItem = {}
  for (const d of requests) {
    const f = d.fields || {}
    const itemId = fieldVal(f.itemId)
    if (!itemId) continue
    const rec = {
      requestId: d.name.split("/").pop(),
      status: fieldVal(f.status),
      handoverStage: fieldVal(f.handoverStage),
      requesterName: fieldVal(f.requesterName),
      requesterUsername: fieldVal(f.requesterUsername),
      requesterPhone: fieldVal(f.requesterPhone),
      requesterLocality: fieldVal(f.requesterLocality) || fieldVal(f.pickupLocality),
      requesterAddress: fieldVal(f.requesterAddress),
      note: fieldVal(f.note),
      createdAt: fieldVal(f.createdAt),
      reviewedAt: fieldVal(f.reviewedAt),
      handedOverAt: fieldVal(f.handedOverAt),
      giverLogistics: fieldVal(f.giverLogistics),
      photoStoragePath: fieldVal(f.photoStoragePath),
    }
    if (!reqByItem[itemId]) reqByItem[itemId] = []
    reqByItem[itemId].push(rec)
  }

  const claimed = []
  for (const doc of items) {
    const f = doc.fields || {}
    const publicStatus = fieldVal(f.publicStatus) || ""
    if (publicStatus !== "claimed") continue
    const title = fieldVal(f.title) || ""
    const imagesRaw = fieldVal(f.images) || []
    const images = Array.isArray(imagesRaw) ? imagesRaw : Object.values(imagesRaw || {})
    const batch = classify(title, JSON.stringify(images))
    if (batch === "batch0") continue
    const id = doc.name.split("/").pop()
    const reqs = (reqByItem[id] || [])
      .slice()
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    const approved = reqs.find((r) => r.status === "approved") || null
    claimed.push({
      id,
      title,
      batch,
      slug: fieldVal(f.slug),
      category: fieldVal(f.category),
      brand: fieldVal(f.brand),
      size: fieldVal(f.size),
      condition: fieldVal(f.condition),
      gender: fieldVal(f.gender),
      locality: fieldVal(f.locality),
      publicArea: fieldVal(f.publicArea),
      giverLogistics: fieldVal(f.giverLogistics),
      donorRecognition: fieldVal(f.donorRecognition),
      ownerEmail: fieldVal(f.ownerEmail) || fieldVal(f.donorEmail),
      status: fieldVal(f.status),
      publicStatus,
      createdAt: fieldVal(f.createdAt),
      updatedAt: fieldVal(f.updatedAt),
      images: images.map((img) => ({
        imageType: img.imageType,
        storagePath: img.storagePath,
        bgRemoved: !!img.bgRemoved,
        sortOrder: img.sortOrder,
      })),
      claim: approved
        ? {
            requestId: approved.requestId,
            requesterName: approved.requesterName,
            requesterUsername: approved.requesterUsername,
            requesterPhone: approved.requesterPhone,
            requesterLocality: approved.requesterLocality,
            handoverStage: approved.handoverStage,
            claimedAt: approved.reviewedAt || approved.createdAt,
            handedOverAt: approved.handedOverAt,
            note: approved.note,
            giverLogistics: approved.giverLogistics,
          }
        : null,
      allRequests: reqs.map((r) => ({
        requestId: r.requestId,
        status: r.status,
        handoverStage: r.handoverStage,
        requesterName: r.requesterName,
        createdAt: r.createdAt,
      })),
    })
  }

  claimed.sort((a, b) => String(a.title).localeCompare(String(b.title)))

  const downloadLog = []
  for (const item of claimed) {
    const folder = path.join(IMG_DIR, safeName(item.slug || item.id))
    fs.mkdirSync(folder, { recursive: true })
    const ordered = [...item.images].sort((a, b) => {
      const rank = (t) => (t === "original" ? 0 : t === "modelled" ? 1 : 2)
      return rank(a.imageType) - rank(b.imageType) || (a.sortOrder || 0) - (b.sortOrder || 0)
    })
    const saved = []
    for (let i = 0; i < ordered.length; i++) {
      const img = ordered[i]
      const url = img.storagePath
      if (!url) continue
      const ext = extFromUrl(url)
      const fname = String(i + 1).padStart(2, "0") + "_" + (img.imageType || "image") + "." + ext
      const dest = path.join(folder, fname)
      try {
        const r = await download(url, dest)
        saved.push({ file: fname, url, bytes: r.bytes, imageType: img.imageType })
      } catch (e) {
        saved.push({ file: fname, url, error: String(e.message || e) })
      }
    }
    item.downloaded = saved
    downloadLog.push({
      id: item.id,
      title: item.title,
      saved: saved.filter((s) => !s.error).length,
      errors: saved.filter((s) => s.error).length,
    })
  }

  fs.writeFileSync(
    path.join(OUT, "claimed-items.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), exclude: "batch0", count: claimed.length, items: claimed },
      null,
      2
    )
  )

  const csvEsc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"'
  const headers = [
    "title",
    "batch",
    "slug",
    "id",
    "category",
    "brand",
    "size",
    "condition",
    "gender",
    "locality",
    "giverLogistics",
    "donorRecognition",
    "ownerEmail",
    "claimerName",
    "claimerUsername",
    "claimerPhone",
    "claimerLocality",
    "handoverStage",
    "claimedAt",
    "handedOverAt",
    "hdImageCount",
    "wallUrl",
  ]
  const rows = claimed.map((c) =>
    [
      c.title,
      c.batch,
      c.slug,
      c.id,
      c.category,
      c.brand,
      c.size,
      c.condition,
      c.gender,
      c.locality,
      c.giverLogistics || c.claim?.giverLogistics,
      c.donorRecognition,
      c.ownerEmail,
      c.claim?.requesterName,
      c.claim?.requesterUsername,
      c.claim?.requesterPhone,
      c.claim?.requesterLocality,
      c.claim?.handoverStage,
      c.claim?.claimedAt,
      c.claim?.handedOverAt,
      (c.downloaded || []).filter((d) => !d.error).length,
      "https://reloved.digital/item/" + (c.slug || c.id),
    ]
      .map(csvEsc)
      .join(",")
  )
  fs.writeFileSync(path.join(OUT, "claimed-items.csv"), headers.join(",") + "\n" + rows.join("\n"))

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
          .join("") || '<p class="muted">No images downloaded</p>'
      const claim = c.claim
        ? "<dl>" +
          "<dt>Claimer</dt><dd>" +
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
        : '<p class="muted">No approved claim record found (status set to claimed without itemRequest).</p>'
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
    "figure{margin:0;width:220px} img{width:100%;height:280px;object-fit:contain;background:#fafaf9;border:1px solid var(--line);border-radius:8px}" +
    "figcaption{font-size:12px;color:var(--muted);margin-top:4px}" +
    ".muted{color:var(--muted)} code{font-size:12px}" +
    "table{border-collapse:collapse;width:100%;margin:16px 0 28px;background:#fff}" +
    "th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;font-size:14px}" +
    "th{background:#f5f5f4}" +
    "</style></head><body>" +
    "<h1>Claimed items report</h1>" +
    '<p class="sub">Excludes Batch 0 (pre-seeded closet). Generated ' +
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
      {
        out: OUT,
        count: claimed.length,
        downloads: downloadLog,
        titles: claimed.map((c) => ({
          title: c.title,
          batch: c.batch,
          claimer: c.claim?.requesterName || null,
          handover: c.claim?.handoverStage || null,
          imgs: (c.downloaded || []).filter((d) => !d.error).length,
        })),
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
