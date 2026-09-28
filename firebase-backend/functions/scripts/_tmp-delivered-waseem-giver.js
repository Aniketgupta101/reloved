/**
 * Same giver emails as Jass → Waseem (delivered + thank-you).
 *   node scripts/_tmp-delivered-waseem-giver.js
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
const MSG91 = String(env.MSG91_AUTH_KEY || "").trim()

const EMAIL = "waseemjaved@gmail.com"
const PHONE = "9820069286"
const FIRST_NAME = "Waseem"
const CLAIMER_NAME = "Aakash"
const ITEM_TITLE = "White Giordano Polo"
const GIFT_URL = "https://reloved.digital/account?tab=giving"

const TPL_DELIVERED = env.BREVO_DELIVERY_DELIVERED_GIVER_TEMPLATE_ID
const TPL_HANDOVER = env.BREVO_HANDOVER_SUCCESS_GIVER_TEMPLATE_ID

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")

  console.log("EMAIL delivered-giver →", EMAIL)
  const e1 = await postJson(
    "api.brevo.com",
    "/v3/smtp/email",
    { "api-key": KEY },
    {
      sender: { email: SENDER, name: SENDER_NAME },
      to: [{ email: EMAIL, name: FIRST_NAME }],
      templateId: Number(TPL_DELIVERED),
      params: { FIRST_NAME, ITEM_TITLE },
    }
  )
  console.log("EMAIL delivered", e1.status, e1.body)

  console.log("EMAIL handover-giver →", EMAIL)
  const e2 = await postJson(
    "api.brevo.com",
    "/v3/smtp/email",
    { "api-key": KEY },
    {
      sender: { email: SENDER, name: SENDER_NAME },
      to: [{ email: EMAIL, name: FIRST_NAME }],
      templateId: Number(TPL_HANDOVER),
      params: {
        FIRST_NAME,
        CLAIMER_NAME,
        ITEM_TITLE,
        GIFT_URL,
      },
    }
  )
  console.log("EMAIL handover", e2.status, e2.body)

  // Jass had no delivered-giver SMS; skip unless MSG91 present for a courtesy ping.
  // User asked for what Jass got — emails only for giver side.
  console.log("SMS skipped (giver delivered has no SMS template; same as Jass)")
  void MSG91
  void PHONE
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
