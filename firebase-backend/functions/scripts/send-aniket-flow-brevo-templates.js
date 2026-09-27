/**
 * Create any missing Brevo flow templates, then send the product email sequence
 * to Aniket using live Brevo template IDs only (no raw-HTML fallback).
 *
 * Flow:
 *   1 OTP
 *   2 Item claimed
 *   3 Claim matched
 *   4 Date & time set
 *   5 Delivery ready
 *   6a Rider coming
 *   6b On the way
 *   7 Delivered
 *   8 Feedback
 *   9 Thank you
 *
 *   node scripts/send-aniket-flow-brevo-templates.js
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
const SENDER = "mail@reloved.digital"
const SENDER_NAME = process.env.BREVO_SENDER_NAME || "reloved"
const TO = "aniketg266@gmail.com"
const FIRST = "Aniket"
const FULL = "Aniket Gupta"
const ITEM = "Navy BOSS Polo"
const SLOT = "Sunday 27 Sep, 6:00 PM"
const OTP = "619284"
const ACCOUNT = "https://reloved.digital/account"
const CLAIM_URL = "https://reloved.digital/account/claims/demo-claim-aniket"
const GIFT_URL = "https://reloved.digital/account?tab=giving"

if (!KEY) throw new Error("BREVO_API_KEY missing")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

function brandedHtml({ badge, badgeBg, badgeColor, title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EBE7DF;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" style="width:100%;max-width:540px;" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding-bottom:26px;"><img src="https://reloved.digital/images/reloved-email-lockup.png" width="260" height="71" alt="RELOVED" style="display:block;border:0;width:260px;height:71px;max-width:100%;"></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111;border-radius:8px;"><tr><td style="padding:0 4px 4px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1.5px solid #111111;border-radius:8px;"><tr><td style="padding:40px 44px 36px 44px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:${badgeBg};border-radius:20px;padding:6px 16px;"><span style="font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:${badgeColor};">${badge}</span></td></tr></table>
<p style="margin:20px 0 8px;font-size:28px;line-height:1.15;font-weight:900;text-transform:uppercase;color:#111111;">${title}</p>
${bodyHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td align="center">
<a href="{{ params.ACCOUNT_URL }}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#111111;border-radius:6px;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#C6F136;text-decoration:none;">Open Reloved account</a>
</td></tr></table>
</td></tr></table></td></tr></table></td></tr>
<tr><td align="center" style="padding-top:22px;"><p style="margin:0;font-size:11px;color:#888;">RE-LOVED · Preloved for Free</p></td></tr>
</table></td></tr></table></body></html>`
}

async function ensureTemplate(existing, { name, subject, htmlContent }) {
  const hit = existing.find((t) => String(t.name || "").toLowerCase() === name.toLowerCase())
  if (hit) {
    console.log(`  reuse #${hit.id} ${hit.name}`)
    return hit.id
  }
  const created = await brevo("POST", "/smtp/templates", {
    templateName: name,
    subject,
    sender: { name: SENDER_NAME, email: SENDER },
    replyTo: "hello@reloved.digital",
    htmlContent,
    isActive: true,
  })
  console.log(`  created #${created.id} ${name}`)
  return created.id
}

async function sendTemplate(step, label, templateId, params) {
  const res = await brevo("POST", "/smtp/email", {
    templateId: Number(templateId),
    to: [{ email: TO, name: FULL }],
    params,
  })
  console.log(`  [${step}] ${label} → template #${templateId} OK (${res.messageId || "queued"})`)
}

async function main() {
  console.log("=== Brevo templates (live) ===")
  const templates = await listTemplates()
  for (const t of templates.sort((a, b) => a.id - b.id)) {
    console.log(`  #${t.id}  ${t.name}  |  ${t.subject}`)
  }

  console.log("\n=== Ensure missing flow templates ===")
  const scheduleId = await ensureTemplate(templates, {
    name: "Email_schedule_set",
    subject: "Date & time set — {{ params.ITEM_TITLE }}",
    htmlContent: brandedHtml({
      badge: "Schedule set",
      badgeBg: "#EC2F9B",
      badgeColor: "#FFFFFF",
      title: "Date &amp; time confirmed",
      bodyHtml: `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#595959;">Hi {{ params.FIRST_NAME }}, the date and time for <strong style="color:#111;">{{ params.ITEM_TITLE }}</strong> have been set (<strong style="color:#111;">{{ params.SLOT_LABEL }}</strong>).</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#595959;">Please check your Reloved account to make any modifications, or get in touch with us if you need help.</p>`,
    }),
  })
  const deliveryReadyId = await ensureTemplate(templates, {
    name: "Email_delivery_ready_giver",
    subject: "Delivery ready — please be ready with {{ params.ITEM_TITLE }}",
    htmlContent: brandedHtml({
      badge: "Delivery ready",
      badgeBg: "#C6F136",
      badgeColor: "#111111",
      title: "Please be ready with your item",
      bodyHtml: `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#595959;">Hi {{ params.FIRST_NAME }}, delivery for <strong style="color:#111;">{{ params.ITEM_TITLE }}</strong> is ready. Pickup window: <strong style="color:#111;">{{ params.SLOT_LABEL }}</strong>.</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#595959;">Bag the item and leave it with your building's main gate security when the rider is due.</p>`,
    }),
  })

  // Persist newly created IDs into process env for this run
  process.env.BREVO_SCHEDULE_SET_TEMPLATE_ID = String(scheduleId)
  process.env.BREVO_DELIVERY_READY_GIVER_TEMPLATE_ID = String(deliveryReadyId)

  // Append to .env if missing
  let envText = fs.readFileSync(ENV_PATH, "utf8")
  if (!/^BREVO_SCHEDULE_SET_TEMPLATE_ID=/m.test(envText)) {
    envText = envText.trimEnd() + `\nBREVO_SCHEDULE_SET_TEMPLATE_ID=${scheduleId}\n`
  } else {
    envText = envText.replace(/^BREVO_SCHEDULE_SET_TEMPLATE_ID=.*$/m, `BREVO_SCHEDULE_SET_TEMPLATE_ID=${scheduleId}`)
  }
  if (!/^BREVO_DELIVERY_READY_GIVER_TEMPLATE_ID=/m.test(envText)) {
    envText = envText.trimEnd() + `\nBREVO_DELIVERY_READY_GIVER_TEMPLATE_ID=${deliveryReadyId}\n`
  } else {
    envText = envText.replace(
      /^BREVO_DELIVERY_READY_GIVER_TEMPLATE_ID=.*$/m,
      `BREVO_DELIVERY_READY_GIVER_TEMPLATE_ID=${deliveryReadyId}`
    )
  }
  if (!envText.includes("BREVO_SENDER_EMAIL=mail@reloved.digital")) {
    envText = envText.replace(/^BREVO_SENDER_EMAIL=.*$/m, "BREVO_SENDER_EMAIL=mail@reloved.digital")
  }
  fs.writeFileSync(ENV_PATH, envText)

  const ids = {
    otp: Number(process.env.BREVO_OTP_TEMPLATE_ID || 1),
    itemClaimed: Number(process.env.BREVO_ITEM_CLAIM_GIVER_TEMPLATE_ID || 12),
    matched: Number(process.env.BREVO_CLAIM_DECISION_TEMPLATE_ID || 8),
    schedule: scheduleId,
    deliveryReady: deliveryReadyId,
    riderComing: Number(process.env.BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID || 26),
    onTheWay: Number(process.env.BREVO_ORDER_DISPATCHED_CLAIMER_TEMPLATE_ID || 16),
    delivered: Number(process.env.BREVO_DELIVERY_DELIVERED_CLAIMER_TEMPLATE_ID || 17),
    feedback: Number(process.env.BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID || 28),
    thankYou: Number(process.env.BREVO_HANDOVER_SUCCESS_GIVER_TEMPLATE_ID || 29),
  }

  console.log("\n=== Flow template map ===")
  console.log(JSON.stringify(ids, null, 2))

  console.log(`\n=== Sending 9-step flow to ${TO} ===`)
  const gap = 3500

  await sendTemplate(1, "OTP", ids.otp, { OTP })
  await sleep(gap)

  await sendTemplate(2, "Item claimed", ids.itemClaimed, {
    FIRST_NAME: FIRST,
    ITEM_TITLE: ITEM,
    PROFILE_URL: GIFT_URL,
  })
  await sleep(gap)

  await sendTemplate(3, "Claim matched", ids.matched, {
    REQUESTER_NAME: FIRST,
    ITEM_TITLE: ITEM,
    DECISION_LABEL: "Matched",
    DECISION_COLOR: "#5C8A22",
    DECISION_MESSAGE: "great news - you're matched.",
    HEADLINE: "You're matched",
    NEXT_STEPS: "Open your profile to share handover details with the giver.",
    PROFILE_URL: ACCOUNT,
    CTA_LABEL: "Open your profile",
    WALL_URL: "https://reloved.digital/wall",
  })
  await sleep(gap)

  await sendTemplate(4, "Date & time set", ids.schedule, {
    FIRST_NAME: FIRST,
    ITEM_TITLE: ITEM,
    SLOT_LABEL: SLOT,
    ACCOUNT_URL: ACCOUNT,
  })
  await sleep(gap)

  await sendTemplate(5, "Delivery ready", ids.deliveryReady, {
    FIRST_NAME: FIRST,
    ITEM_TITLE: ITEM,
    SLOT_LABEL: SLOT,
    ACCOUNT_URL: ACCOUNT,
  })
  await sleep(gap)

  await sendTemplate(6, "Rider coming", ids.riderComing, {
    FIRST_NAME: FIRST,
    ITEM_TITLE: ITEM,
    PROFILE_URL: ACCOUNT,
  })
  await sleep(gap)

  await sendTemplate(6, "On the way", ids.onTheWay, {
    REQUESTER_NAME: FIRST,
    ITEM_TITLE: ITEM,
    PROFILE_URL: ACCOUNT,
  })
  await sleep(gap)

  await sendTemplate(7, "Delivered", ids.delivered, {
    REQUESTER_NAME: FIRST,
    ITEM_TITLE: ITEM,
  })
  await sleep(gap)

  await sendTemplate(8, "Feedback", ids.feedback, {
    REQUESTER_NAME: FIRST,
    ITEM_TITLE: ITEM,
    CLAIM_URL,
  })
  await sleep(gap)

  await sendTemplate(9, "Thank you", ids.thankYou, {
    FIRST_NAME: FIRST,
    CLAIMER_NAME: "A claimer nearby",
    ITEM_TITLE: ITEM,
    GIFT_URL,
  })

  console.log("\nDone. Waiting 8s then checking Brevo delivery events…")
  await sleep(8000)

  const recent = await brevo("GET", `/smtp/emails?email=${encodeURIComponent(TO)}&limit=12&sort=desc`)
  for (const e of recent.transactionalEmails || []) {
    await sleep(600)
    try {
      const detail = await brevo("GET", `/smtp/emails/${e.uuid}`)
      const events = (detail.events || []).map((x) => x.name).join(", ")
      console.log(`  ${e.subject} → ${events}`)
    } catch (err) {
      console.log(`  ${e.subject} → (status check skipped: ${err.message})`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
