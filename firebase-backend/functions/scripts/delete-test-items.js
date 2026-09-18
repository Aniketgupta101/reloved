const fs = require("fs")
const path = require("path")
const https = require("https")

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8")
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
      }
    )
    req.on("error", reject)
    req.end()
  })
}

function fieldVal(f) {
  if (!f) return null
  if (f.stringValue != null) return f.stringValue
  if (f.booleanValue != null) return f.booleanValue
  return null
}

function isTestItem(row) {
  const t = String(row.title || "").toLowerCase()
  const s = String(row.slug || "").toLowerCase()
  const d = String(row.description || "").toLowerCase()
  const donor = String(row.donorRecognition || "").toLowerCase()

  if (t === "asasas" || s.startsWith("asasas")) return true
  if (t.includes("tempmail") || s.includes("tempmail")) return true
  if (t.startsWith("uat ") || s.startsWith("uat-") || donor.includes("uat")) return true
  if (d.includes("ops demo") || d.includes("give flow email template")) return true
  if (d.includes("seeded item for giver accept")) return true
  if (/^(asas+|asdf+|qwerty|foo|bar|baz|testing|test item)$/i.test(t.trim())) return true
  if (/^test\b/i.test(t) || /\btesting cloth\b/i.test(d)) return true
  return false
}

;(async () => {
  const docs = []
  let pageToken = ""
  do {
    const url =
      "/v1/projects/reloved-digital/databases/(default)/documents/items?pageSize=300" +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "")
    const list = await request("GET", url)
    if (list.status !== 200) throw new Error(JSON.stringify(list.body).slice(0, 500))
    docs.push(...(list.body.documents || []))
    pageToken = list.body.nextPageToken || ""
  } while (pageToken)

  const deleted = []
  for (const doc of docs) {
    const f = doc.fields || {}
    const row = {
      name: doc.name,
      title: fieldVal(f.title),
      slug: fieldVal(f.slug),
      description: fieldVal(f.description),
      donorRecognition: fieldVal(f.donorRecognition),
      submissionId: fieldVal(f.submissionId),
    }
    if (!isTestItem(row)) continue

    const del = await request("DELETE", "/v1/" + row.name)
    let subStatus = null
    if (row.submissionId) {
      const subDel = await request(
        "DELETE",
        "/v1/projects/reloved-digital/databases/(default)/documents/donationSubmissions/" +
          encodeURIComponent(row.submissionId)
      )
      subStatus = subDel.status
    }
    deleted.push({ title: row.title, slug: row.slug, itemStatus: del.status, submissionStatus: subStatus })
  }

  console.log(JSON.stringify({ deletedCount: deleted.length, deleted }, null, 2))
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
