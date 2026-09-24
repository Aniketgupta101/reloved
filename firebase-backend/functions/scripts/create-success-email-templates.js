/**
 * Create Brevo success templates (claimer + giver) and send tests to a mailbox.
 * Usage: node scripts/create-success-email-templates.js [email]
 */
const fs = require("fs")
const path = require("path")

const envPath = path.join(__dirname, "..", ".env.reloved-digital")
const env = fs.readFileSync(envPath, "utf8")
const key = (env.match(/^BREVO_API_KEY=(.*)$/m) || [])[1]?.trim()
const senderEmail = (env.match(/^BREVO_SENDER_EMAIL=(.*)$/m) || [])[1]?.trim() || "mail@reloved.digital"
const senderName = (env.match(/^BREVO_SENDER_NAME=(.*)$/m) || [])[1]?.trim() || "reloved"
const testTo = process.argv[2] || "aniketgupta83003@gmail.com"

if (!key) {
  console.error("BREVO_API_KEY missing")
  process.exit(1)
}

const claimerHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EBE7DF;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" style="width:100%;max-width:540px;" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding-bottom:26px;"><img src="https://reloved-digital.web.app/images/reloved-email-lockup.png?v=16" width="260" height="71" alt="RELOVED" style="display:block;border:0;width:260px;height:71px;max-width:100%;"></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111;border-radius:8px;"><tr><td style="padding:0 4px 4px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1.5px solid #111111;border-radius:8px;"><tr><td style="padding:40px 44px 36px 44px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:#F7A8C4;border-radius:20px;padding:6px 16px;"><span style="font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#111111;">Reloved</span></td></tr></table>
<p style="margin:20px 0 8px;font-size:28px;line-height:1.15;font-weight:900;text-transform:uppercase;color:#111111;">It's yours! &#9825;</p>
<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#595959;">Hi {{params.REQUESTER_NAME}}, congratulations — you benefited from someone's goodness with <strong style="color:#111;">{{params.ITEM_TITLE}}</strong>. Don't forget to pay it forward.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E1D8;border-radius:6px;margin-bottom:22px;">
<tr><td style="padding:14px 16px;border-bottom:1px solid #E5E1D8;"><span style="font-size:13px;color:#111111;font-weight:700;">Optional: share a photo of what you received</span></td></tr>
<tr><td style="padding:14px 16px;"><span style="font-size:13px;color:#111111;font-weight:700;">Add a quick note — it may appear on our Wall of Love</span></td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<a href="{{params.CLAIM_URL}}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#111111;border-radius:6px;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#F4F1EA;text-decoration:none;">Share a Reloved photo</a>
</td></tr></table>
<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#888;">Open your claim anytime if you skipped the popup.</p>
</td></tr></table></td></tr></table></td></tr>
<tr><td align="center" style="padding-top:22px;"><p style="margin:0;font-size:11px;color:#888;">RE-LOVED · The digital Wall of Kindness</p></td></tr>
</table></td></tr></table></body></html>`

const giverHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EBE7DF;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" style="width:100%;max-width:540px;" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding-bottom:26px;"><img src="https://reloved-digital.web.app/images/reloved-email-lockup.png?v=16" width="260" height="71" alt="RELOVED" style="display:block;border:0;width:260px;height:71px;max-width:100%;"></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111;border-radius:8px;"><tr><td style="padding:0 4px 4px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1.5px solid #111111;border-radius:8px;"><tr><td style="padding:40px 44px 36px 44px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:#C6F136;border-radius:20px;padding:6px 16px;"><span style="font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#111111;">Thank you</span></td></tr></table>
<p style="margin:20px 0 8px;font-size:28px;line-height:1.15;font-weight:900;text-transform:uppercase;color:#111111;">Thank you for passing it on. &#9825;</p>
<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#595959;">Hi {{params.FIRST_NAME}}, <strong style="color:#111;">{{params.CLAIMER_NAME}}</strong> confirmed they received <strong style="color:#111;">{{params.ITEM_TITLE}}</strong>. You just made something Reloved.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E1D8;border-radius:6px;margin-bottom:22px;">
<tr><td style="padding:14px 16px;border-bottom:1px solid #E5E1D8;"><span style="font-size:13px;color:#111111;font-weight:700;">Handover complete — both sides confirmed</span></td></tr>
<tr><td style="padding:14px 16px;"><span style="font-size:13px;color:#111111;font-weight:700;">Your kindness keeps preloved pieces in circulation</span></td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<a href="{{params.GIFT_URL}}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#111111;border-radius:6px;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#F4F1EA;text-decoration:none;">View your gift</a>
</td></tr></table>
</td></tr></table></td></tr></table></td></tr>
<tr><td align="center" style="padding-top:22px;"><p style="margin:0;font-size:11px;color:#888;">RE-LOVED · The digital Wall of Kindness</p></td></tr>
</table></td></tr></table></body></html>`

async function brevo(method, urlPath, body) {
  const res = await fetch(`https://api.brevo.com/v3${urlPath}`, {
    method,
    headers: {
      "api-key": key,
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
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} → ${res.status} ${text}`)
  }
  return json
}

async function main() {
  const claimer = await brevo("POST", "/smtp/templates", {
    templateName: "Reloved — Claimer success (photo & feedback)",
    subject: "It's yours! ♡ Share your Reloved moment",
    sender: { name: senderName, email: senderEmail },
    replyTo: "hello@reloved.digital",
    htmlContent: claimerHtml,
    isActive: true,
  })
  const giver = await brevo("POST", "/smtp/templates", {
    templateName: "Reloved — Giver success (gift Reloved)",
    subject: "Thank you for passing it on. ♡ Your gift was Reloved",
    sender: { name: senderName, email: senderEmail },
    replyTo: "hello@reloved.digital",
    htmlContent: giverHtml,
    isActive: true,
  })
  console.log("Created templates:", { claimerId: claimer.id, giverId: giver.id })

  await brevo("POST", "/smtp/email", {
    templateId: claimer.id,
    to: [{ email: testTo, name: "Aniket" }],
    params: {
      REQUESTER_NAME: "Aniket",
      ITEM_TITLE: "Blue kurta",
      CLAIM_URL: "https://reloved.digital/account/claims/demo",
    },
  })
  console.log("Sent claimer success email →", testTo)

  await brevo("POST", "/smtp/email", {
    templateId: giver.id,
    to: [{ email: testTo, name: "Aniket" }],
    params: {
      FIRST_NAME: "Aniket",
      CLAIMER_NAME: "Priya",
      ITEM_TITLE: "Blue kurta",
      GIFT_URL: "https://reloved.digital/account",
    },
  })
  console.log("Sent giver success email →", testTo)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
