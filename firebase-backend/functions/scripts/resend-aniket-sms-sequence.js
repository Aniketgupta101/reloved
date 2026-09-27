/**
 * Ordered SMS resend for Aniket (7304382922).
 *   node scripts/resend-aniket-sms-sequence.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env.reloved-digital") })

const key = process.env.MSG91_AUTH_KEY
const phone = "917304382922"
const name = "Aniket"
const item = "Navy BOSS Polo"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function send(label, tid, vars) {
  if (!tid) {
    console.log(label, "SKIP — missing template id")
    return
  }
  const res = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey: key },
    body: JSON.stringify({
      template_id: tid,
      short_url: "0",
      recipients: [{ mobiles: phone, ...vars }],
    }),
  })
  const text = await res.text()
  console.log(label, res.status, text)
  await sleep(1500)
}

async function main() {
  await send("1 OTP", process.env.MSG91_SMS_TEMPLATE_ID, { OTP: "482917" })
  await send("2 ITEM_CLAIMED", process.env.MSG91_TPL_ITEM_CLAIMED, { name, item })
  await send("3 CLAIM_MATCHED", process.env.MSG91_TPL_CLAIM_MATCHED, { name, item })
  await send("4 DATE_TIME_SET", process.env.MSG91_TPL_SCHEDULE_SET, {
    name,
    item,
    slot: "Sun 6pm",
  })
  await send("5 DELIVERY_READY", process.env.MSG91_TPL_DELIVERY_READY_GIVER, { name, item })
  await send("6 RIDER_COMING", process.env.MSG91_TPL_DELIVERY_RIDER_COMING, { name, item })
  await send("6 ON_THE_WAY", process.env.MSG91_TPL_ORDER_DISPATCHED_CLAIMER, { name, item })
  await send("7 DELIVERED", process.env.MSG91_TPL_DELIVERY_DELIVERED_CLAIMER, { item })
  await send("8 FEEDBACK", process.env.MSG91_TPL_FEEDBACK_THANKS, { name, item })
  await send("9 THANK_YOU", process.env.MSG91_TPL_FEEDBACK_THANKS, { name, item })
  console.log("DONE — sequence sent to 7304382922")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
