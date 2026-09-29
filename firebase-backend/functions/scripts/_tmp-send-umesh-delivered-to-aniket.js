/**
 * Resend delivered + handover emails/SMS for Animal Print Bodycon Dress (Umesh)
 * → Aniket test inbox/phone.
 *   node scripts/_tmp-send-umesh-delivered-to-aniket.js
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

const EMAIL = "aniketgupta83003@gmail.com" // user typed gail.com
const PHONE = "7304382922"
const CLAIM_ID = "LRSc7ooP9pg9YnAd6cah"
const ITEM_TITLE = "Animal Print Bodycon Dress"
const CLAIMER_NAME = "Umesh"
const GIVER_NAME = "Sheetal"
const CLAIM_URL = `https://reloved.digital/account/claims/${CLAIM_ID}`
const GIFT_URL = "https://reloved.digital/account?tab=giving"

const TPL = {
  deliveredClaimer: env.BREVO_DELIVERY_DELIVERED_CLAIMER_TEMPLATE_ID,
  deliveredGiver: env.BREVO_DELIVERY_DELIVERED_GIVER_TEMPLATE_ID,
  handoverClaimer: env.BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID,
  handoverGiver: env.BREVO_HANDOVER_SUCCESS_GIVER_TEMPLATE_ID,
  reloveDelivered: env.BREVO_RELOVE_DELIVERED_CLAIMER_TEMPLATE_ID,
}

const SMS = {
  delivered:
    String(env.MSG91_TPL_DELIVERY_DELIVERED_CLAIMER || "").trim() || "6ab39ea41235cf02ba092fd5",
  feedback: String(env.MSG91_TPL_FEEDBACK_THANKS || "").trim() || "6ab92b19c18ed5f2080e4d02",
}

async function sendBrevo(label, templateId, name, params) {
  if (!templateId) {
    console.log("EMAIL SKIP", label, "(no template)")
    return
  }
  const res = await postJson(
    "api.brevo.com",
    "/v3/smtp/email",
    { "api-key": KEY },
    {
      sender: { email: SENDER, name: SENDER_NAME },
      to: [{ email: EMAIL, name }],
      templateId: Number(templateId),
      params,
    }
  )
  console.log("EMAIL", label, "→", EMAIL, "tpl", templateId, res.status, res.body.slice(0, 140))
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
  console.log("SMS", label, "→", PHONE, res.status, res.body.slice(0, 180))
}

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  if (!MSG91) throw new Error("MSG91_AUTH_KEY missing")

  console.log("Target email:", EMAIL, "phone:", PHONE)
  console.log("Item:", ITEM_TITLE, "claim:", CLAIM_ID)

  console.log("\n--- 1) Delivered (claimer) ---")
  await sendBrevo("delivered-claimer", TPL.deliveredClaimer, CLAIMER_NAME, {
    REQUESTER_NAME: CLAIMER_NAME,
    ITEM_TITLE,
  })
  await sendSms("delivered-claimer", SMS.delivered, {
    name: CLAIMER_NAME,
    item: ITEM_TITLE,
  })

  console.log("\n--- 2) Delivered (giver) ---")
  await sendBrevo("delivered-giver", TPL.deliveredGiver, GIVER_NAME, {
    FIRST_NAME: GIVER_NAME,
    ITEM_TITLE,
  })

  console.log("\n--- 3) Relove delivered (claimer) ---")
  await sendBrevo("relove-delivered-claimer", TPL.reloveDelivered, CLAIMER_NAME, {
    REQUESTER_NAME: CLAIMER_NAME,
    ITEM_TITLE,
    PROFILE_URL: "https://reloved.digital/account",
  })

  console.log("\n--- 4) Handover / thank you (claimer) ---")
  await sendBrevo("handover-claimer", TPL.handoverClaimer, CLAIMER_NAME, {
    REQUESTER_NAME: CLAIMER_NAME,
    ITEM_TITLE,
    CLAIM_URL,
  })
  await sendSms("feedback-thanks", SMS.feedback, {
    name: CLAIMER_NAME,
    item: ITEM_TITLE,
  })

  console.log("\n--- 5) Handover / thank you (giver) ---")
  await sendBrevo("handover-giver", TPL.handoverGiver, GIVER_NAME, {
    FIRST_NAME: GIVER_NAME,
    CLAIMER_NAME,
    ITEM_TITLE,
    GIFT_URL,
  })

  console.log("\nDone.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
