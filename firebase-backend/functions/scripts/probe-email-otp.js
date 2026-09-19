const fs = require("fs")
const path = "c:/Users/PC 3/Desktop/Reloved-main/Reloved-main/firebase-backend/functions/.env.reloved-digital"
for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue
  const i = line.indexOf("=")
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  let v = line.slice(i + 1).trim()
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1)
  }
  process.env[k] = v
}

async function main() {
  const relayUrl = process.env.EMAIL_RELAY_URL
  const relaySecret = process.env.EMAIL_RELAY_SECRET
  console.log(
    JSON.stringify(
      {
        relayConfigured: Boolean(relayUrl && relaySecret),
        relayHost: (() => {
          try {
            return new URL(relayUrl).host
          } catch {
            return "bad"
          }
        })(),
        msg91Auth: Boolean(process.env.MSG91_AUTH_KEY),
        msg91Template: process.env.MSG91_SMS_TEMPLATE_ID || "EMPTY",
        otpFallbackLog: process.env.OTP_VENDOR_FALLBACK_LOG,
        brevoOtpTemplate: process.env.BREVO_OTP_TEMPLATE_ID,
        claimGiverTemplate: process.env.BREVO_ITEM_CLAIM_GIVER_TEMPLATE_ID,
        waitlistTemplate: process.env.BREVO_WAITLIST_WELCOME_TEMPLATE_ID || "EMPTY",
      },
      null,
      2
    )
  )

  const code = "424242"
  // Relay
  try {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 15000)
    const res = await fetch(relayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-relay-secret": relaySecret,
      },
      body: JSON.stringify({ email: "totemistaken@gmail.com", code }),
      signal: ac.signal,
    })
    clearTimeout(t)
    console.log("relayStatus", res.status, (await res.text()).slice(0, 200))
  } catch (e) {
    console.log("relayError", e.name, e.message)
  }

  // Brevo direct OTP
  try {
    const key = process.env.BREVO_API_KEY
    const templateId = process.env.BREVO_OTP_TEMPLATE_ID
    const payload = templateId
      ? {
          to: [{ email: "totemistaken@gmail.com" }],
          templateId: Number(templateId),
          params: { OTP: code },
        }
      : {
          to: [{ email: "totemistaken@gmail.com" }],
          sender: {
            email: process.env.BREVO_SENDER_EMAIL,
            name: process.env.BREVO_SENDER_NAME,
          },
          subject: "reloved OTP connectivity test",
          htmlContent: `<p>Test code <strong>${code}</strong></p>`,
        }
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify(payload),
    })
    console.log("brevoDirectStatus", res.status, (await res.text()).slice(0, 300))
  } catch (e) {
    console.log("brevoError", e.message)
  }

  // Claim-giver template smoke test to waseem
  try {
    const key = process.env.BREVO_API_KEY
    const templateId = process.env.BREVO_ITEM_CLAIM_GIVER_TEMPLATE_ID
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify({
        to: [{ email: "waseemjaved@gmail.com" }],
        templateId: Number(templateId),
        params: {
          FIRST_NAME: "Waseem",
          ITEM_TITLE: "Connectivity Test Shirt",
          PROFILE_URL: "https://reloved-digital.web.app/account",
        },
      }),
    })
    console.log("claimGiverStatus", res.status, (await res.text()).slice(0, 300))
  } catch (e) {
    console.log("claimGiverError", e.message)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
