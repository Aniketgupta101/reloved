/**
 * Recreate MSG91 SMS templates from STPL-approved copy, write new IDs, smoke-test.
 *   node scripts/recreate-msg91-from-stpl.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env.reloved-digital") })
const fs = require("fs")
const path = require("path")

const key = process.env.MSG91_AUTH_KEY
const ADD = "https://control.msg91.com/api/v5/sms/addTemplate"
const VERSIONS = "https://control.msg91.com/api/v5/sms/getTemplateVersions"
const FLOW = "https://control.msg91.com/api/v5/flow"
const phone = "917304382922"

/** Exact STPL bodies (MSG91 vars = ##name## / ##item## / ##OTP## / ##slot##). */
const TEMPLATES = [
  {
    env: "MSG91_SMS_TEMPLATE_ID",
    name: "RELOVED_OTP_LOGIN_STPL",
    dlt: "1777178963509485562",
    template:
      "Your Reloved Digital verification code is ##OTP##. Valid for 10 minutes. Do not share this OTP with anyone.\n- Reloved Digital",
    testVars: { OTP: "739182" },
  },
  {
    env: "MSG91_TPL_ITEM_CLAIMED",
    name: "RELOVED_ITEM_CLAIMED_STPL",
    dlt: "1777179006425983270",
    template:
      "Hi ##name##, someone wants your Reloved Digital item ##item##. Open your account to accept or decline.\n- Reloved Digital",
    testVars: { name: "Aniket", item: "Navy Polo" },
  },
  {
    env: "MSG91_TPL_CLAIM_MATCHED",
    name: "RELOVED_CLAIM_MATCHED_STPL",
    dlt: "", // STPL was WIP — create content; map DLT in portal when Active
    template:
      "Hi ##name##, you are matched for ##item## on Reloved Digital. Next step is delivery — check your account.\n- Reloved Digital",
    testVars: { name: "Aniket", item: "Navy Polo" },
  },
  {
    env: "MSG91_TPL_DELIVERY_READY_GIVER",
    name: "RELOVED_DELIVERY_READY_GIVER_STPL",
    dlt: "",
    template:
      "Hi ##name##, delivery for ##item## is ready. Please bag the item and leave it with your building gate security.\n- Reloved Digital",
    testVars: { name: "Aniket", item: "Navy Polo" },
  },
  {
    env: "MSG91_TPL_SCHEDULE_SET",
    name: "RELOVED_SCHEDULE_SET_STPL",
    dlt: "",
    template:
      "Hi ##name##, the date and time for ##item## have been set. Please check your email to modify or cancel, or get in touch with us.\n- Reloved Digital",
    testVars: { name: "Aniket", item: "Navy Polo" },
  },
  {
    env: "MSG91_TPL_DELIVERY_RIDER_COMING",
    name: "RELOVED_DELIVERY_RIDER_COMING_STPL",
    dlt: "1777178999108908198",
    template:
      "Hi ##name##, a Reloved Digital rider is coming for ##item##. Bag it and leave it with building gate security now.\n- Reloved Digital",
    testVars: { name: "Aniket", item: "Navy Polo" },
  },
  {
    env: "MSG91_TPL_ORDER_DISPATCHED_CLAIMER",
    name: "RELOVED_DELIVERY_ON_THE_WAY_STPL",
    dlt: "1777178983119126011",
    template:
      "Hi ##name##, your Reloved Digital item ##item## has been picked up and is on the way to you.\n- Reloved Digital",
    testVars: { name: "Aniket", item: "Navy Polo" },
  },
  {
    env: "MSG91_TPL_DELIVERY_DELIVERED_CLAIMER",
    name: "RELOVED_DELIVERY_DELIVERED_CLAIMER_STPL",
    dlt: "1777178999729243245",
    template:
      "Hi ##name##, ##item## has been delivered. Enjoy — thanks for choosing Reloved Digital.\n- Reloved Digital",
    testVars: { name: "Aniket", item: "Navy Polo" },
  },
  {
    env: "MSG91_TPL_FEEDBACK_THANKS",
    name: "RELOVED_THANKYOU_WALL_OF_LOVE",
    dlt: "",
    template:
      "Hi ##name##, got your Reloved? Send us a pic with your new find and we'll share it on our Wall of Love.\n- Reloved Digital",
    testVars: { name: "Aniket", item: "Spider man suit" },
  },
  {
    env: "MSG91_TPL_DELIVERY_FAILED",
    name: "RELOVED_DELIVERY_FAILED_STPL",
    dlt: "1777178983130001001",
    template:
      "Hi ##name##, delivery of ##item## could not be completed. Reloved Digital will contact you to reschedule.\n- Reloved Digital",
    testVars: { name: "Aniket", item: "Navy Polo" },
  },
]

