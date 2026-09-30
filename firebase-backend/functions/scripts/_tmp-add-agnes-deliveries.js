/**
 * Add Agnes Menezes deliveries into claimed-items.json and keep curated images.
 *   node scripts/_tmp-add-agnes-deliveries.js
 */
const fs = require("fs")
const path = require("path")
const https = require("https")

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8")
)
const access = cfg.tokens.access_token
const OUT = path.join(process.env.USERPROFILE, "Desktop", "Reloved-claimed-items-report")
const IMG_DIR = path.join(OUT, "hd-images")

const AGNES_ITEM_IDS = ["2hBW3NhD51AdeRkjy3RT", "Vi2Kc8xYTTr0prVGejrz"]
// curated: sling bag keep 2nd (modelled); sequin only has 1
const KEEP_BY_TITLE = {
  "Colorful Embroidered Sling Bag": [2],
  "Black Sequin Clutch Bag": [1],
}

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

function req(method, fullPath) {
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        hostname: "firestore.googleapis.com",
        path: fullPath,
        method,
        headers: { Authorization: "Bearer " + access },
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
    r.end()
  })
}

function istDate(iso) {
  if (!iso) return null
  return new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function istLabel(iso) {
  if (!iso) return null
  const d = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return (
    d.getUTCDate() +
    " " +
    months[d.getUTCMonth()] +
    " " +
    d.getUTCFullYear() +
    ", " +
    String(d.getUTCHours()).padStart(2, "0") +
    ":" +
    String(d.getUTCMinutes()).padStart(2, "0") +
    " IST"
  )
}

function safeName(s) {
  return String(s || "item")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80)
}

function httpsGet(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          try {
            fs.unlinkSync(dest)
          } catch {}
          return httpsGet(res.headers.location, dest).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          file.close()
          try {
            fs.unlinkSync(dest)
          } catch {}
          return reject(new Error("HTTP " + res.statusCode))
        }
        res.pipe(file)
        file.on("finish", () => file.close(() => resolve(fs.statSync(dest).size)))
      })
      .on("error", (e) => {
        try {
          fs.unlinkSync(dest)
        } catch {}
        reject(e)
      })
  })
}

;(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(OUT, "claimed-items.json"), "utf8"))
  const existing = new Set(data.items.map((i) => i.id))

  // load requests for claim meta
  const reqDocs = []
  let pageToken = ""
  do {
    const url =
      "/v1/projects/reloved-digital/databases/(default)/documents/itemRequests?pageSize=300" +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "")
    const list = await req("GET", url)
    reqDocs.push(...(list.body.documents || []))
    pageToken = list.body.nextPageToken || ""
  } while (pageToken)

  const claimByItem = {}
  for (const d of reqDocs) {
    const f = d.fields || {}
    if (fieldVal(f.status) !== "approved") continue
    const itemId = fieldVal(f.itemId)
    if (!AGNES_ITEM_IDS.includes(itemId)) continue
    const slot = fieldVal(f.agreedSlotAt) || fieldVal(f.proposedSlotAt)
    claimByItem[itemId] = {
      requesterName: fieldVal(f.requesterName),
      requesterUsername: fieldVal(f.requesterUsername),
      requesterLocality: fieldVal(f.requesterLocality) || fieldVal(f.pickupLocality),
      handoverStage: fieldVal(f.handoverStage),
      claimedAt: fieldVal(f.reviewedAt) || fieldVal(f.createdAt),
      handedOverAt: fieldVal(f.handedOverAt),
      deliveryStatus: fieldVal(f.deliveryStatus) || "scheduled",
      slot,
      slotDay: istDate(slot),
      slotLabel: istLabel(slot),
    }
  }

  for (const itemId of AGNES_ITEM_IDS) {
    if (existing.has(itemId)) continue
    const itemRes = await req(
      "GET",
      "/v1/projects/reloved-digital/databases/(default)/documents/items/" + itemId
    )
    if (itemRes.status !== 200) throw new Error("item " + itemId + " " + itemRes.status)
    const f = itemRes.body.fields || {}
    const title = fieldVal(f.title) || ""
    const imagesRaw = fieldVal(f.images) || []
    const images = Array.isArray(imagesRaw) ? imagesRaw : Object.values(imagesRaw || {})
    const slug = fieldVal(f.slug)
    const claim = claimByItem[itemId]

    const ordered = [...images].sort((a, b) => {
      const rank = (t) => (t === "original" ? 0 : t === "modelled" ? 1 : 2)
      return rank(a.imageType) - rank(b.imageType) || (a.sortOrder || 0) - (b.sortOrder || 0)
    })
    const keepIdx = KEEP_BY_TITLE[title] || ordered.map((_, i) => i + 1)
    const folder = path.join(IMG_DIR, safeName(slug || itemId))
    fs.mkdirSync(folder, { recursive: true })
    for (const fn of fs.readdirSync(folder)) {
      if (/\.(png|jpe?g|webp)$/i.test(fn)) fs.unlinkSync(path.join(folder, fn))
    }
    const downloaded = []
    for (let i = 0; i < ordered.length; i++) {
      if (!keepIdx.includes(i + 1)) continue
      const img = ordered[i]
      const m = String(img.storagePath).match(/\.([a-zA-Z0-9]{3,4})(?:\?|$)/)
      const ext = m ? m[1].toLowerCase() : "jpg"
      const fname = String(downloaded.length + 1).padStart(2, "0") + "_" + (img.imageType || "image") + "." + ext
      const dest = path.join(folder, fname)
      await httpsGet(img.storagePath, dest)
      downloaded.push({
        file: fname,
        url: img.storagePath,
        bytes: fs.statSync(dest).size,
        imageType: img.imageType,
      })
    }

    data.items.push({
      id: itemId,
      title,
      batch: "other",
      slug,
      category: fieldVal(f.category),
      brand: fieldVal(f.brand),
      size: fieldVal(f.size),
      condition: fieldVal(f.condition),
      locality: fieldVal(f.locality),
      claim,
      downloaded,
    })
  }

  data.items.sort((a, b) =>
    String(a.claim?.slot || a.claim?.claimedAt || "").localeCompare(
      String(b.claim?.slot || b.claim?.claimedAt || "")
    )
  )
  data.count = data.items.length
  data.generatedAt = new Date().toISOString()
  data.note = "Includes Agnes Menezes scheduled deliveries for 29 Sep"
  fs.writeFileSync(path.join(OUT, "claimed-items.json"), JSON.stringify(data, null, 2))
  console.log(
    JSON.stringify(
      {
        count: data.count,
        titles: data.items.map((i) => ({ title: i.title, claimer: i.claim?.requesterName, imgs: i.downloaded?.length })),
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
