/**
 * Send user-flow (claimer + giver) email templates to Sheetal, one every 30s.
 *   node scripts/send-sheetal-user-flow-emails.js
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

const TO = "sheetalahuja99@gmail.com"
const ITEM = "Pink Corduroy Cropped Jacket (email test)"
const REF = "RL-TEST-SHEETAL-EMAIL"
const APP = process.env.PUBLIC_APP_URL || "https://test.reloved.digital"

const {
  sendDonationConfirmation,
  sendClaimConfirmation,
  sendItemClaimNotifyGiver,
  sendClaimDecision,
  sendClaimCancelledToGiver,
  sendDeliveryDetailsToGiver,
  sendDeliveryRiderDispatchedToGiver,
  sendDeliveryDeliveredToClaimer,
  sendDeliveryDeliveredToGiver,
  sendReloveDeliveredToClaimer,
  sendHandoverSuccessToClaimer,
  sendHandoverSuccessToGiver,
  sendDeliveryFailedNotice,
} = require("../lib/lib/notifications")

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const steps = [
  {
    role: "GIVER",
    label: "1. Drop confirmation (We've got your item)",
    run: () =>
      sendDonationConfirmation(TO, { firstName: "Sheetal", itemTitle: ITEM, reference: REF }),
  },
  {
    role: "CLAIMER",
    label: "2. Claim confirmation (We've got your request)",
    run: () => sendClaimConfirmation(TO, { requesterName: "Sheetal", itemTitle: ITEM }),
  },
  {
    role: "GIVER",
    label: "3. Someone claimed your item",
    run: () =>
      sendItemClaimNotifyGiver(TO, {
        firstName: "Sheetal",
        itemTitle: ITEM,
        giftUrl: `${APP}/account?tab=giving`,
      }),
  },
  {
    role: "CLAIMER",
    label: "4. Matched / accepted",
    run: () =>
      sendClaimDecision(TO, {
        requesterName: "Sheetal",
        itemTitle: ITEM,
        approved: true,
        nextSteps: "Open your profile to share handover details with the giver.",
      }),
  },
  {
    role: "CLAIMER",
    label: "5. Soft decline (couldn't match)",
    run: () =>
      sendClaimDecision(TO, {
        requesterName: "Sheetal",
        itemTitle: ITEM,
        approved: false,
        softDecline: true,
      }),
  },
  {
    role: "GIVER",
    label: "6. Claim cancelled - back on Wall",
    run: () => sendClaimCancelledToGiver(TO, { firstName: "Sheetal", itemTitle: ITEM }),
  },
  {
    role: "GIVER",
    label: "7. Delivery / address details shared",
    run: () =>
      sendDeliveryDetailsToGiver(TO, {
        firstName: "Sheetal",
        itemTitle: ITEM,
        receiverAddress: "Bandra West, Mumbai (building gate)",
      }),
  },
  {
    role: "GIVER",
    label: "8. Rider dispatched (action required)",
    run: () => sendDeliveryRiderDispatchedToGiver(TO, { firstName: "Sheetal", itemTitle: ITEM }),
  },
  {
    role: "CLAIMER",
    label: "9. Courier delivered (claimer)",
    run: () => sendDeliveryDeliveredToClaimer(TO, { requesterName: "Sheetal", itemTitle: ITEM }),
  },
  {
    role: "GIVER",
    label: "10. Courier delivered (giver thank-you)",
    run: () => sendDeliveryDeliveredToGiver(TO, { firstName: "Sheetal", itemTitle: ITEM }),
  },
  {
    role: "CLAIMER",
    label: "11. Peer handover / Relove delivered",
    run: () => sendReloveDeliveredToClaimer(TO, { requesterName: "Sheetal", itemTitle: ITEM }),
  },
  {
    role: "CLAIMER",
    label: "12. Handover success (claimer)",
    run: () =>
      sendHandoverSuccessToClaimer(TO, {
        requesterName: "Sheetal",
        itemTitle: ITEM,
        claimId: "test-claim-sheetal",
      }),
  },
  {
    role: "GIVER",
    label: "13. Handover success (giver)",
    run: () =>
      sendHandoverSuccessToGiver(TO, {
        firstName: "Sheetal",
        claimerName: "A claimer",
        itemTitle: ITEM,
        giftUrl: `${APP}/account?tab=giving`,
      }),
  },
  {
    role: "EITHER",
    label: "14. Delivery failed",
    run: () =>
      sendDeliveryFailedNotice(TO, {
        name: "Sheetal",
        itemTitle: ITEM,
        audience: "giver",
        reason: "email template test",
      }),
  },
]

;(async () => {
  console.log(`Sending ${steps.length} user-flow emails to ${TO}`)
  console.log(`Gap: 30s between each\n`)
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const ts = new Date().toISOString()
    process.stdout.write(`[${i + 1}/${steps.length}] ${step.role} ${step.label} ... `)
    try {
      await step.run()
      console.log(`OK @ ${ts}`)
    } catch (e) {
      console.log(`FAIL: ${e.message || e}`)
    }
    if (i < steps.length - 1) {
      console.log("  waiting 30s...")
      await sleep(30000)
    }
  }
  console.log("\nDone.")
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
