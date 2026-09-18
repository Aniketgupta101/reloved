const fs = require("fs")
const path = require("path")
const https = require("https")

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8"),
)
const access = cfg.tokens.access_token

function request(method, fullPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
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
          let body = null
          try {
            body = b ? JSON.parse(b) : null
          } catch {
            body = b
          }
          resolve({ status: res.statusCode, body })
        })
      },
    )
    req.on("error", reject)
    req.end()
  })
}

function sv(f) {
  return f && f.stringValue != null ? f.stringValue : null
}

function matches(title, slug) {
  const t = String(title || "").toLowerCase()
  const s = String(slug || "").toLowerCase()
  return (
    s.includes("blue-plaid-long-sleeve") ||
    s.includes("grid-pattern-short-sleeve") ||
    t === "blue plaid long sleeve shirt" ||
    t.includes("grid pattern short sleeve") ||
    t.includes("relaxed fit grid pattern")
  )
}

async function listAll(collection) {
  const docs = []
  let page = ""
  do {
    const url =
      `/v1/projects/reloved-digital/databases/(default)/documents/${collection}?pageSize=300` +
      (page ? `&pageToken=${encodeURIComponent(page)}` : "")
    const list = await request("GET", url)
    if (list.status !== 200) throw new Error(JSON.stringify(list.body).slice(0, 400))
    docs.push(...(list.body.documents || []))
    page = list.body.nextPageToken || ""
  } while (page)
  return docs
}

;(async () => {
  const items = await listAll("items")
  const hit = []
  for (const doc of items) {
    const f = doc.fields || {}
    const title = sv(f.title)
    const slug = sv(f.slug)
    if (!matches(title, slug)) continue
    hit.push({
      name: doc.name,
      id: doc.name.split("/").pop(),
      title,
      slug,
      submissionId: sv(f.submissionId),
    })
  }
  console.log("MATCH", JSON.stringify(hit, null, 2))

  const itemIds = new Set(hit.map((h) => h.id))
  for (const row of hit) {
    const d = await request("DELETE", "/v1/" + row.name)
    let sd = null
    if (row.submissionId) {
      const r = await request(
        "DELETE",
        "/v1/projects/reloved-digital/databases/(default)/documents/donationSubmissions/" +
          encodeURIComponent(row.submissionId),
      )
      sd = r.status
    }
    console.log("deleted item", row.slug, d.status, "submission", sd)
  }

  const reqs = await listAll("itemRequests")
  let claimsDeleted = 0
  for (const doc of reqs) {
    const id = sv((doc.fields || {}).itemId)
    if (id && itemIds.has(id)) {
      const d = await request("DELETE", "/v1/" + doc.name)
      if (d.status === 200) claimsDeleted++
    }
  }
  console.log("claimsDeleted", claimsDeleted)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
