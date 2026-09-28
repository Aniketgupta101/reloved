/**
 * One-shot: rider-coming email (+ SMS if phone known) → Waseem.
 *   node scripts/_tmp-rider-coming-waseem.js
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
const API = "https://api-wsyflslyaq-el.a.run.app"

const EMAIL = "waseemjaved@gmail.com"
const FIRST_NAME = "Waseem"
const ITEM_TITLE = "White Giordano Polo"
const PROFILE_URL = "https://reloved.digital/account"

async function resolvePhone() {
  try {
    const login = await httpJson("POST", API + "/api/auth/login", {
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    })
    if (!login.body?.token) return null
    const auth = { Authorization: "Bearer " + login.body.token }
    const [items, subs] = await Promise.all([
      httpJson("GET", API + "/api/admin/items", null, auth),
      httpJson("GET", API + "/api/admin/submissions", null, auth),
    ])
    for (const it of items.body?.items || []) {
      const target = String(it.donorTarget || it.donorEmail || "").toLowerCase()
      if (target === EMAIL && it.donorPhone) return String(it.donorPhone).replace(/\D/g, "").slice(-10)
    }
    for (const sub of subs.body?.submissions || []) {
      if (String(sub.email || "").toLowerCase() === EMAIL && sub.phone) {
        return String(sub.phone).replace(/\D/g, "").slice(-10)
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  if (!TPL) throw new Error("BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID missing")

  console.log("EMAIL →", EMAIL, "name", FIRST_NAME, "tpl", TPL, "item", ITEM_TITLE)
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

  const phone = await resolvePhone()
  if (phone && MSG91) {
    console.log("SMS →", phone, "tpl", SMS_TPL)
    const smsRes = await postJson(
      "control.msg91.com",
      "/api/v5/flow",
      { authkey: MSG91 },
      {
        template_id: SMS_TPL,
        short_url: "0",
        recipients: [
          {
            mobiles: `91${phone}`,
            name: FIRST_NAME,
            item: ITEM_TITLE,
          },
        ],
      }
    )
    console.log("SMS", smsRes.status, smsRes.body)
  } else {
    console.log("SMS skipped", { phone, hasMsg91: Boolean(MSG91) })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
