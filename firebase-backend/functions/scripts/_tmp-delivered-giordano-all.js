/**
 * Delivery done → emails + SMS to dropper (Jass) and claimer (Aakash).
 * White Giordano Polo — claim S8FoLOa20ug5L44GWJ72
 *   node scripts/_tmp-delivered-giordano-all.js
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

function httpJson(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = body ? JSON.stringify(body) : null
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => {
          let p
          try {
            p = JSON.parse(b)
          } catch {
            p = b
          }
          resolve({ status: res.statusCode, body: p })
        })
      }
    )
    req.on("error", reject)
    if (data) req.write(data)
    req.end()
  })
}

const env = loadEnv(path.join(__dirname, "../.env.reloved-digital"))
const KEY = env.BREVO_API_KEY
const SENDER = env.BREVO_SENDER_EMAIL || "mail@reloved.digital"
const SENDER_NAME = env.BREVO_SENDER_NAME || "reloved"
const MSG91 = String(env.MSG91_AUTH_KEY || "").trim()
const API = "https://api-wsyflslyaq-el.a.run.app"
const CLAIM_ID = "S8FoLOa20ug5L44GWJ72"
const ITEM_TITLE = "White Giordano Polo"
const CLAIM_URL = `https://reloved.digital/account/claims/${CLAIM_ID}`
const GIFT_URL = "https://reloved.digital/account?tab=giving"
const PROFILE_URL = "https://reloved.digital/account"

const TPL = {
  deliveredClaimer: env.BREVO_DELIVERY_DELIVERED_CLAIMER_TEMPLATE_ID,
  deliveredGiver: env.BREVO_DELIVERY_DELIVERED_GIVER_TEMPLATE_ID,
  handoverClaimer: env.BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID,
  handoverGiver: env.BREVO_HANDOVER_SUCCESS_GIVER_TEMPLATE_ID,
}

const SMS = {
  delivered:
    String(env.MSG91_TPL_DELIVERY_DELIVERED_CLAIMER || "").trim() || "6ab39ea41235cf02ba092fd5",
  feedback: String(env.MSG91_TPL_FEEDBACK_THANKS || "").trim() || "6ab92b19c18ed5f2080e4d02",
}

const GIVER = { email: "jasmeetraj@gmail.com", name: "Jass", phone: "7889308654" }
const CLAIMER = { email: "totemistaken@gmail.com", name: "Aakash", phone: "9619370223" }

async function sendBrevo(label, to, name, templateId, params, fallback) {
  let body
  if (templateId) {
    body = {
      sender: { email: SENDER, name: SENDER_NAME },
      to: [{ email: to, name }],
      templateId: Number(templateId),
      params,
    }
  } else if (fallback) {
    body = {
      sender: { email: SENDER, name: SENDER_NAME },
      to: [{ email: to, name }],
      subject: fallback.subject,
      htmlContent: fallback.html,
      textContent: fallback.text,
    }
  } else {
    console.log("EMAIL SKIP", label)
    return
  }
  const res = await postJson("api.brevo.com", "/v3/smtp/email", { "api-key": KEY }, body)
  console.log("EMAIL", label, "→", to, res.status, res.body.slice(0, 120))
}

async function sendSms(label, phone, templateId, vars) {
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
  console.log("SMS", label, "→", phone, res.status, res.body.slice(0, 160))
}

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  if (!MSG91) throw new Error("MSG91_AUTH_KEY missing")

  console.log("--- Delivered (claimer) ---")
  await sendBrevo("delivered-claimer", CLAIMER.email, CLAIMER.name, TPL.deliveredClaimer, {
    REQUESTER_NAME: CLAIMER.name,
    ITEM_TITLE,
  })
  await sendSms("delivered-claimer", CLAIMER.phone, SMS.delivered, {
    name: CLAIMER.name,
    item: ITEM_TITLE,
  })

  console.log("--- Delivered (giver) ---")
  await sendBrevo("delivered-giver", GIVER.email, GIVER.name, TPL.deliveredGiver, {
    FIRST_NAME: GIVER.name,
    ITEM_TITLE,
  })
  // No separate delivered-giver SMS template — skip

  console.log("--- Thank you / handover (claimer) ---")
  await sendBrevo("handover-claimer", CLAIMER.email, CLAIMER.name, TPL.handoverClaimer, {
    REQUESTER_NAME: CLAIMER.name,
    ITEM_TITLE,
    CLAIM_URL,
  })
  await sendSms("feedback-thanks", CLAIMER.phone, SMS.feedback, {
    name: CLAIMER.name,
    item: ITEM_TITLE,
  })

  console.log("--- Thank you / handover (giver) ---")
  await sendBrevo("handover-giver", GIVER.email, GIVER.name, TPL.handoverGiver, {
    FIRST_NAME: GIVER.name,
    CLAIMER_NAME: CLAIMER.name,
    ITEM_TITLE,
    GIFT_URL,
  })

  console.log("--- Mark order delivered ---")
  const login = await httpJson("POST", API + "/api/auth/login", {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  })
  if (login.body?.token) {
    const patch = await httpJson(
      "PATCH",
      API + "/api/admin/orders/" + CLAIM_ID,
      { opsStatus: "delivered" },
      { Authorization: "Bearer " + login.body.token }
    )
    console.log("MARK DELIVERED", patch.status, JSON.stringify(patch.body).slice(0, 300))

    // Also advance deliveryStatus if API supports it
    const del = await httpJson(
      "PATCH",
      API + "/api/admin/item-requests/" + CLAIM_ID + "/delivery",
      { deliveryStatus: "delivered" },
      { Authorization: "Bearer " + login.body.token }
    )
    console.log("DELIVERY STATUS", del.status, JSON.stringify(del.body).slice(0, 300))
  }

  console.log("Done.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
