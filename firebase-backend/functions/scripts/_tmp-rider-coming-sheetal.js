/**
 * Live: rider-coming email + SMS → Sheetal (Red Strapless Ruched Dress giver).
 *   node scripts/_tmp-rider-coming-sheetal.js
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
const KEY = env.BREVO_API_KEY
const SENDER = env.BREVO_SENDER_EMAIL || "mail@reloved.digital"
const SENDER_NAME = env.BREVO_SENDER_NAME || "reloved"
const TPL = env.BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID
const MSG91 = String(env.MSG91_AUTH_KEY || "").trim()
const SMS_TPL =
  String(env.MSG91_TPL_DELIVERY_RIDER_COMING || "").trim() || "6ab39e4ae2f8b9b6da0921f3"

const EMAIL = "sheetalahuja99@gmail.com"
const PHONE = "9820562606"
const FIRST_NAME = "Sheetal"
const ITEM_TITLE = "Red Strapless Ruched Dress"
const PROFILE_URL = "https://reloved.digital/account"

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  if (!TPL) throw new Error("BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID missing")
  if (!MSG91) throw new Error("MSG91_AUTH_KEY missing")

  console.log("EMAIL →", EMAIL, "tpl", TPL)
  const emailRes = await postJson(
    "api.brevo.com",
    "/v3/smtp/email",
    { "api-key": KEY },
    {
      sender: { email: SENDER, name: SENDER_NAME },
      to: [{ email: EMAIL, name: FIRST_NAME }],
      templateId: Number(TPL),
      params: { FIRST_NAME, ITEM_TITLE, PROFILE_URL },
    }
  )
  console.log("EMAIL", emailRes.status, emailRes.body)

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
