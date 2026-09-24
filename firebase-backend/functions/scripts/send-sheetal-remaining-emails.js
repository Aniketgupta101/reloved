/**
 * Finish remaining Sheetal user-flow emails (12-14) after interrupted run.
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
const APP = process.env.PUBLIC_APP_URL || "https://test.reloved.digital"
const n = require("../lib/lib/notifications")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const steps = [
  [
    "12 Handover success claimer",
    () =>
      n.sendHandoverSuccessToClaimer(TO, {
        requesterName: "Sheetal",
        itemTitle: ITEM,
        claimId: "test-claim-sheetal",
      }),
  ],
  [
    "13 Handover success giver",
    () =>
      n.sendHandoverSuccessToGiver(TO, {
        firstName: "Sheetal",
        claimerName: "A claimer",
        itemTitle: ITEM,
        giftUrl: `${APP}/account?tab=giving`,
      }),
  ],
  [
    "14 Delivery failed",
    () =>
      n.sendDeliveryFailedNotice(TO, {
        name: "Sheetal",
        itemTitle: ITEM,
        audience: "giver",
        reason: "email template test",
      }),
  ],
]

;(async () => {
  for (let i = 0; i < steps.length; i++) {
    const [label, run] = steps[i]
    process.stdout.write(label + " ... ")
    try {
      await run()
      console.log("OK")
    } catch (e) {
      console.log("FAIL", e.message || e)
    }
    if (i < steps.length - 1) {
      console.log("waiting 30s")
      await sleep(30000)
    }
  }
  console.log("REMAINING_DONE")
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
