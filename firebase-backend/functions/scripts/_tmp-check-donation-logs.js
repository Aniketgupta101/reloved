/**
 * Pull Cloud Logging entries for donation submit failures (last 7 days).
 *   node scripts/_tmp-check-donation-logs.js
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

function summarize(entry) {
  const msg =
    entry.textPayload ||
    (entry.jsonPayload &&
      (entry.jsonPayload.message ||
        entry.jsonPayload.msg ||
        JSON.stringify(entry.jsonPayload))) ||
    ""
  return {
    ts: entry.timestamp,
    severity: entry.severity,
    resource: entry.resource?.labels?.service_name || entry.resource?.labels?.function_name || entry.resource?.type,
    msg: String(msg).slice(0, 500),
  }
}

async function fetchAll(filter) {
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
    if (r.status !== 200) {
      return { error: r.status, body: r.body, entries: out }
    }
    out.push(...(r.body.entries || []))
    pageToken = r.body.nextPageToken
  } while (pageToken && out.length < 500)
  return { entries: out }
}

async function main() {
  const since = "2026-09-21T00:00:00Z"
  const filters = [
    {
      name: "donation_rejected_no_images",
      filter: `timestamp>="${since}" AND textPayload:"donation rejected: no images"`,
    },
    {
      name: "donation_photo_upload",
      filter: `timestamp>="${since}" AND (textPayload:"donation photo upload" OR textPayload:"donation photo empty")`,
    },
    {
      name: "donations_500",
      filter: `timestamp>="${since}" AND (textPayload:"Failed to submit donation" OR textPayload:"\\ndonations" OR textPayload:"donations" AND severity>=ERROR)`,
    },
    {
      name: "donations_error_broad",
      filter: `timestamp>="${since}" AND severity>=ERROR AND (textPayload:"donation" OR jsonPayload.message:"donation")`,
    },
    {
      name: "http_donations_4xx_5xx",
      filter: `timestamp>="${since}" AND (httpRequest.requestUrl:"/api/donations" OR textPayload:"/api/donations" OR textPayload:"POST /donations") AND (httpRequest.status>=400 OR severity>=WARNING)`,
    },
  ]

  for (const f of filters) {
    console.log("\n===", f.name, "===")
    const r = await fetchAll(f.filter)
    if (r.error) {
      console.log("ERROR", r.error, JSON.stringify(r.body).slice(0, 800))
      continue
    }
    console.log("count", r.entries.length)
    for (const e of r.entries.slice(0, 40)) {
      console.log(JSON.stringify(summarize(e)))
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
