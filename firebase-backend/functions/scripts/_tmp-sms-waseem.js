const fs = require("fs")
const path = require("path")
const https = require("https")

function loadEnv(filePath) {
  const out = {}
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue
    const i = line.indexOf("=")
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[line.slice(0, i).trim()] = v
  }
  return out
}

function postJson(hostname, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const r = https.request(
      {
        hostname,
        path: urlPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => resolve({ status: res.statusCode, body: b }))
      }
    )
    r.on("error", reject)
    r.write(data)
    r.end()
  })
}

const env = loadEnv(path.join(__dirname, "../.env.reloved-digital"))
const MSG91 = String(env.MSG91_AUTH_KEY || "").trim()
const SMS_TPL =
  String(env.MSG91_TPL_DELIVERY_RIDER_COMING || "").trim() || "6ab39e4ae2f8b9b6da0921f3"
const PHONE = "9820069286"

;(async () => {
  if (!MSG91) throw new Error("MSG91_AUTH_KEY missing")
  console.log("SMS →", PHONE, "tpl", SMS_TPL, "name Waseem")
  const smsRes = await postJson(
    "control.msg91.com",
    "/api/v5/flow",
    { authkey: MSG91 },
    {
      template_id: SMS_TPL,
      short_url: "0",
      recipients: [
        {
          mobiles: `91${PHONE}`,
          name: "Waseem",
          item: "White Giordano Polo",
        },
      ],
    }
  )
  console.log("SMS", smsRes.status, smsRes.body)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
