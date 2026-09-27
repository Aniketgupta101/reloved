/**
 * Role-correct SMS demo for Aniket (dropper phone only).
 * Dropper never receives claimer "on the way / delivered" SMS.
 *   node scripts/send-dropper-sms-demo.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env.reloved-digital") })

const key = process.env.MSG91_AUTH_KEY
const phone = "917304382922"
const name = "Aniket"
const item = "Navy BOSS Polo"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function send(label, tid, vars) {
  const res = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey: key },
    body: JSON.stringify({
      template_id: tid,
      short_url: "0",
      recipients: [{ mobiles: phone, ...vars }],
    }),
  })
  console.log(label, res.status, await res.text())
  await sleep(1200)
}

async function main() {
  // Dropper journey only (what a giver should see)
  await send("1 ITEM_CLAIMED (dropper)", process.env.MSG91_TPL_ITEM_CLAIMED, { name, item })
  await send("2 DELIVERY_READY (dropper)", process.env.MSG91_TPL_DELIVERY_READY_GIVER, {
    name,
    item,
  })
  await send("3 SCHEDULE_SET (dropper)", process.env.MSG91_TPL_SCHEDULE_SET, {
    name,
    item,
    slot: "Sun 6pm",
  })
  await send("4 RIDER_COMING (dropper)", process.env.MSG91_TPL_DELIVERY_RIDER_COMING, {
    name,
    item,
  })
  // Intentionally NOT sending ON_THE_WAY / DELIVERED / FEEDBACK — those are claimer-only.
  console.log("DONE — dropper-only SMS (no claimer messages)")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
