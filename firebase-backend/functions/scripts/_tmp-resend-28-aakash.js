/**
 * Resend Brevo #28 handover / share-a-pic → Aakash (+ feedback SMS).
 *   node scripts/_tmp-resend-28-aakash.js
 */
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
const KEY = env.BREVO_API_KEY
const SENDER = env.BREVO_SENDER_EMAIL || "mail@reloved.digital"
const SENDER_NAME = env.BREVO_SENDER_NAME || "reloved"
const TPL = env.BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID // 28
const MSG91 = String(env.MSG91_AUTH_KEY || "").trim()
const SMS_TPL =
  String(env.MSG91_TPL_FEEDBACK_THANKS || "").trim() || "6ab92b19c18ed5f2080e4d02"

const EMAIL = "totemistaken@gmail.com"
const PHONE = "9619370223"
const REQUESTER_NAME = "Aakash"
const ITEM_TITLE = "White Giordano Polo"
const CLAIM_ID = "S8FoLOa20ug5L44GWJ72"
const CLAIM_URL = `https://reloved.digital/account/claims/${CLAIM_ID}`

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  if (!TPL) throw new Error("BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID missing")

  console.log("EMAIL #28 →", EMAIL, "tpl", TPL)
  const emailRes = await postJson(
    "api.brevo.com",
    "/v3/smtp/email",
    { "api-key": KEY },
    {
      sender: { email: SENDER, name: SENDER_NAME },
      to: [{ email: EMAIL, name: REQUESTER_NAME }],
      templateId: Number(TPL),
      params: {
        REQUESTER_NAME,
        ITEM_TITLE,
        CLAIM_URL,
      },
    }
  )
  console.log("EMAIL", emailRes.status, emailRes.body)

  if (MSG91) {
    console.log("SMS feedback →", PHONE)
    const smsRes = await postJson(
      "control.msg91.com",
      "/api/v5/flow",
      { authkey: MSG91 },
      {
        template_id: SMS_TPL,
        short_url: "0",
        recipients: [{ mobiles: `91${PHONE}`, name: REQUESTER_NAME, item: ITEM_TITLE }],
      }
    )
    console.log("SMS", smsRes.status, smsRes.body)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
