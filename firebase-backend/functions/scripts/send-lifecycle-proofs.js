/**
 * Send claim-matched + schedule-set proof emails (Brevo HTML fallbacks).
 *   node scripts/send-lifecycle-proofs.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env.reloved-digital") })

const KEY = process.env.BREVO_API_KEY
const SENDER = process.env.BREVO_SENDER_EMAIL || "no-reply@reloved.org"
const RECIPIENTS = [
  "aniketgupta83003@gmail.com",
  "totemisnottaken@gmail.com",
  "sheetalahuja99@gmail.com",
]

async function send(to, subject, html) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": KEY },
    body: JSON.stringify({
      sender: { email: SENDER, name: "reloved" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  const text = await res.text()
  console.log(res.status, to, subject.slice(0, 48), text.slice(0, 100))
}

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  const matched = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <p style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5C8A22">Matched</p>
  <h2 style="margin:8px 0 12px">You're matched</h2>
  <p>Hi — great news, you're matched for <strong>Navy Polo (lifecycle proof)</strong>.</p>
  <p>Open your Reloved account to continue handover details.</p>
  <p style="color:#666;font-size:12px;margin-top:24px">Reloved proof · claim approved / matched · ${new Date().toISOString()}</p>
</div>`
  const schedule = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <p style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#EC2F9B">Schedule set</p>
  <h2 style="margin:8px 0 12px">Date &amp; time confirmed</h2>
  <p>Hi — the date and time have been set for <strong>Navy Polo (lifecycle proof)</strong> (27 Sept 2026, 6:00 pm).</p>
  <p>Please check your email / Reloved account to make any modifications, or get in touch with us if you need help.</p>
  <p style="color:#666;font-size:12px;margin-top:24px">Reloved proof · schedule set · ${new Date().toISOString()}</p>
</div>`

  for (const to of RECIPIENTS) {
    await send(to, "Yayyy! The dropper has accepted your request (PROOF)", matched)
    await send(to, "Date & time set — Navy Polo (PROOF)", schedule)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
