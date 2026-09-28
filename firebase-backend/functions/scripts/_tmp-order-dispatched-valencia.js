/**
 * Live: order-dispatched SMS → Valencia (Red Strapless Ruched Dress claimer).
 * No email on profile — SMS only.
 *   node scripts/_tmp-order-dispatched-valencia.js
 */
const fs = require("fs")
const path = require("path")
const https = require("https")

function loadEnv(filePath) {
  const out = {}
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue
    const i = line.indexOf("=")
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
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
  String(env.MSG91_TPL_ORDER_DISPATCHED_CLAIMER || "").trim() || "6ab39e646121ca1dd50947b3"

const PHONE = "8689997686"
const FIRST_NAME = "Valencia"
const ITEM_TITLE = "Red Strapless Ruched Dress"

async function main() {
  if (!MSG91) throw new Error("MSG91_AUTH_KEY missing")

  console.log("SMS →", PHONE, "tpl", SMS_TPL)
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
          name: FIRST_NAME,
          item: ITEM_TITLE,
        },
      ],
    }
  )
  console.log("SMS", smsRes.status, smsRes.body)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
