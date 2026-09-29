/**
 * Create Brevo "Ops — Today's deliveries" template (Reloved account),
 * persist template ID to .env.reloved-digital, then send a test to Aniket.
 *
 *   node scripts/create-ops-daily-deliveries-template.js
 *   node scripts/create-ops-daily-deliveries-template.js --send-only
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
  if (!(k in process.env)) process.env[k] = v
}

const KEY = process.env.BREVO_API_KEY
const SENDER = process.env.BREVO_SENDER_EMAIL || "mail@reloved.digital"
const SENDER_NAME = process.env.BREVO_SENDER_NAME || "reloved"
const TEMPLATE_NAME = "Ops_daily_deliveries_reminder"
const TEST_TO = "aniketgupta83003@gmail.com"
const SEND_ONLY = process.argv.includes("--send-only")

if (!KEY) throw new Error("BREVO_API_KEY missing in .env.reloved-digital")

async function brevo(method, urlPath, body) {
  const res = await fetch(`https://api.brevo.com/v3${urlPath}`, {
    method,
    headers: {
      "api-key": KEY,
      accept: "application/json",
      "content-type": "application/json",
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

async function listTemplates() {
  const out = []
  let offset = 0
  for (;;) {
    const page = await brevo("GET", `/smtp/templates?limit=50&offset=${offset}&sort=desc`)
    out.push(...(page.templates || []))
    if (out.length >= (page.count || 0) || !(page.templates || []).length) break
    offset += 50
  }
  return out
}

function templateHtml() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EBE7DF;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" style="width:100%;max-width:560px;" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding-bottom:26px;"><img src="https://reloved.digital/images/reloved-email-lockup.png" width="260" height="71" alt="RELOVED" style="display:block;border:0;width:260px;height:71px;max-width:100%;"></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111;border-radius:8px;"><tr><td style="padding:0 4px 4px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1.5px solid #111111;border-radius:8px;"><tr><td style="padding:40px 40px 36px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:#C6F136;border-radius:20px;padding:6px 16px;"><span style="font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#111111;">Ops reminder</span></td></tr></table>
<p style="margin:20px 0 8px;font-size:26px;line-height:1.15;font-weight:900;text-transform:uppercase;color:#111111;">Today's deliveries</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#595959;">{{ params.DATE_LABEL }}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#111111;"><strong>{{ params.COUNT }}</strong> {{ params.COUNT_LABEL }} scheduled for today.</p>
{{ params.DELIVERIES_HTML|safe }}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td align="center">
<a href="{{ params.ADMIN_URL }}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#111111;border-radius:6px;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#C6F136;text-decoration:none;">Open admin</a>
</td></tr></table>
</td></tr></table></td></tr></table></td></tr>
<tr><td align="center" style="padding-top:22px;"><p style="margin:0;font-size:11px;color:#888;">RE-LOVED · Morning ops digest · Asia/Kolkata</p></td></tr>
</table></td></tr></table></body></html>`
}

function sampleDeliveriesHtml() {
  const rows = [
    {
      item: "Navy BOSS Polo",
      slot: "11:00 AM",
      giver: "Priya S",
      claimer: "Rahul M",
      area: "Bandra West",
      status: "ready_to_book",
    },
    {
      item: "Kids denim jacket",
      slot: "1:30 PM",
      giver: "Aisha K",
      claimer: "Neha R",
      area: "Andheri East",
      status: "booked",
    },
    {
      item: "Cotton kurta set",
      slot: "4:00 PM",
      giver: "Meera D",
      claimer: "Arjun P",
      area: "Juhu",
      status: "out_for_delivery",
    },
    {
      item: "Winter coat (M)",
      slot: "6:00 PM",
      giver: "Kabir N",
      claimer: "Sana L",
      area: "Powai",
      status: "schedule_agreed",
    },
  ]
  return rows
    .map(
      (r, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid #E5E1D8;border-radius:8px;">
<tr><td style="padding:14px 16px;">
<p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#888;">#${i + 1} · ${r.slot}</p>
<p style="margin:0 0 6px;font-size:15px;font-weight:800;color:#111;">${r.item}</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#595959;">Giver: <strong style="color:#111;">${r.giver}</strong> → Claimer: <strong style="color:#111;">${r.claimer}</strong><br/>${r.area} · ${r.status.replace(/_/g, " ")}</p>
</td></tr></table>`
    )
    .join("")
}

function upsertEnv(key, value) {
  let text = fs.readFileSync(ENV_PATH, "utf8")
  const line = `${key}=${value}`
  if (new RegExp(`^${key}=`, "m").test(text)) {
    text = text.replace(new RegExp(`^${key}=.*$`, "m"), line)
  } else {
    text = text.trimEnd() + `\n${line}\n`
  }
  fs.writeFileSync(ENV_PATH, text)
  process.env[key] = String(value)
}

async function ensureTemplate() {
  const existing = await listTemplates()
  const hit = existing.find((t) => String(t.name || "").toLowerCase() === TEMPLATE_NAME.toLowerCase())
  if (hit) {
    console.log(`Reusing template #${hit.id} (${hit.name})`)
    // Keep HTML/subject in sync with this script
    await brevo("PUT", `/smtp/templates/${hit.id}`, {
      sender: { name: SENDER_NAME, email: SENDER },
      replyTo: "hello@reloved.digital",
      subject: "Today's deliveries ({{ params.COUNT }}) — {{ params.DATE_LABEL }}",
      htmlContent: templateHtml(),
      isActive: true,
    })
    console.log(`Updated template #${hit.id}`)
    return hit.id
  }
  const created = await brevo("POST", "/smtp/templates", {
    templateName: TEMPLATE_NAME,
    subject: "Today's deliveries ({{ params.COUNT }}) — {{ params.DATE_LABEL }}",
    sender: { name: SENDER_NAME, email: SENDER },
    replyTo: "hello@reloved.digital",
    htmlContent: templateHtml(),
    isActive: true,
  })
  console.log(`Created template #${created.id}`)
  return created.id
}

async function sendTest(templateId) {
  const today = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const res = await brevo("POST", "/smtp/email", {
    templateId: Number(templateId),
    to: [{ email: TEST_TO, name: "Aniket Gupta" }],
    params: {
      DATE_LABEL: today,
      COUNT: "4",
      COUNT_LABEL: "deliveries",
      DELIVERIES_HTML: sampleDeliveriesHtml(),
      ADMIN_URL: "https://reloved-digital.web.app/admin",
    },
  })
  console.log(`Test email → ${TEST_TO} OK (${res.messageId || "queued"})`)
}

async function main() {
  let templateId = process.env.BREVO_OPS_DAILY_DELIVERIES_TEMPLATE_ID
  if (!SEND_ONLY || !templateId) {
    templateId = await ensureTemplate()
    upsertEnv("BREVO_OPS_DAILY_DELIVERIES_TEMPLATE_ID", templateId)
    if (!process.env.OPS_DAILY_DELIVERIES_EMAILS) {
      upsertEnv(
        "OPS_DAILY_DELIVERIES_EMAILS",
        "aniketgupta83003@gmail.com,totemisnottaken@gmail.com"
      )
    }
  }
  console.log(`Template ID: ${templateId}`)
  await sendTest(templateId)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
