/**
 * Set inventory for F&F Wall:
 *   Batch 0 (closet) → claimed + visible  (social-proof seed; never claimable)
 *   Batch 1 (shirts) + Batch 2 (pants) → available + visible  (unless already in a live transaction)
 *   In-flight items (being_matched / claimed / reloved) → left alone (do not clobber)
 *   Everything else → available + visible (so they can appear)
 *
 *   node scripts/set-batch-wall-statuses.js
 */
const fs = require("fs")
const path = require("path")
const https = require("https")

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8")
)
const access = cfg.tokens.access_token

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

function request(method, fullPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request(
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
          let parsed = null
          try {
            parsed = b ? JSON.parse(b) : null
          } catch {
            parsed = b
          }
          resolve({ status: res.statusCode, body: parsed })
        })
      }
    )
    req.on("error", reject)
    if (data) req.write(data)
    req.end()
  })
}

function fieldVal(f) {
  if (!f) return null
  if (f.stringValue != null) return f.stringValue
  if (f.booleanValue != null) return f.booleanValue
  return null
}

function classify(title, imagesJson) {
  if (matchesAny(title, BATCH1)) return "batch1"
  if (matchesAny(title, BATCH2)) return "batch2"
  if (String(imagesJson).includes("/curated/")) {
    // curated pants vs shirts by title fallback
    if (/pant|chino|jean|corduroy/i.test(title)) return "batch2"
    return "batch1"
  }
  if (
    String(imagesJson).includes("/images/wall-items/") ||
    /kids|batman|marvel|hulk|thor|robin|spider|orca|shark|skeleton|converse|abercrombie|ralph lauren|true religion|hunter|surf|grunge|pajama|costume|dont tell|zanella|henley|chino shorts|cargo|moose|hisoka|lego|zara lemon|distressed|long-sleeve crewneck|soft cotton|everyday crew|classic crew|navy crew/i.test(
      title
    )
  ) {
    return "batch0"
  }
  return "other"
}

;(async () => {
  const docs = []
  let pageToken = ""
  do {
    const url =
      "/v1/projects/reloved-digital/databases/(default)/documents/items?pageSize=300" +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "")
    const list = await request("GET", url)
    if (list.status !== 200) throw new Error(JSON.stringify(list.body).slice(0, 400))
    docs.push(...(list.body.documents || []))
    pageToken = list.body.nextPageToken || ""
  } while (pageToken)

  const summary = { batch0: 0, batch1: 0, batch2: 0, other: 0, skippedInFlight: 0, patched: [], errors: [] }

  for (const doc of docs) {
    const f = doc.fields || {}
    const title = fieldVal(f.title) || ""
    const imagesJson = JSON.stringify(f.images || {})
    const batch = classify(title, imagesJson)
    const currentStatus = fieldVal(f.publicStatus) || ""

    // Never overwrite a live transaction / completed Relove (except Batch 0 seed → always Claimed).
    if (
      batch !== "batch0" &&
      (currentStatus === "being_matched" || currentStatus === "claimed" || currentStatus === "reloved")
    ) {
      summary.skippedInFlight++
      continue
    }

    const publicStatus = batch === "batch0" ? "claimed" : "available"

    summary[batch]++

    const patchPath =
      "/v1/" +
      doc.name +
      "?updateMask.fieldPaths=publicStatus&updateMask.fieldPaths=publicVisibility&updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt"
    const res = await request("PATCH", patchPath, {
      fields: {
        publicStatus: { stringValue: publicStatus },
        publicVisibility: { booleanValue: true },
        // Un-withdraw so they can appear on Wall
        status: { stringValue: "approved" },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    })

    if (res.status !== 200) {
      summary.errors.push({ title, http: res.status, err: res.body })
    } else {
      summary.patched.push({ title, batch, publicStatus })
    }
  }

  // Verify via public wall API
  await new Promise((r) => setTimeout(r, 800))
  const wall = await fetch(
    "https://asia-south1-reloved-digital.cloudfunctions.net/api/api/items?status=wall"
  ).then((r) => r.json())
  const love = await fetch(
    "https://asia-south1-reloved-digital.cloudfunctions.net/api/api/items?status=reloved"
  ).then((r) => r.json())

  const wallBy = {}
  for (const i of wall.items || []) {
    const s = i.publicStatus || "?"
    wallBy[s] = (wallBy[s] || 0) + 1
  }

  console.log(
    JSON.stringify(
      {
        dbProcessed: docs.length,
        counts: {
          batch0_claimed: summary.batch0,
          batch1_available: summary.batch1,
          batch2_available: summary.batch2,
          other_available: summary.other,
          skippedInFlight: summary.skippedInFlight,
        },
        patchedOk: summary.patched.length,
        errors: summary.errors,
        liveWallCount: (wall.items || []).length,
        liveWallByStatus: wallBy,
        liveLoveCount: (love.items || []).length,
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
