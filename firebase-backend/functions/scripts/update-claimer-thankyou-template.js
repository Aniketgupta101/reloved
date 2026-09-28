/**
 * Update live Brevo claimer thank-you template (id 28) with Wall of Love copy.
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
const testTo = process.argv[2] || ""

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EBE7DF;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" style="width:100%;max-width:540px;" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding-bottom:26px;"><img src="https://reloved-digital.web.app/images/reloved-email-lockup.png?v=16" width="260" height="71" alt="RELOVED" style="display:block;border:0;width:260px;height:71px;max-width:100%;"></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111;border-radius:8px;"><tr><td style="padding:0 4px 4px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1.5px solid #111111;border-radius:8px;"><tr><td style="padding:40px 44px 36px 44px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:#F7A8C4;border-radius:20px;padding:6px 16px;"><span style="font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#111111;">Reloved</span></td></tr></table>
<p style="margin:20px 0 8px;font-size:28px;line-height:1.15;font-weight:900;color:#111111;">&#128151; Got your Reloved?</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#595959;">Hi {{params.REQUESTER_NAME}}, hope <strong style="color:#111;">{{params.ITEM_TITLE}}</strong> found its new home with you.</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#111111;font-weight:600;">Send us a pic with your new find and we&#8217;ll share it on our Wall of Love. &#10024;</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<a href="{{params.CLAIM_URL}}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#111111;border-radius:6px;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#F4F1EA;text-decoration:none;">Send a pic</a>
</td></tr></table>
<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#888;">Opens your claim so you can upload a photo for the Wall of Love.</p>
</td></tr></table></td></tr></table></td></tr>
<tr><td align="center" style="padding-top:22px;"><p style="margin:0;font-size:11px;color:#888;">RE-LOVED · The digital Wall of Kindness</p></td></tr>
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
      templateName: "Reloved — Claimer success (photo & feedback)",
      subject: "💗 Got your Reloved?",
      htmlContent: html,
      isActive: true,
    }),
  })
  const text = await res.text()
  console.log("UPDATE", res.status, text.slice(0, 200) || "ok")
  if (!res.ok) process.exit(1)

  if (testTo) {
    const send = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": key,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        templateId: tplId,
        to: [{ email: testTo }],
        params: {
          REQUESTER_NAME: "Aniket",
          ITEM_TITLE: "Pink Corduroy Cropped Jacket",
          CLAIM_URL: "https://reloved.digital/account/claims/Nyy7t00KkhxbYFmx67ya",
        },
      }),
    })
    console.log("TEST_SEND", send.status, (await send.text()).slice(0, 200))
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
