/**
 * Create Brevo "Ops — porter instead of pickup" claimer template,
 * persist template ID to .env.reloved-digital, then send a test to Aniket.
 *
 *   node scripts/create-ops-porter-instead-of-pickup-template.js
 *   node scripts/create-ops-porter-instead-of-pickup-template.js --send-only
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
const TEMPLATE_NAME = "Ops_claimer_porter_instead_of_pickup"
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
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:#C6F136;border-radius:20px;padding:6px 16px;"><span style="font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#111111;">Delivery update</span></td></tr></table>
<p style="margin:20px 0 8px;font-size:26px;line-height:1.15;font-weight:900;text-transform:uppercase;color:#111111;">We'll bring it to you</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#111111;">Hi {{ params.CLAIMER_NAME }},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">Regarding your claim for <strong style="color:#111;">{{ params.ITEM_TITLE }}</strong> — your handover was marked as collecting from the building gate. That may have been set by mistake.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#333333;">We've arranged a <strong style="color:#111;">porter delivery</strong> instead. Please stay available at your drop location around the time below.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #E5E1D8;border-radius:8px;"><tr><td style="padding:16px 18px;">
<p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#888;">Delivery details</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#595959;">Item<br/><strong style="color:#111;font-size:15px;">{{ params.ITEM_TITLE }}</strong></p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#595959;">When<br/><strong style="color:#111;font-size:15px;">{{ params.SLOT_LABEL }}</strong></p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#595959;">Drop location<br/><strong style="color:#111;font-size:15px;">{{ params.DROP_ADDRESS }}</strong></p>
</td></tr></table>
<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#333333;">No action needed on your side — just be available so we can hand the item over smoothly. If anything changes, reply to this email or message us on WhatsApp.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<a href="{{ params.PROFILE_URL }}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#111111;border-radius:6px;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#C6F136;text-decoration:none;">View in your account</a>
</td></tr></table>
</td></tr></table></td></tr></table></td></tr>
<tr><td align="center" style="padding-top:22px;"><p style="margin:0;font-size:11px;color:#888;">RE-LOVED · Preloved for Free · Mumbai</p></td></tr>
</table></td></tr></table></body></html>`
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
  const payload = {
    sender: { name: SENDER_NAME, email: SENDER },
    replyTo: "hello@reloved.digital",
    subject: "We'll deliver your item at {{ params.SLOT_LABEL }} — {{ params.ITEM_TITLE }}",
    htmlContent: templateHtml(),
    isActive: true,
  }
  if (hit) {
    console.log(`Reusing template #${hit.id} (${hit.name})`)
    await brevo("PUT", `/smtp/templates/${hit.id}`, payload)
    console.log(`Updated template #${hit.id}`)
    return hit.id
  }
  const created = await brevo("POST", "/smtp/templates", {
    templateName: TEMPLATE_NAME,
    ...payload,
  })
  console.log(`Created template #${created.id}`)
  return created.id
}

async function sendTest(templateId) {
  const res = await brevo("POST", "/smtp/email", {
    templateId: Number(templateId),
    to: [{ email: TEST_TO, name: "Aniket Gupta" }],
    params: {
      CLAIMER_NAME: "Khushi",
      ITEM_TITLE: "Green Clutch Bag with Shoulder Strap",
      SLOT_LABEL: "29 Sept 2026, 8:00 pm",
      DROP_ADDRESS:
        "Andheri West railway station, Nacado shopping Centre, Andheri West tattoo tanix, Mumbai 400058",
      PROFILE_URL: "https://reloved.digital/account",
    },
  })
  console.log(`Test email → ${TEST_TO} OK (${res.messageId || "queued"})`)
}

async function main() {
  let templateId = process.env.BREVO_OPS_PORTER_INSTEAD_OF_PICKUP_TEMPLATE_ID
  if (!SEND_ONLY || !templateId) {
    templateId = await ensureTemplate()
    upsertEnv("BREVO_OPS_PORTER_INSTEAD_OF_PICKUP_TEMPLATE_ID", templateId)
  }
  console.log(`Template ID: ${templateId}`)
  await sendTest(templateId)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
