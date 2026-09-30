/**
 * Update Brevo template 34 (no em dashes) and resend claimer preferred-time test.
 *   node scripts/_tmp-resend-dropper-preferred-time.js
 */
const fs = require("fs")
const path = require("path")

const ENV_PATH = path.join(__dirname, "../.env.reloved-digital")
for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue
  const i = line.indexOf("=")
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  let v = line.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  process.env[k] = v
}

const KEY = process.env.BREVO_API_KEY
const TPL = Number(process.env.BREVO_DROPPER_PREFERRED_TIME_CLAIMER_TEMPLATE_ID || 34)
const SENDER = process.env.BREVO_SENDER_EMAIL || "mail@reloved.digital"
const SENDER_NAME = process.env.BREVO_SENDER_NAME || "reloved"
const TEST_TO = process.argv[2] || "aniketgupta83003@gmail.com"
const HTML = fs.readFileSync(
  path.join(__dirname, "../../email-templates/dropper-preferred-time-claimer.html"),
  "utf8"
)

if (!KEY) {
  console.error("BREVO_API_KEY missing")
  process.exit(1)
}

async function brevo(method, urlPath, body) {
  const res = await fetch(`https://api.brevo.com/v3${urlPath}`, {
    method,
    headers: {
      "api-key": KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${text}`)
  return json
}

async function main() {
  await brevo("PUT", `/smtp/templates/${TPL}`, {
    templateName: "Reloved - Dropper preferred time (claimer)",
    subject: "Giver preferred {{ params.SLOT_LABEL }} - please confirm for {{ params.ITEM_TITLE }}",
    sender: { name: SENDER_NAME, email: SENDER },
    replyTo: "hello@reloved.digital",
    htmlContent: HTML,
    isActive: true,
  })
  console.log("Updated Brevo template", TPL)

  const sent = await brevo("POST", "/smtp/email", {
    templateId: TPL,
    to: [{ email: TEST_TO, name: "Aniket Gupta" }],
    params: {
      CLAIMER_NAME: "Deep",
      DROPPER_NAME: "Aakash Puri",
      ITEM_TITLE: "Adidas Track Pants",
      SLOT_LABEL: "4:00 pm to 6:00 pm",
      PROFILE_URL: "https://reloved.digital/account",
    },
  })
  console.log(`Test sent to ${TEST_TO}`, sent)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
