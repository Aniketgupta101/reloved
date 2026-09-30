/**
 * Rebuild claimed report: all items scheduled/delivered on or before today (IST).
 * Excludes future schedules. Then run Python PDF builder.
 *   node scripts/_tmp-rebuild-till-today.js
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
const TODAY = "2026-09-29"

const KEEP_BY_TITLE = {
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

function req(fullPath) {
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        hostname: "firestore.googleapis.com",
        path: fullPath,
        method: "GET",
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

async function listAll(col) {
  const docs = []
  let pageToken = ""
  do {
    const url =
      "/v1/projects/reloved-digital/databases/(default)/documents/" +
      col +
      "?pageSize=300" +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "")
    const list = await req(url)
    if (list.status !== 200) throw new Error(col + " " + list.status)
    docs.push(...(list.body.documents || []))
    pageToken = list.body.nextPageToken || ""
  } while (pageToken)
  return docs
}

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
    return /pant|chino|jean|corduroy/i.test(title) ? "batch2" : "batch1"
  }
  const t = norm(title)
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

function istDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function istLabel(iso) {
  if (!iso) return null
  const d = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  return d.getUTCDate() + " " + months[d.getUTCMonth()] + " " + d.getUTCFullYear() + ", " + hh + ":" + mm + " IST"
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
  const [items, requests] = await Promise.all([listAll("items"), listAll("itemRequests")])
  const reqByItem = {}
  for (const d of requests) {
    const f = d.fields || {}
    if (fieldVal(f.status) !== "approved") continue
    const itemId = fieldVal(f.itemId)
    if (!itemId) continue
    const slot = fieldVal(f.agreedSlotAt) || fieldVal(f.proposedSlotAt)
    const rec = {
      requesterName: fieldVal(f.requesterName),
      requesterUsername: fieldVal(f.requesterUsername),
      requesterLocality: fieldVal(f.requesterLocality) || fieldVal(f.pickupLocality),
      handoverStage: fieldVal(f.handoverStage),
      claimedAt: fieldVal(f.reviewedAt) || fieldVal(f.createdAt),
      handedOverAt: fieldVal(f.handedOverAt),
      deliveryStatus: fieldVal(f.deliveryStatus),
      deliveryUpdatedAt: fieldVal(f.deliveryUpdatedAt),
      slot,
      slotDay: istDate(slot),
      slotLabel: istLabel(slot),
    }
    if (!reqByItem[itemId] || String(rec.claimedAt) > String(reqByItem[itemId].claimedAt || "")) {
      reqByItem[itemId] = rec
    }
  }

  const claimed = []
  for (const doc of items) {
    const f = doc.fields || {}
    if ((fieldVal(f.publicStatus) || "") !== "claimed") continue
    const title = fieldVal(f.title) || ""
    const imagesRaw = fieldVal(f.images) || []
    const images = Array.isArray(imagesRaw) ? imagesRaw : Object.values(imagesRaw || {})
    const batch = classify(title, JSON.stringify(images))
    if (batch === "batch0") continue
    const id = doc.name.split("/").pop()
    const claim = reqByItem[id]
    if (!claim) continue

    const slotDay = claim.slotDay
    const delivered =
      claim.deliveryStatus === "delivered" ||
      claim.handoverStage === "handed_over" ||
      Boolean(claim.handedOverAt)
    const scheduledTillToday = Boolean(slotDay && slotDay <= TODAY)
    const completedNoSlot =
      !slotDay &&
      delivered &&
      (istDate(claim.handedOverAt || claim.deliveryUpdatedAt || claim.claimedAt) || "9999") <= TODAY

    // All items scheduled on/before today that are delivered/handed over,
    // plus early completions with no schedule slot.
    if (!((scheduledTillToday && delivered) || completedNoSlot)) continue

    claimed.push({
      id,
      title,
      batch,
      slug: fieldVal(f.slug),
      category: fieldVal(f.category),
      brand: fieldVal(f.brand),
      size: fieldVal(f.size),
      condition: fieldVal(f.condition),
      locality: fieldVal(f.locality),
      images: images.map((img) => ({
        imageType: img.imageType,
        storagePath: img.storagePath,
        bgRemoved: !!img.bgRemoved,
        sortOrder: img.sortOrder,
      })),
      claim: {
        requesterName: claim.requesterName,
        requesterUsername: claim.requesterUsername,
        requesterLocality: claim.requesterLocality,
        handoverStage: claim.handoverStage,
        claimedAt: claim.claimedAt,
        handedOverAt: claim.handedOverAt,
        deliveryStatus: claim.deliveryStatus || (delivered ? "delivered" : null),
        slot: claim.slot,
        slotDay: claim.slotDay,
        slotLabel: claim.slotLabel,
      },
      downloaded: [],
    })
  }

  for (const item of claimed) {
    const folder = path.join(IMG_DIR, safeName(item.slug || item.id))
    fs.mkdirSync(folder, { recursive: true })
    // clear old files so only curated remain
    for (const fn of fs.readdirSync(folder)) {
      if (/\.(png|jpe?g|webp)$/i.test(fn)) fs.unlinkSync(path.join(folder, fn))
    }
    const ordered = [...item.images].sort((a, b) => {
      const rank = (t) => (t === "original" ? 0 : t === "modelled" ? 1 : 2)
      return rank(a.imageType) - rank(b.imageType) || (a.sortOrder || 0) - (b.sortOrder || 0)
    })
    const keepIdx = KEEP_BY_TITLE[item.title] || ordered.map((_, i) => i + 1)
    const saved = []
    for (let i = 0; i < ordered.length; i++) {
      if (!keepIdx.includes(i + 1)) continue
      const img = ordered[i]
      const m = String(img.storagePath).match(/\.([a-zA-Z0-9]{3,4})(?:\?|$)/)
      const ext = m ? m[1].toLowerCase() : "jpg"
      const fname = String(saved.length + 1).padStart(2, "0") + "_" + (img.imageType || "image") + "." + ext
      const dest = path.join(folder, fname)
      await httpsGet(img.storagePath, dest)
      saved.push({ file: fname, url: img.storagePath, bytes: fs.statSync(dest).size, imageType: img.imageType })
    }
    item.downloaded = saved
    delete item.images
  }

  claimed.sort((a, b) =>
    String(a.claim?.slot || a.claim?.handedOverAt || a.claim?.claimedAt || "").localeCompare(
      String(b.claim?.slot || b.claim?.handedOverAt || b.claim?.claimedAt || "")
    )
  )

  const out = {
    generatedAt: new Date().toISOString(),
    filter: "delivered_scheduled_till_2026-09-29_IST",
    count: claimed.length,
    items: claimed,
  }
  fs.writeFileSync(path.join(OUT, "claimed-items.json"), JSON.stringify(out, null, 2))
  console.log(
    JSON.stringify(
      {
        count: claimed.length,
        items: claimed.map((c) => ({
          title: c.title,
          slotDay: c.claim.slotDay,
          slotLabel: c.claim.slotLabel,
          stage: c.claim.handoverStage,
          delivery: c.claim.deliveryStatus,
          imgs: c.downloaded.length,
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
