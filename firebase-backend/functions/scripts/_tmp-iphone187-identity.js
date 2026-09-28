/**
 * Find identity clues (login/me/otp) for iPhone OS 18_7 donation failures.
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
  for (;;) {
    const r = await post("logging.googleapis.com", "/v2/entries:list", {
      resourceNames: ["projects/reloved-digital"],
      filter,
      orderBy: "timestamp desc",
      pageSize,
    })
    if (r.status === 429) {
      console.log("rate limit...")
      await sleep(65000)
      continue
    }
    if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.body).slice(0, 500)}`)
    return r.body.entries || []
  }
}

async function main() {
  await sleep(3000)
  // All requests from this UA in the failure windows
  const filter = [
    'timestamp>="2026-09-26T19:30:00Z"',
    'timestamp<="2026-09-27T08:10:00Z"',
    'resource.type="cloud_run_revision"',
    'resource.labels.service_name="api"',
    'httpRequest.userAgent:"iPhone OS 18_7"',
  ].join(" AND ")

  const entries = await list(filter, 100)
  console.log("ua_requests", entries.length)

  const byUrl = {}
  const ips = new Set()
  for (const e of entries) {
    const url = (e.httpRequest?.requestUrl || "").replace(/\?.*$/, "")
    const status = e.httpRequest?.status
    const ip = e.httpRequest?.remoteIp || e.httpRequest?.remote_ip
    if (ip) ips.add(ip)
    const key = `${status} ${url.slice(-90)}`
    byUrl[key] = (byUrl[key] || 0) + 1
  }
  console.log("ips", [...ips])
  console.log("byUrl", JSON.stringify(byUrl, null, 2))

  // Print unique endpoints chronologically (dedupe noise)
  const seen = new Set()
  for (const e of entries.slice().reverse()) {
    const url = e.httpRequest?.requestUrl || ""
    const status = e.httpRequest?.status
    const ip = e.httpRequest?.remoteIp
    const short = `${e.timestamp} ${status} ${url.replace(/\?.*$/, "").slice(-100)} ip=${ip}`
    if (seen.has(short)) continue
    seen.add(short)
    // skip OPTIONS
    if (e.httpRequest?.requestMethod === "OPTIONS") continue
    console.log(short)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
