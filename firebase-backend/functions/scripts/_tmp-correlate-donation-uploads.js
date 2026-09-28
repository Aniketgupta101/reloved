/**
 * Correlate donation photo upload failures with request traces / nearby logs.
 *   node scripts/_tmp-correlate-donation-uploads.js
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

async function list(filter, pageSize = 100) {
  const r = await post("logging.googleapis.com", "/v2/entries:list", {
    resourceNames: ["projects/reloved-digital"],
    filter,
    orderBy: "timestamp desc",
    pageSize,
  })
  if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.body).slice(0, 400)}`)
  return r.body.entries || []
}

async function main() {
  await sleep(65000) // wait out rate limit window
  const since = "2026-09-21T00:00:00Z"

  // Unique timestamps of donation photo upload errors
  const uploads = await list(
    `timestamp>="${since}" AND textPayload:"donation photo upload"`,
    100,
  )
  console.log("upload_error_count", uploads.length)

  // donation rejected
  const rejected = await list(
    `timestamp>="${since}" AND textPayload:"donation rejected"`,
    50,
  )
  console.log("rejected_count", rejected.length)
  for (const e of rejected) {
    console.log("REJECTED", e.timestamp, String(e.textPayload || "").slice(0, 300))
  }

  // Look for HTTP request logs around donation endpoints with 4xx
  // Cloud Run request logs often have httpRequest
  await sleep(2000)
  const http = await list(
    `timestamp>="${since}" AND resource.type="cloud_run_revision" AND resource.labels.service_name="api" AND httpRequest.requestUrl:"donations" AND httpRequest.status>=400`,
    100,
  )
  console.log("http_donations_4xx_plus", http.length)
  const buckets = {}
  for (const e of http) {
    const url = e.httpRequest?.requestUrl || ""
    const status = e.httpRequest?.status
    const key = `${status} ${url.replace(/\?.*$/, "").slice(-80)}`
    buckets[key] = (buckets[key] || 0) + 1
  }
  console.log("http_buckets", JSON.stringify(buckets, null, 2))

  // Sample a few upload errors with insertId / trace for correlation
  const samples = uploads.filter((_, i) => i % 5 === 0).slice(0, 8)
  for (const e of samples) {
    const trace = e.trace || e.labels?.["goog-managed-by"] || ""
    const t = e.timestamp
    console.log("\nSAMPLE_UPLOAD", t, "trace=", e.trace || null)
    // pull nearby logs in +/- 2s for same instance if possible
    const start = new Date(new Date(t).getTime() - 3000).toISOString()
    const end = new Date(new Date(t).getTime() + 3000).toISOString()
    await sleep(1500)
    try {
      const nearby = await list(
        `timestamp>="${start}" AND timestamp<="${end}" AND resource.type="cloud_run_revision" AND resource.labels.service_name="api" AND (textPayload:"donation" OR httpRequest.requestUrl:"donations" OR textPayload:"analyze")`,
        20,
      )
      for (const n of nearby) {
        const msg = n.textPayload || (n.httpRequest && `${n.httpRequest.status} ${n.httpRequest.requestUrl}`) || ""
        console.log("  ", n.timestamp, String(msg).slice(0, 220))
      }
    } catch (err) {
      console.log("  nearby failed", String(err.message || err).slice(0, 200))
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
