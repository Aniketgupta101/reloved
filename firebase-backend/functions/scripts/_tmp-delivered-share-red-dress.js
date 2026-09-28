/**
 * Live: (3) delivered + (4) share-a-pic / handover for Red Strapless Ruched Dress.
 *   node scripts/_tmp-delivered-share-red-dress.js
 *
 * Claimer Valencia = SMS only (no email).
 * Giver Sheetal = email.
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
const MSG91 = String(env.MSG91_AUTH_KEY || "").trim()

const TPL_DELIVERED_GIVER = env.BREVO_DELIVERY_DELIVERED_GIVER_TEMPLATE_ID // 18
const TPL_HANDOVER_GIVER = env.BREVO_HANDOVER_SUCCESS_GIVER_TEMPLATE_ID // 29
const TPL_HANDOVER_CLAIMER = env.BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID // 28
const SMS_DELIVERED =
  String(env.MSG91_TPL_DELIVERY_DELIVERED_CLAIMER || "").trim() || "6ab39ea41235cf02ba092fd5"
const SMS_FEEDBACK =
  String(env.MSG91_TPL_FEEDBACK_THANKS || "").trim() || "6ab92b19c18ed5f2080e4d02"

const GIVER_EMAIL = "sheetalahuja99@gmail.com"
const GIVER_NAME = "Sheetal"
const CLAIMER_PHONE = "8689997686"
const CLAIMER_NAME = "Valencia"
const ITEM_TITLE = "Red Strapless Ruched Dress"
const CLAIM_ID = "IRhMH3W22f2TVqObqDwI"
const CLAIM_URL = `https://reloved.digital/account/claims/${CLAIM_ID}`
const GIFT_URL = "https://reloved.digital/account?tab=giving"

async function sendBrevo(toEmail, toName, templateId, params) {
  const res = await postJson(
    "api.brevo.com",
    "/v3/smtp/email",
    { "api-key": KEY },
    {
      sender: { email: SENDER, name: SENDER_NAME },
      to: [{ email: toEmail, name: toName }],
      templateId: Number(templateId),
      params,
    }
  )
  console.log(`EMAIL tpl=${templateId} → ${toEmail}`, res.status, res.body.slice(0, 200))
  return res
}

async function sendSms(phone, templateId, vars) {
  const res = await postJson(
    "control.msg91.com",
    "/api/v5/flow",
    { authkey: MSG91 },
    {
      template_id: templateId,
      short_url: "0",
      recipients: [{ mobiles: `91${phone}`, ...vars }],
    }
  )
  console.log(`SMS tpl=${templateId} → ${phone}`, res.status, res.body.slice(0, 300))
  return res
}

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  if (!MSG91) throw new Error("MSG91_AUTH_KEY missing")

  console.log("--- 3) Delivered ---")
  await sendSms(CLAIMER_PHONE, SMS_DELIVERED, {
    name: CLAIMER_NAME,
    item: ITEM_TITLE,
  })
  await sendBrevo(GIVER_EMAIL, GIVER_NAME, TPL_DELIVERED_GIVER, {
    FIRST_NAME: GIVER_NAME,
    ITEM_TITLE,
  })

  console.log("--- 4) Share-a-pic / handover success ---")
  // Valencia has no email — try feedback/thanks SMS (share-a-pic nudge)
  await sendSms(CLAIMER_PHONE, SMS_FEEDBACK, {
    name: CLAIMER_NAME,
    item: ITEM_TITLE,
  })
  // Giver thank-you (handover success)
  await sendBrevo(GIVER_EMAIL, GIVER_NAME, TPL_HANDOVER_GIVER, {
    FIRST_NAME: GIVER_NAME,
    CLAIMER_NAME,
    ITEM_TITLE,
    GIFT_URL,
  })

  // Also fire claimer handover Brevo if we ever get an email — skipped.
  console.log("NOTE: claimer share-a-pic Brevo tpl", TPL_HANDOVER_CLAIMER, "skipped (no Valencia email). Claim URL:", CLAIM_URL)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
