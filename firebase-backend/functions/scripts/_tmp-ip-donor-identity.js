/**
 * Identify donor behind IP 203.192.207.65 via nearby successful donation creates
 * and any app logs that include target/email/username.
 */
const fs = require("fs")
const path = require("path")
const https = require("https")

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8"),
)
const access = cfg.tokens.access_token
const PROJECT = "reloved-digital"

function post(hostname, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request(
      {
        hostname,
        path: urlPath,
        method: "POST",
        headers: {
          Authorization: "Bearer " + access,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(b || "{}") })
          } catch {
            resolve({ status: res.statusCode, body: b })
          }
        })
      },
    )
    req.on("error", reject)
    req.write(data)
    req.end()
  })
}

function request(method, fullPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = https.request(
      {
        hostname: "firestore.googleapis.com",
        path: fullPath,
        method,
        headers: {
          Authorization: "Bearer " + access,
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(b || "{}") })
          } catch {
            resolve({ status: res.statusCode, body: b })
          }
        })
      },
    )
    req.on("error", reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function field(v) {
  if (!v) return null
  if (v.stringValue != null) return v.stringValue
  if (v.integerValue != null) return Number(v.integerValue)
  if (v.timestampValue != null) return v.timestampValue
  if (v.arrayValue) return (v.arrayValue.values || []).map(field)
  if (v.nullValue !== undefined) return null
  return v
}

async function listLogs(filter) {
  for (;;) {
    const r = await post("logging.googleapis.com", "/v2/entries:list", {
      resourceNames: ["projects/reloved-digital"],
      filter,
      orderBy: "timestamp desc",
      pageSize: 100,
    })
    if (r.status === 429) {
      console.log("rate limit...")
      await sleep(65000)
      continue
    }
    if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.body).slice(0, 400)}`)
    return r.body.entries || []
  }
}

async function main() {
  await sleep(3000)

  // 1) Same IP across broader window — any 201 donation success?
  const ipFilter = [
    'timestamp>="2026-09-26T00:00:00Z"',
    'timestamp<="2026-09-28T00:00:00Z"',
    'httpRequest.remoteIp="203.192.207.65"',
    '(httpRequest.requestUrl:"/api/donations" OR httpRequest.requestUrl:"/api/donor/")',
  ].join(" AND ")
  const ipEntries = await listLogs(ipFilter)
  console.log("ip_entries", ipEntries.length)
  const statusByPath = {}
  for (const e of ipEntries) {
    const url = (e.httpRequest?.requestUrl || "").replace(/\?.*$/, "").slice(-80)
    const status = e.httpRequest?.status
    const method = e.httpRequest?.requestMethod
    if (method === "OPTIONS") continue
    const key = `${method} ${status} ${url}`
    statusByPath[key] = (statusByPath[key] || 0) + 1
  }
  console.log("statusByPath", JSON.stringify(statusByPath, null, 2))

  // Print donation-related chronologically
  for (const e of ipEntries.slice().reverse()) {
    const url = e.httpRequest?.requestUrl || ""
    if (!/donations/i.test(url)) continue
    if (e.httpRequest?.requestMethod === "OPTIONS") continue
    console.log(
      e.timestamp,
      e.httpRequest.status,
      e.httpRequest.requestMethod,
      url.replace(/\?.*$/, "").slice(-90),
      "ua=" + (e.httpRequest.userAgent || "").slice(0, 50),
    )
  }

  // 2) Recent donation submissions on Sep 26-27 — maybe this user eventually succeeded
  await sleep(2000)
  const q = {
    structuredQuery: {
      from: [{ collectionId: "donationSubmissions" }],
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      limit: 40,
    },
  }
  const r = await request("POST", `/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, q)
  const docs = Array.isArray(r.body) ? r.body.filter((x) => x.document) : []
  console.log("\nrecent submissions:")
  for (const row of docs) {
    const f = row.document.fields || {}
    const created = field(f.createdAt)
    if (!created || created < "2026-09-26" || created > "2026-09-28") continue
    console.log(
      JSON.stringify({
        id: row.document.name.split("/").pop(),
        created,
        reference: field(f.reference),
        donorTarget: field(f.donorTarget) || field(f.target) || field(f.email),
        email: field(f.email),
        phone: field(f.phone),
        firstName: field(f.firstName) || field(f.name),
        itemTitle: field(f.itemTitle),
      }),
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
