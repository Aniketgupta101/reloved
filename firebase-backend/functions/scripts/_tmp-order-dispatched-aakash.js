/**
 * One-shot: order dispatched / on the way → Aakash (claimer) for White Giordano Polo.
 *   node scripts/_tmp-order-dispatched-aakash.js
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
const TPL = env.BREVO_ORDER_DISPATCHED_CLAIMER_TEMPLATE_ID
const MSG91 = String(env.MSG91_AUTH_KEY || "").trim()
const SMS_TPL =
  String(env.MSG91_TPL_ORDER_DISPATCHED_CLAIMER || "").trim() || "6ab39e646121ca1dd50947b3"

const EMAIL = "totemistaken@gmail.com"
const PHONE = "9619370223"
const REQUESTER_NAME = "Aakash"
const ITEM_TITLE = "White Giordano Polo"
const PROFILE_URL = "https://reloved.digital/account"

const htmlContent = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EBE7DF;padding:32px 16px;"><tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #111;max-width:540px;">
  <tr><td style="padding:32px 28px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;background:#2563eb;color:#fff;display:inline-block;padding:6px 12px;">Dispatched</p>
  <h1 style="margin:16px 0;font-size:26px;line-height:1.15;text-transform:uppercase;">Your order is on the way</h1>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Hi ${REQUESTER_NAME}, your Reloved order <strong>${ITEM_TITLE}</strong> has been dispatched. Please be available at your building gate for delivery.</p>
  <a href="${PROFILE_URL}" style="display:inline-block;background:#111;color:#C6F136;text-decoration:none;padding:14px 20px;font-size:12px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;">Track in your account</a>
  <p style="margin:24px 0 0;font-size:12px;color:#777;">RE-LOVED · Preloved for Free</p>
  </td></tr></table></td></tr></table></body></html>`

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  if (!MSG91) throw new Error("MSG91_AUTH_KEY missing")

  console.log("EMAIL →", EMAIL, "name", REQUESTER_NAME)
  let emailRes
  if (TPL) {
    emailRes = await postJson(
      "api.brevo.com",
      "/v3/smtp/email",
      { "api-key": KEY },
      {
        sender: { email: SENDER, name: SENDER_NAME },
        to: [{ email: EMAIL, name: REQUESTER_NAME }],
        templateId: Number(TPL),
        params: { REQUESTER_NAME, ITEM_TITLE, PROFILE_URL },
      }
    )
  } else {
    emailRes = await postJson(
      "api.brevo.com",
      "/v3/smtp/email",
      { "api-key": KEY },
      {
        sender: { email: SENDER, name: SENDER_NAME },
        to: [{ email: EMAIL, name: REQUESTER_NAME }],
        subject: `Your order has been dispatched — ${ITEM_TITLE}`,
        htmlContent,
        textContent: `Hi ${REQUESTER_NAME}, your Reloved order ${ITEM_TITLE} has been dispatched. Be available at your building gate. ${PROFILE_URL}`,
      }
    )
  }
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
          name: REQUESTER_NAME,
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
