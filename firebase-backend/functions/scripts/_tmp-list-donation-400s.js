/**
 * List every POST /api/donations 4xx in last 7 days (timestamps only).
 *   node scripts/_tmp-list-donation-400s.js
 */
const fs = require("fs")
const path = require("path")
const https = require("https")

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8"),
)
const access = cfg.tokens.access_token

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function listAll(filter) {
  const out = []
  let pageToken
  do {
    const r = await post("logging.googleapis.com", "/v2/entries:list", {
      resourceNames: ["projects/reloved-digital"],
      filter,
      orderBy: "timestamp desc",
      pageSize: 100,
      pageToken,
    })
    if (r.status === 429) {
      console.log("rate limited, waiting 65s...")
      await sleep(65000)
      continue
    }
    if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.body).slice(0, 500)}`)
    out.push(...(r.body.entries || []))
    pageToken = r.body.nextPageToken
  } while (pageToken && out.length < 300)
  return out
}

async function main() {
  const since = "2026-09-21T00:00:00Z"
  // Narrow: only POST donations endpoint status>=400, not analyze-photos
  const filter = [
    `timestamp>="${since}"`,
    `resource.type="cloud_run_revision"`,
    `httpRequest.requestMethod="POST"`,
    `httpRequest.status>=400`,
    `(httpRequest.requestUrl=~"api/donations$" OR httpRequest.requestUrl=~"/api/donations$" OR httpRequest.requestUrl:"/api/donations" )`,
    `NOT httpRequest.requestUrl:"analyze-photos"`,
    `NOT httpRequest.requestUrl:"polish"`,
    `NOT httpRequest.requestUrl:"admin"`,
  ].join(" AND ")

  const entries = await listAll(filter)
  console.log("total", entries.length)
  const byDay = {}
  for (const e of entries) {
    const day = (e.timestamp || "").slice(0, 10)
    byDay[day] = (byDay[day] || 0) + 1
    const url = (e.httpRequest?.requestUrl || "").replace(/\?.*$/, "")
    const status = e.httpRequest?.status
    const ua = (e.httpRequest?.userAgent || "").slice(0, 80)
    console.log(JSON.stringify({ ts: e.timestamp, status, url: url.slice(-100), ua }))
  }
  console.log("byDay", byDay)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
