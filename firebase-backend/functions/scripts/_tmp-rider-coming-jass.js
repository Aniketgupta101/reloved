/**
 * One-shot: rider-coming email (+ SMS) → Jass for White Giordano Polo.
 *   node scripts/_tmp-rider-coming-jass.js
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
const TPL = env.BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID
const MSG91 = String(env.MSG91_AUTH_KEY || "").trim()
const SMS_TPL =
  String(env.MSG91_TPL_DELIVERY_RIDER_COMING || "").trim() || "6ab39e4ae2f8b9b6da0921f3"

const EMAIL = "jasmeetraj@gmail.com"
const PHONE = "7889308654"
const FIRST_NAME = "Jass"
const ITEM_TITLE = "White Giordano Polo"
const PROFILE_URL = "https://reloved.digital/account"
const CLAIM_ID = "S8FoLOa20ug5L44GWJ72"
const API = "https://api-wsyflslyaq-el.a.run.app"

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  if (!TPL) throw new Error("BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID missing")

  console.log("EMAIL →", EMAIL, "tpl", TPL, "item", ITEM_TITLE)
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

  if (MSG91) {
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

  // Mark ops booked (status only — claimer not emailed by this one-shot).
  const login = await httpJson("POST", API + "/api/auth/login", {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  })
  if (login.body?.token) {
    const patch = await httpJson(
      "PATCH",
      API + "/api/admin/orders/" + CLAIM_ID,
      { opsStatus: "booked" },
      { Authorization: "Bearer " + login.body.token }
    )
    console.log("MARK BOOKED", patch.status, JSON.stringify(patch.body).slice(0, 400))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
