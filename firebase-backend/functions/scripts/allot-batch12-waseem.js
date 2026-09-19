/**
 * Allot Batch 1 (shirts) + Batch 2 (pants) to waseemjaved@gmail.com
 * with personal_driver logistics (no Borzo/Porter fields).
 *
 *   node scripts/allot-batch12-waseem.js
 */
const fs = require("fs")
const path = require("path")
const https = require("https")

const OWNER_EMAIL = "waseemjaved@gmail.com"
const LOGISTICS = "personal_driver"

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

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8")
)
const access = cfg.tokens.access_token

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
  return null
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

  const patched = []
  const errors = []
  const submissionIds = new Set()

  for (const doc of docs) {
    const f = doc.fields || {}
    const title = fieldVal(f.title) || ""
    const imagesJson = JSON.stringify(f.images || {})
    const batch = classify(title, imagesJson)
    if (!batch) continue

    const submissionId = fieldVal(f.submissionId)
    if (submissionId) submissionIds.add(submissionId)

    // Clear courier fields via updateMask (omit porterPaidBy / set null where possible).
    const patchPath =
      "/v1/" +
      doc.name +
      "?updateMask.fieldPaths=donorTarget" +
      "&updateMask.fieldPaths=donorEmail" +
      "&updateMask.fieldPaths=donorRecognition" +
      "&updateMask.fieldPaths=giverLogistics" +
      "&updateMask.fieldPaths=handoverMethod" +
      "&updateMask.fieldPaths=porterPaidBy" +
      "&updateMask.fieldPaths=updatedAt"

    const res = await request("PATCH", patchPath, {
      fields: {
        donorTarget: { stringValue: OWNER_EMAIL },
        donorEmail: { stringValue: OWNER_EMAIL },
        donorRecognition: { stringValue: "Waseem" },
        giverLogistics: { stringValue: LOGISTICS },
        handoverMethod: { stringValue: LOGISTICS },
        porterPaidBy: { nullValue: null },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    })

    if (res.status !== 200) {
      errors.push({ title, http: res.status, err: res.body })
    } else {
      patched.push({ title, batch })
    }
  }

  // Mirror logistics/owner onto linked donation submissions.
  const subPatched = []
  for (const sid of submissionIds) {
    const subPath =
      "/v1/projects/reloved-digital/databases/(default)/documents/donationSubmissions/" +
      encodeURIComponent(sid) +
      "?updateMask.fieldPaths=donorTarget" +
      "&updateMask.fieldPaths=email" +
      "&updateMask.fieldPaths=giverLogistics" +
      "&updateMask.fieldPaths=handoverMethod" +
      "&updateMask.fieldPaths=porterPaidBy" +
      "&updateMask.fieldPaths=updatedAt"
    const res = await request("PATCH", subPath, {
      fields: {
        donorTarget: { stringValue: OWNER_EMAIL },
        email: { stringValue: OWNER_EMAIL },
        giverLogistics: { stringValue: LOGISTICS },
        handoverMethod: { stringValue: LOGISTICS },
        porterPaidBy: { nullValue: null },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    })
    subPatched.push({ sid, status: res.status })
  }

  // Update open itemRequests that reference these items so claim UI uses personal_driver.
  const itemIds = new Set(
    docs
      .filter((d) => {
        const f = d.fields || {}
        return Boolean(classify(fieldVal(f.title) || "", JSON.stringify(f.images || {})))
      })
      .map((d) => d.name.split("/").pop())
  )

  const reqDocs = []
  pageToken = ""
  do {
    const url =
      "/v1/projects/reloved-digital/databases/(default)/documents/itemRequests?pageSize=300" +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "")
    const list = await request("GET", url)
    reqDocs.push(...(list.body.documents || []))
    pageToken = list.body.nextPageToken || ""
  } while (pageToken)

  const claimPatched = []
  for (const doc of reqDocs) {
    const f = doc.fields || {}
    const itemId = fieldVal(f.itemId)
    if (!itemId || !itemIds.has(itemId)) continue
    const patchPath =
      "/v1/" +
      doc.name +
      "?updateMask.fieldPaths=giverLogistics" +
      "&updateMask.fieldPaths=handoverMethod" +
      "&updateMask.fieldPaths=updatedAt"
    const res = await request("PATCH", patchPath, {
      fields: {
        giverLogistics: { stringValue: LOGISTICS },
        handoverMethod: { stringValue: LOGISTICS },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    })
    claimPatched.push({ id: doc.name.split("/").pop(), status: res.status })
  }

  const byBatch = { batch1: 0, batch2: 0 }
  for (const p of patched) byBatch[p.batch]++

  console.log(
    JSON.stringify(
      {
        owner: OWNER_EMAIL,
        logistics: LOGISTICS,
        itemsPatched: patched.length,
        byBatch,
        errors,
        submissionsTouched: subPatched.length,
        claimsTouched: claimPatched.length,
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
