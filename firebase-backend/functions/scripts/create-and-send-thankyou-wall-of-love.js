/**
 * Create Wall-of-Love thank-you SMS template in MSG91, wire FEEDBACK_THANKS,
 * then send SMS + Brevo thank-you email to Aniket test inbox/phone.
 *
 *   node scripts/create-and-send-thankyou-wall-of-love.js
 */
const fs = require("fs")
const path = require("path")

const envPath = path.join(__dirname, "../.env.reloved-digital")
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue
  const i = line.indexOf("=")
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  let v = line.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(k in process.env)) process.env[k] = v
}

const key = process.env.MSG91_AUTH_KEY
const ADD = "https://control.msg91.com/api/v5/sms/addTemplate"
const VERSIONS = "https://control.msg91.com/api/v5/sms/getTemplateVersions"
const FLOW = "https://control.msg91.com/api/v5/flow/"

const TEST_PHONE = "917304382922"
const TEST_EMAIL = "aniketg266@gmail.com"
const CLAIM_URL = "https://reloved.digital/account/claims/7FkvvtAlJ2YmvFjltjyT"

// DLT-safe SMS (no emoji). Mirrors claimer thank-you / Wall of Love email.
const SMS_BODY =
  "Hi ##name##, got your Reloved? Send us a pic with your new find and we'll share it on our Wall of Love.\n- Reloved Digital"

const SMS_TEMPLATE_NAME = "RELOVED_THANKYOU_WALL_OF_LOVE"

function patchEnv(filePath, updates) {
  if (!fs.existsSync(filePath)) return
  let raw = fs.readFileSync(filePath, "utf8")
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}=.*$`, "m")
    if (re.test(raw)) raw = raw.replace(re, `${k}=${v}`)
    else raw = raw.trimEnd() + `\n${k}=${v}\n`
  }
  fs.writeFileSync(filePath, raw)
}

async function createSmsTemplate() {
  const res = await fetch(ADD, {
    method: "POST",
    headers: { authkey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      template_name: SMS_TEMPLATE_NAME,
      sender_id: "RELOVD",
      template: SMS_BODY,
    }),
  })
  const j = await res.json()
  return j
}

async function checkVersion(tid) {
  const res = await fetch(VERSIONS, {
    method: "POST",
    headers: { authkey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: tid }),
  })
  return res.json()
}

async function sendSms(tid) {
  const res = await fetch(FLOW, {
    method: "POST",
    headers: { authkey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      template_id: tid,
      short_url: "0",
      recipients: [{ mobiles: TEST_PHONE, name: "Aniket", item: "Spider man suit" }],
    }),
  })
  return { status: res.status, body: await res.text() }
}

async function sendEmail() {
  const tplId = Number(process.env.BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID || 28)
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL || "mail@reloved.digital",
        name: process.env.BREVO_SENDER_NAME || "reloved",
      },
      to: [{ email: TEST_EMAIL }],
      templateId: tplId,
      params: {
        REQUESTER_NAME: "Aniket",
        ITEM_TITLE: "Spider man suit",
        CLAIM_URL: CLAIM_URL,
      },
    }),
  })
  return { status: res.status, body: (await res.text()).slice(0, 300) }
}

;(async () => {
  if (!key) throw new Error("MSG91_AUTH_KEY missing")
  if (!process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY missing")

  console.log("=== 1. Create MSG91 thank-you SMS template ===")
  console.log("BODY:\n" + SMS_BODY)
  const created = await createSmsTemplate()
  console.log("CREATE", JSON.stringify(created).slice(0, 500))
  const tid = created?.data?.template_id
  if (!tid) throw new Error("MSG91 template create failed — no template_id")

  patchEnv(envPath, { MSG91_TPL_FEEDBACK_THANKS: tid })
  const envDot = path.join(__dirname, "../.env")
  patchEnv(envDot, { MSG91_TPL_FEEDBACK_THANKS: tid })
  process.env.MSG91_TPL_FEEDBACK_THANKS = tid
  console.log("WIRED MSG91_TPL_FEEDBACK_THANKS=", tid)

  const ver = await checkVersion(tid)
  const d = ver?.data?.[0]
  console.log(
    "VERSION",
    d
      ? { status: d.status, active: d.active_status, body: String(d.template_data || "").slice(0, 120) }
      : ver
  )

  console.log("\n=== 2. Send thank-you SMS to", TEST_PHONE, "===")
  const sms = await sendSms(tid)
  console.log("SMS", sms)

  console.log("\n=== 3. Send thank-you email to", TEST_EMAIL, "===")
  const email = await sendEmail()
  console.log("EMAIL", email)

  fs.writeFileSync(
    path.join(__dirname, "_msg91-thankyou-wall-of-love.json"),
    JSON.stringify(
      {
        env: "MSG91_TPL_FEEDBACK_THANKS",
        name: SMS_TEMPLATE_NAME,
        template_id: tid,
        template: SMS_BODY,
        stpl_sample: "Hi Aniket, got your Reloved? Send us a pic with your new find and we'll share it on our Wall of Love.\n- Reloved Digital",
        email_subject: "💗 Got your Reloved?",
        email_line: "Send us a pic with your new find and we'll share it on our Wall of Love. ✨",
        sms_result: sms,
        email_result: email,
        version: d || null,
      },
      null,
      2
    )
  )
  console.log("\nWrote scripts/_msg91-thankyou-wall-of-love.json")
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
