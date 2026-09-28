/**
 * Send the product user-flow emails to Aniket as a real claimer/giver.
 * Order matches product steps:
 *   OTP → Item claimed → Claim matched → Date & time set → Delivery ready
 *   → Rider coming + On the way → Delivered → Feedback → Thank you
 *
 *   node scripts/send-aniket-user-flow-emails.js
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

const TO = "aniketg266@gmail.com"
const FIRST = "Aniket"
const FULL = "Aniket Gupta"
const ITEM = "Navy BOSS Polo"
const SLOT = "Sunday 27 Sep, 6:00 PM"
const OTP = "619284"
const APP = process.env.PUBLIC_APP_URL || "https://reloved.digital"
const CLAIM_ID = "demo-claim-aniket"

const {
  sendItemClaimNotifyGiver,
  sendClaimDecision,
  sendScheduleSetEmail,
  sendDeliveryReadyToGiver,
  sendDeliveryRiderDispatchedToGiver,
  sendOrderDispatchedToClaimer,
  sendDeliveryDeliveredToClaimer,
  sendHandoverSuccessToClaimer,
  sendHandoverSuccessToGiver,
} = require("../lib/lib/notifications")

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function sendOtpEmail() {
  const key = process.env.BREVO_API_KEY
  if (!key) throw new Error("BREVO_API_KEY missing")
  const templateId = process.env.BREVO_OTP_TEMPLATE_ID
  const payload = templateId
    ? {
        to: [{ email: TO, name: FULL }],
        templateId: Number(templateId),
        params: { OTP, FIRST_NAME: FIRST },
      }
    : {
        sender: {
          email: process.env.BREVO_SENDER_EMAIL || "mail@reloved.digital",
          name: process.env.BREVO_SENDER_NAME || "reloved",
        },
        to: [{ email: TO, name: FULL }],
        subject: "Your Reloved verification code",
        htmlContent: `<p>Hi ${FIRST}, your Reloved verification code is <strong>${OTP}</strong>. It expires in 10 minutes.</p>`,
      }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": key },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`OTP email failed: ${res.status} ${await res.text()}`)
}

const steps = [
  { label: "1. OTP", run: () => sendOtpEmail() },
  {
    label: "2. Item claimed (giver)",
    run: () =>
      sendItemClaimNotifyGiver(TO, {
        firstName: FIRST,
        itemTitle: ITEM,
        giftUrl: `${APP}/account?tab=giving`,
      }),
  },
  {
    label: "3. Claim matched (claimer)",
    run: () =>
      sendClaimDecision(TO, {
        requesterName: FIRST,
        itemTitle: ITEM,
        approved: true,
        nextSteps: "Open your profile to share handover details with the giver.",
      }),
  },
  {
    label: "4. Date & time set",
    run: () =>
      sendScheduleSetEmail(TO, {
        firstName: FIRST,
        itemTitle: ITEM,
        slotLabel: SLOT,
        audience: "claimer",
        claimId: CLAIM_ID,
      }),
  },
  {
    label: "5. Delivery ready (giver)",
    run: () =>
      sendDeliveryReadyToGiver(TO, {
        firstName: FIRST,
        itemTitle: ITEM,
        slotLabel: SLOT,
      }),
  },
  {
    label: "6a. Rider coming (giver)",
    run: () =>
      sendDeliveryRiderDispatchedToGiver(TO, {
        firstName: FIRST,
        itemTitle: ITEM,
      }),
  },
  {
    label: "6b. On the way (claimer)",
    run: () =>
      sendOrderDispatchedToClaimer(TO, {
        requesterName: FIRST,
        itemTitle: ITEM,
      }),
  },
  {
    label: "7. Delivered (claimer)",
    run: () =>
      sendDeliveryDeliveredToClaimer(TO, {
        requesterName: FIRST,
        itemTitle: ITEM,
      }),
  },
  {
    label: "8. Feedback",
    run: () =>
      sendHandoverSuccessToClaimer(TO, {
        requesterName: FIRST,
        itemTitle: ITEM,
        claimId: CLAIM_ID,
      }),
  },
  {
    label: "9. Thank you (giver)",
    run: () =>
      sendHandoverSuccessToGiver(TO, {
        firstName: FIRST,
        claimerName: "A claimer nearby",
        itemTitle: ITEM,
        giftUrl: `${APP}/account?tab=giving`,
      }),
  },
]

;(async () => {
  if (!process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY missing in .env.reloved-digital")
  console.log(`Sending ${steps.length} real user-flow emails to ${TO} (${FULL})`)
  console.log(`Item: ${ITEM} · Slot: ${SLOT}\n`)
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    process.stdout.write(`[${i + 1}/${steps.length}] ${step.label} ... `)
    try {
      await step.run()
      console.log("OK")
    } catch (e) {
      console.log(`FAIL: ${e.message || e}`)
    }
    if (i < steps.length - 1) await sleep(1500)
  }
  console.log("\nDone — check inbox for aniketg266@gmail.com")
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
