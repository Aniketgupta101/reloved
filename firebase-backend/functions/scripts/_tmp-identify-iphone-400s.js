/**
 * Pull app log lines near unmatched iPhone donation 400 timestamps.
 * Look for any identity (email/username/target) in nearby logs.
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

async function list(filter) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await post("logging.googleapis.com", "/v2/entries:list", {
      resourceNames: ["projects/reloved-digital"],
      filter,
      orderBy: "timestamp desc",
      pageSize: 50,
    })
    if (r.status === 429) {
      console.log("rate limit, wait...")
      await sleep(65000)
      continue
    }
    if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.body).slice(0, 400)}`)
    return r.body.entries || []
  }
  return []
}

const windows = [
  // first unmatched cluster
  ["2026-09-26T19:38:00Z", "2026-09-26T19:47:00Z"],
  // morning cluster
  ["2026-09-27T07:44:00Z", "2026-09-27T08:01:00Z"],
]

async function main() {
  await sleep(5000)
  for (const [start, end] of windows) {
    console.log("\n====", start, "->", end, "====")
    const filter = [
      `timestamp>="${start}"`,
      `timestamp<="${end}"`,
      `resource.type="cloud_run_revision"`,
      `resource.labels.service_name="api"`,
      `(textPayload:"donation" OR textPayload:"analyze" OR textPayload:"donor" OR textPayload:"session" OR httpRequest.requestUrl:"donations")`,
    ].join(" AND ")
    const entries = await list(filter)
    console.log("count", entries.length)
    for (const e of entries) {
      const msg =
        e.textPayload ||
        (e.httpRequest && `${e.httpRequest.status} ${e.httpRequest.requestMethod} ${e.httpRequest.requestUrl} ua=${(e.httpRequest.userAgent || "").slice(0, 60)}`) ||
        (e.jsonPayload && JSON.stringify(e.jsonPayload)) ||
        ""
      // skip analyze spam a bit
      if (/Lightsail relay|Vertex studio|gemini-/i.test(msg) && !/donation|400|bucket/i.test(msg)) continue
      console.log(e.timestamp, String(msg).replace(/\s+/g, " ").slice(0, 280))
    }
    await sleep(2000)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
