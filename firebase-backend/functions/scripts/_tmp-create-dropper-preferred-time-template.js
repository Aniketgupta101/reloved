/**
 * Create Brevo template: dropper preferred handover time → claimer,
 * then send a test to aniketgupta83003@gmail.com (Adidas Track Pants / Sexman → Deep).
 *
 *   node scripts/_tmp-create-dropper-preferred-time-template.js
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
const SENDER = process.env.BREVO_SENDER_EMAIL || "mail@reloved.digital"
const SENDER_NAME = process.env.BREVO_SENDER_NAME || "reloved"
const TEST_TO = process.argv[2] || "aniketgupta83003@gmail.com"
const HTML_PATH = path.join(__dirname, "../../email-templates/dropper-preferred-time-claimer.html")

if (!KEY) {
  console.error("BREVO_API_KEY missing")
  process.exit(1)
}

const htmlContent = fs.readFileSync(HTML_PATH, "utf8")

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
  const created = await brevo("POST", "/smtp/templates", {
    templateName: "Reloved - Dropper preferred time (claimer)",
    subject: "Giver preferred {{ params.SLOT_LABEL }} - please confirm for {{ params.ITEM_TITLE }}",
    sender: { name: SENDER_NAME, email: SENDER },
    replyTo: "hello@reloved.digital",
    htmlContent,
    isActive: true,
  })
  const templateId = created.id
  console.log("Created Brevo template id:", templateId)

  const params = {
    CLAIMER_NAME: "Deep",
    DROPPER_NAME: "Aakash Puri",
    ITEM_TITLE: "Adidas Track Pants",
    SLOT_LABEL: "4:00 pm to 6:00 pm",
    PROFILE_URL: "https://reloved.digital/account",
  }

  const sent = await brevo("POST", "/smtp/email", {
    templateId: Number(templateId),
    to: [{ email: TEST_TO, name: "Aniket Gupta" }],
    params,
  })
  console.log(`Test sent to ${TEST_TO}`, sent)

  // Persist id into env if missing
  let envText = fs.readFileSync(ENV_PATH, "utf8")
  if (!/^BREVO_DROPPER_PREFERRED_TIME_CLAIMER_TEMPLATE_ID=/m.test(envText)) {
    envText = envText.trimEnd() + `\nBREVO_DROPPER_PREFERRED_TIME_CLAIMER_TEMPLATE_ID=${templateId}\n`
    fs.writeFileSync(ENV_PATH, envText)
    console.log("Wrote BREVO_DROPPER_PREFERRED_TIME_CLAIMER_TEMPLATE_ID to .env.reloved-digital")
  } else {
    envText = envText.replace(
      /^BREVO_DROPPER_PREFERRED_TIME_CLAIMER_TEMPLATE_ID=.*$/m,
      `BREVO_DROPPER_PREFERRED_TIME_CLAIMER_TEMPLATE_ID=${templateId}`
    )
    fs.writeFileSync(ENV_PATH, envText)
    console.log("Updated BREVO_DROPPER_PREFERRED_TIME_CLAIMER_TEMPLATE_ID in .env.reloved-digital")
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
