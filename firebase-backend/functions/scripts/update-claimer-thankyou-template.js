/**
 * Update Brevo #28 share-a-pic template: transactional subject (less Promotions),
 * then send a test to Aniket.
 *   node scripts/update-claimer-thankyou-template.js [testEmail]
 */
const fs = require("fs")
const path = require("path")

const envPath = path.join(__dirname, "..", ".env.reloved-digital")
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue
  const i = line.indexOf("=")
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  let v = line.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(k in process.env)) process.env[k] = v
}

const key = process.env.BREVO_API_KEY
const tplId = Number(process.env.BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID || 28)
const senderEmail = process.env.BREVO_SENDER_EMAIL || "mail@reloved.digital"
const senderName = process.env.BREVO_SENDER_NAME || "reloved"
const testTo = process.argv[2] || "aniketgupta83003@gmail.com"

// Transactional tone: no emoji subject, plain delivery confirmation + optional photo upload.
const SUBJECT = "Your Reloved item was delivered — {{ params.ITEM_TITLE }}"

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EBE7DF;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" style="width:100%;max-width:540px;" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding-bottom:26px;"><img src="https://reloved.digital/images/reloved-email-lockup.png" width="260" height="71" alt="RELOVED" style="display:block;border:0;width:260px;height:71px;max-width:100%;"></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111;border-radius:8px;"><tr><td style="padding:0 4px 4px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1.5px solid #111111;border-radius:8px;"><tr><td style="padding:40px 44px 36px 44px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:#EBE7DF;border-radius:20px;padding:6px 16px;"><span style="font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#111111;">Delivery complete</span></td></tr></table>
<p style="margin:20px 0 8px;font-size:26px;line-height:1.15;font-weight:900;color:#111111;">Your item was delivered</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#333333;">Hi {{ params.REQUESTER_NAME }}, your Reloved delivery of <strong style="color:#111;">{{ params.ITEM_TITLE }}</strong> is complete.</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#333333;">If you would like, upload a photo from your claim page — we may feature it on the Wall of Love.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<a href="{{ params.CLAIM_URL }}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#111111;border-radius:6px;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#F4F1EA;text-decoration:none;">Open your claim</a>
</td></tr></table>
<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#888;">This email is about your Reloved delivery. Reply to hello@reloved.digital if you need help.</p>
</td></tr></table></td></tr></table></td></tr>
<tr><td align="center" style="padding-top:22px;"><p style="margin:0;font-size:11px;color:#888;">RE-LOVED · Mumbai</p></td></tr>
</table></td></tr></table></body></html>`

;(async () => {
  if (!key) throw new Error("BREVO_API_KEY missing")
  const res = await fetch(`https://api.brevo.com/v3/smtp/templates/${tplId}`, {
    method: "PUT",
    headers: {
      "api-key": key,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      replyTo: "hello@reloved.digital",
      templateName: "Reloved — Claimer delivery complete (share photo)",
      subject: SUBJECT,
      htmlContent: html,
      isActive: true,
    }),
  })
  const text = await res.text()
  console.log("UPDATE", res.status, text.slice(0, 200) || "ok")
  if (!res.ok) process.exit(1)

  const send = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": key,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      templateId: tplId,
      to: [{ email: testTo, name: "Aniket" }],
      tags: ["transactional", "reloved-delivery"],
      headers: {
        "X-Mailin-custom": "transactional=true;category=delivery",
        Precedence: "auto_reply",
      },
      params: {
        REQUESTER_NAME: "Umesh",
        ITEM_TITLE: "Animal Print Bodycon Dress",
        CLAIM_URL: "https://reloved.digital/account/claims/LRSc7ooP9pg9YnAd6cah",
      },
    }),
  })
  console.log("TEST_SEND →", testTo, send.status, (await send.text()).slice(0, 200))
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
