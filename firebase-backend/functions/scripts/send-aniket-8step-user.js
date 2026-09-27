/**
 * Fire full 8-step SMS + email to Aniket as a real user.
 *   node scripts/send-aniket-8step-user.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env.reloved-digital") })

const MSG_KEY = process.env.MSG91_AUTH_KEY
const BREVO_KEY = process.env.BREVO_API_KEY
const SENDER = process.env.BREVO_SENDER_EMAIL || "no-reply@reloved.org"

const phone = "917304382922"
const email = "aniketg266@gmail.com"
const firstName = "Aniket"
const item = "Navy BOSS Polo"
const slot = "Sunday 27 Sep, 6:00 PM"
const accountUrl = "https://reloved.digital/account"
const otp = "619284"

async function sms(step, label, tid, vars) {
  const res = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey: MSG_KEY },
    body: JSON.stringify({
      template_id: tid,
      short_url: "0",
      recipients: [{ mobiles: phone, ...vars }],
    }),
  })
  const text = await res.text()
  console.log("SMS", step, label, res.status, text.slice(0, 140))
  if (!res.ok) throw new Error(`SMS failed ${label}: ${text}`)
}

async function mail(step, label, subject, html) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": BREVO_KEY },
    body: JSON.stringify({
      sender: { email: SENDER, name: "reloved" },
      to: [{ email, name: firstName }],
      subject,
      htmlContent: html,
    }),
  })
  const text = await res.text()
  console.log("EMAIL", step, label, res.status, text.slice(0, 120))
  if (!res.ok) throw new Error(`Email failed ${label}: ${text}`)
}

function wrap(badge, badgeBg, badgeColor, title, bodyHtml) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EBE7DF;padding:32px 16px;"><tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #111;max-width:540px;">
  <tr><td style="padding:32px 28px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;background:${badgeBg};color:${badgeColor};display:inline-block;padding:6px 12px;">${badge}</p>
  <h1 style="margin:16px 0;font-size:26px;line-height:1.15;text-transform:uppercase;">${title}</h1>
  ${bodyHtml}
  <a href="${accountUrl}" style="display:inline-block;background:#111;color:#C6F136;text-decoration:none;padding:14px 20px;font-size:12px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin-top:8px;">Open Reloved account</a>
  <p style="margin:24px 0 0;font-size:12px;color:#777;">RE-LOVED · Preloved for Free</p>
  </td></tr></table></td></tr></table></body></html>`
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  if (!MSG_KEY) throw new Error("MSG91_AUTH_KEY missing")
  if (!BREVO_KEY) throw new Error("BREVO_API_KEY missing")

  // 1 OTP
  await sms(1, "OTP", process.env.MSG91_SMS_TEMPLATE_ID, { OTP: otp })
  await mail(
    1,
    "OTP",
    "Your Reloved verification code",
    wrap(
      "OTP",
      "#C6F136",
      "#111",
      "Verify your number",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${firstName}, your Reloved code is <strong style="font-size:22px;letter-spacing:0.2em;">${otp}</strong>.</p>
       <p style="margin:0 0 20px;font-size:15px;color:#444;">Enter this code to continue signing in. It expires shortly.</p>`
    )
  )
  await sleep(1000)

  // 2 Item claimed → giver
  await sms(2, "ITEM_CLAIMED", process.env.MSG91_TPL_ITEM_CLAIMED, { name: firstName, item })
  await mail(
    2,
    "ITEM_CLAIMED",
    "Someone would love to Relove your drop! ❤️",
    wrap(
      "New claim",
      "#C6F136",
      "#111",
      "Someone wants your item",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${firstName}, someone would love to Relove your drop! Your item (<strong>${item}</strong>) is being matched.</p>
       <p style="margin:0 0 20px;font-size:15px;color:#444;">Open your account to Accept or Decline.</p>`
    )
  )
  await sleep(1000)

  // 3 Claim matched → claimer
  await sms(3, "CLAIM_MATCHED", process.env.MSG91_TPL_CLAIM_MATCHED, { name: firstName, item })
  await mail(
    3,
    "CLAIM_MATCHED",
    "Yayyy! The dropper has accepted your request",
    wrap(
      "Matched",
      "#C6F136",
      "#111",
      "You're matched",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${firstName}, great news — you're matched for <strong>${item}</strong>.</p>
       <p style="margin:0 0 20px;font-size:15px;color:#444;">Open your Reloved account to continue with handover details.</p>`
    )
  )
  await sleep(1000)

  // 4 Delivery ready → giver
  await sms(4, "DELIVERY_READY", process.env.MSG91_TPL_DELIVERY_READY_GIVER, {
    name: firstName,
    item,
  })
  await mail(
    4,
    "DELIVERY_READY",
    `Delivery ready — please be ready with ${item}`,
    wrap(
      "Delivery ready",
      "#C6F136",
      "#111",
      "Please be ready with your item",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${firstName}, delivery for <strong>${item}</strong> is ready. Pickup window: ${slot}.</p>
       <p style="margin:0 0 20px;font-size:15px;color:#444;">Bag the item and leave it with your building's main gate security when the rider is due.</p>`
    )
  )
  await sleep(1000)

  // 5 Schedule set
  await sms(5, "SCHEDULE_SET", process.env.MSG91_TPL_SCHEDULE_SET, {
    name: firstName,
    item,
    slot: "Sun 6pm",
  })
  await mail(
    5,
    "SCHEDULE_SET",
    `Date & time set — ${item}`,
    wrap(
      "Schedule set",
      "#EC2F9B",
      "#fff",
      "Date &amp; time confirmed",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${firstName}, the date and time for <strong>${item}</strong> have been set (<strong>${slot}</strong>).</p>
       <p style="margin:0 0 20px;font-size:15px;color:#444;">Please check your email / Reloved account to make any modifications, or get in touch with us if you need help.</p>`
    )
  )
  await sleep(1000)

  // 6a Rider coming → giver
  await sms(6, "RIDER_COMING", process.env.MSG91_TPL_DELIVERY_RIDER_COMING, {
    name: firstName,
    item,
  })
  await mail(
    6,
    "RIDER_COMING",
    `Rider on the way for ${item}`,
    wrap(
      "Rider coming",
      "#C6F136",
      "#111",
      "Rider is coming",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${firstName}, a Reloved rider is coming for <strong>${item}</strong>.</p>
       <p style="margin:0 0 20px;font-size:15px;color:#444;">Bag it and leave it with building gate security now.</p>`
    )
  )
  await sleep(1000)

  // 6b Order on the way → claimer
  await sms(6, "ORDER_DISPATCHED", process.env.MSG91_TPL_ORDER_DISPATCHED_CLAIMER, {
    name: firstName,
    item,
  })
  await mail(
    6,
    "ORDER_DISPATCHED",
    `Your Reloved item is on the way — ${item}`,
    wrap(
      "On the way",
      "#C6F136",
      "#111",
      "Order dispatched",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${firstName}, your Reloved item <strong>${item}</strong> has been picked up and is on the way to you.</p>
       <p style="margin:0 0 20px;font-size:15px;color:#444;">We'll update you when it's delivered.</p>`
    )
  )
  await sleep(1000)

  // 7 Delivered
  await sms(7, "DELIVERED", process.env.MSG91_TPL_DELIVERY_DELIVERED_CLAIMER, { item })
  await mail(
    7,
    "DELIVERED",
    `Delivered — ${item}`,
    wrap(
      "Delivered",
      "#C6F136",
      "#111",
      "Your item has arrived",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${firstName}, your Reloved item <strong>${item}</strong> has been delivered.</p>
       <p style="margin:0 0 20px;font-size:15px;color:#444;">Enjoy — thanks for choosing Reloved.</p>`
    )
  )
  await sleep(1000)

  // 8 Feedback / thank you
  await sms(8, "FEEDBACK", process.env.MSG91_TPL_FEEDBACK_THANKS, { name: firstName, item })
  await mail(
    8,
    "FEEDBACK",
    "Thank you for Reloving",
    wrap(
      "Thank you",
      "#C6F136",
      "#111",
      "We'd love your feedback",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${firstName}, thanks for Reloving <strong>${item}</strong>.</p>
       <p style="margin:0 0 20px;font-size:15px;color:#444;">If you have a moment, tell us how the handover went — it helps us keep the Wall of Kindness going.</p>`
    )
  )

  console.log("DONE — 8-step SMS + email to Aniket Gupta (7304382922 / aniketg266@gmail.com)")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
