/**
 * Set Batch 0 (closet / .aistudio wall-items) to publicStatus=claimed
 * so Wall of Kindness shows the Claimed tag only (no Available stamp).
 *
 *   node scripts/set-batch0-claimed.js
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

function isBatch0(title, imagesJson) {
  if (matchesAny(title, BATCH1) || matchesAny(title, BATCH2)) return false
  if (String(imagesJson).includes("/curated/")) return false
  // Closet seed uses /images/wall-items/<file> without /curated/
  if (String(imagesJson).includes("/images/wall-items/")) return true
  // Title fallback for known closet catalogue
  return /kids|batman|marvel|hulk|thor|robin|spider|orca|shark|skeleton|converse|abercrombie|ralph lauren|true religion|hunter|surf|grunge|pajama|costume|dont tell|zanella|henley|chino shorts|cargo jogger|graphic|moose|hisoka|lego|zara lemon|distressed|long-sleeve crewneck/i.test(
    title
  )
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

  const updated = []
  const skipped = []

  for (const doc of docs) {
    const f = doc.fields || {}
    const title = fieldVal(f.title) || ""
    const status = fieldVal(f.publicStatus) || ""
    const imagesJson = JSON.stringify(f.images || {})
    if (!isBatch0(title, imagesJson)) {
      skipped.push({ title, reason: "not-batch0" })
      continue
    }
    if (status === "withdrawn") {
      skipped.push({ title, reason: "withdrawn" })
      continue
    }
    if (status === "claimed") {
      // Still assert visibility so Claimed seed stays on the Wall.
      const patchPath =
        "/v1/" +
        doc.name +
        "?updateMask.fieldPaths=publicVisibility&updateMask.fieldPaths=updatedAt"
      const res = await request("PATCH", patchPath, {
        fields: {
          publicVisibility: { booleanValue: true },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      })
      updated.push({ title, status: "already-claimed", visibilityOk: res.status === 200 })
      continue
    }

    // PATCH only publicStatus + keep visible on wall
    const patchPath =
      "/v1/" + doc.name + "?updateMask.fieldPaths=publicStatus&updateMask.fieldPaths=publicVisibility&updateMask.fieldPaths=updatedAt"
    const res = await request("PATCH", patchPath, {
      fields: {
        publicStatus: { stringValue: "claimed" },
        publicVisibility: { booleanValue: true },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    })
    updated.push({ title, from: status, to: "claimed", http: res.status })
  }

  console.log(
    JSON.stringify(
      {
        claimedNow: updated.filter((u) => u.to === "claimed" || u.status === "already-claimed").length,
        patched: updated.filter((u) => u.to === "claimed"),
        alreadyClaimed: updated.filter((u) => u.status === "already-claimed").map((u) => u.title),
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