async function addTemplate(t) {
  const body = {
    template_name: t.name,
    sender_id: "RELOVD",
    template: t.template,
  }
  if (t.dlt) body.DLT_TE_ID = t.dlt
  const res = await fetch(ADD, {
    method: "POST",
    headers: { authkey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const j = await res.json()
  return j
}

async function checkVersion(tid) {
  const res = await fetch(VERSIONS, {
    method: "POST",
    headers: { authkey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: tid }),
  })
  return res.json()
}

async function sendFlow(tid, vars) {
  const res = await fetch(FLOW, {
    method: "POST",
    headers: { authkey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      template_id: tid,
      short_url: "0",
      recipients: [{ mobiles: phone, ...vars }],
    }),
  })
  return { status: res.status, text: await res.text() }
}

function patchEnv(filePath, updates) {
  let raw = fs.readFileSync(filePath, "utf8")
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}=.*$`, "m")
    if (re.test(raw)) raw = raw.replace(re, `${k}=${v}`)
    else raw = raw.trimEnd() + `\n${k}=${v}\n`
  }
  fs.writeFileSync(filePath, raw)
}

async function main() {
  if (!key) throw new Error("MSG91_AUTH_KEY missing")

  const created = []
  const updates = {}

  console.log("=== Creating STPL-matched MSG91 templates ===")
  for (const t of TEMPLATES) {
    const j = await addTemplate(t)
    const tid = j?.data?.template_id
    const ok = j?.status === "success" && tid
    console.log(t.name, ok ? "CREATED " + tid : "FAIL " + JSON.stringify(j).slice(0, 200))
    if (!ok) continue
    created.push({ ...t, id: tid })
    updates[t.env] = tid
    await new Promise((r) => setTimeout(r, 400))
  }

  const outPath = path.join(__dirname, "_msg91-stpl-recreated.json")
  fs.writeFileSync(outPath, JSON.stringify(created, null, 2))
  console.log("Wrote", outPath)

  const envFiles = [
    path.join(__dirname, "../.env.reloved-digital"),
    path.join(__dirname, "../.env"),
  ]
  for (const f of envFiles) {
    if (fs.existsSync(f)) {
      patchEnv(f, updates)
      console.log("Patched", f)
    }
  }

  console.log("\n=== Version / Active check ===")
  const live = []
  for (const t of created) {
    const j = await checkVersion(t.id)
    if (j.data && j.data[0]) {
      const d = j.data[0]
      console.log(t.name, "status=" + d.status, "active=" + d.active_status, "body=" + String(d.template_data || "").slice(0, 80))
      if (String(d.status) === "1" && String(d.active_status) === "1") live.push(t.env)
    } else {
      console.log(t.name, "PENDING/UNFETCHABLE", JSON.stringify(j.errors || j).slice(0, 120))
    }
  }

  console.log("\n=== Smoke send to", phone, "===")
  for (const t of created) {
    const r = await sendFlow(t.id, t.testVars)
    console.log(t.env, r.status, r.text.slice(0, 100))
    await new Promise((r) => setTimeout(r, 800))
  }

  console.log("\nLIVE_ENV_KEYS=", JSON.stringify(live))
  console.log("ALL_NEW_IDS=", JSON.stringify(updates, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
