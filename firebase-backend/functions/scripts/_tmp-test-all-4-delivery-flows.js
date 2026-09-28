/**
 * TEST: all 4 delivery notification flows → Aniket only.
 *   node scripts/_tmp-test-all-4-delivery-flows.js
 *
 * 1) Rider coming (giver)
 * 2) Order dispatched (claimer)
 * 3) Delivered (claimer SMS + giver email)
 * 4) Share-a-pic / handover (claimer + giver)
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

const EMAIL = "aniketg266@gmail.com"
const PHONE = "7304382922"
const FIRST_NAME = "Aniket"
const CLAIMER_NAME = "Aniket"
const ITEM_TITLE = "Red Strapless Ruched Dress"
const PROFILE_URL = "https://reloved.digital/account"
const CLAIM_URL = "https://reloved.digital/account/claims/IRhMH3W22f2TVqObqDwI"
const GIFT_URL = "https://reloved.digital/account?tab=giving"

const TPL = {
  riderComing: env.BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID, // 26
  orderDispatched: env.BREVO_ORDER_DISPATCHED_CLAIMER_TEMPLATE_ID, // may be empty → HTML fallback
  deliveredClaimer: env.BREVO_DELIVERY_DELIVERED_CLAIMER_TEMPLATE_ID, // 17
  deliveredGiver: env.BREVO_DELIVERY_DELIVERED_GIVER_TEMPLATE_ID, // 18
  handoverClaimer: env.BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID, // 28
  handoverGiver: env.BREVO_HANDOVER_SUCCESS_GIVER_TEMPLATE_ID, // 29
}

const SMS = {
  riderComing: String(env.MSG91_TPL_DELIVERY_RIDER_COMING || "").trim() || "6ab39e4ae2f8b9b6da0921f3",
  orderDispatched:
    String(env.MSG91_TPL_ORDER_DISPATCHED_CLAIMER || "").trim() || "6ab39e646121ca1dd50947b3",
  delivered: String(env.MSG91_TPL_DELIVERY_DELIVERED_CLAIMER || "").trim() || "6ab39ea41235cf02ba092fd5",
  feedback: String(env.MSG91_TPL_FEEDBACK_THANKS || "").trim() || "6ab92b19c18ed5f2080e4d02",
}

async function sendBrevoTemplate(label, templateId, params) {
  if (!templateId) {
    console.log(`EMAIL SKIP ${label} (no template id)`)
    return null
  }
  const res = await postJson(
    "api.brevo.com",
    "/v3/smtp/email",
    { "api-key": KEY },
    {
      sender: { email: SENDER, name: SENDER_NAME },
      to: [{ email: EMAIL, name: FIRST_NAME }],
      templateId: Number(templateId),
      params,
    }
  )
  console.log(`EMAIL ${label} tpl=${templateId}`, res.status, res.body.slice(0, 180))
  return res
}

async function sendBrevoHtml(label, subject, htmlContent, textContent) {
  const res = await postJson(
    "api.brevo.com",
    "/v3/smtp/email",
    { "api-key": KEY },
    {
      sender: { email: SENDER, name: SENDER_NAME },
      to: [{ email: EMAIL, name: FIRST_NAME }],
      subject: `[TEST] ${subject}`,
      htmlContent,
      textContent,
    }
  )
  console.log(`EMAIL ${label} (html)`, res.status, res.body.slice(0, 180))
  return res
}

async function sendSms(label, templateId, vars) {
  const res = await postJson(
    "control.msg91.com",
    "/api/v5/flow",
    { authkey: MSG91 },
    {
      template_id: templateId,
      short_url: "0",
      recipients: [{ mobiles: `91${PHONE}`, ...vars }],
    }
  )
  console.log(`SMS ${label} tpl=${templateId}`, res.status, res.body.slice(0, 220))
  return res
}

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  if (!MSG91) throw new Error("MSG91_AUTH_KEY missing")

  console.log(`TEST all 4 flows → ${EMAIL} / ${PHONE}\n`)

  console.log("--- 1) Rider coming (giver) ---")
  await sendBrevoTemplate("rider-coming", TPL.riderComing, {
    FIRST_NAME,
    ITEM_TITLE,
    PROFILE_URL,
  })
  await sendSms("rider-coming", SMS.riderComing, { name: FIRST_NAME, item: ITEM_TITLE })

  console.log("\n--- 2) Order dispatched (claimer) ---")
  if (TPL.orderDispatched) {
    await sendBrevoTemplate("order-dispatched", TPL.orderDispatched, {
      REQUESTER_NAME: CLAIMER_NAME,
      ITEM_TITLE,
      PROFILE_URL,
    })
  } else {
    await sendBrevoHtml(
      "order-dispatched",
      `Your order has been dispatched — ${ITEM_TITLE}`,
      `<p>Hi ${CLAIMER_NAME}, your Reloved order <strong>${ITEM_TITLE}</strong> has been dispatched. Be available at your building gate.</p><p><a href="${PROFILE_URL}">Track in your account</a></p>`,
      `Hi ${CLAIMER_NAME}, your Reloved order ${ITEM_TITLE} has been dispatched. Be available at your building gate. ${PROFILE_URL}`
    )
  }
  await sendSms("order-dispatched", SMS.orderDispatched, { name: CLAIMER_NAME, item: ITEM_TITLE })

  console.log("\n--- 3) Delivered ---")
  await sendBrevoTemplate("delivered-claimer", TPL.deliveredClaimer, {
    REQUESTER_NAME: CLAIMER_NAME,
    ITEM_TITLE,
  })
  await sendBrevoTemplate("delivered-giver", TPL.deliveredGiver, {
    FIRST_NAME,
    ITEM_TITLE,
  })
  await sendSms("delivered-claimer", SMS.delivered, { name: CLAIMER_NAME, item: ITEM_TITLE })

  console.log("\n--- 4) Share-a-pic / handover ---")
  await sendBrevoTemplate("handover-claimer", TPL.handoverClaimer, {
    REQUESTER_NAME: CLAIMER_NAME,
    ITEM_TITLE,
    CLAIM_URL,
  })
  await sendBrevoTemplate("handover-giver", TPL.handoverGiver, {
    FIRST_NAME,
    CLAIMER_NAME,
    ITEM_TITLE,
    GIFT_URL,
  })
  await sendSms("feedback-thanks", SMS.feedback, { name: CLAIMER_NAME, item: ITEM_TITLE })

  console.log("\nDone.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
