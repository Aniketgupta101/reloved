/** Check Brevo delivery for Aniket + resend missing delivered/handover mail+SMS */
const fs = require("fs")
const path = require("path")
const https = require("https")

function loadEnv(filePath) {
  const out = {}
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue
    const i = line.indexOf("=")
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[line.slice(0, i).trim()] = v
  }
  return out
}

function postJson(hostname, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const r = https.request(
      {
        hostname,
        path: urlPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => resolve({ status: res.statusCode, body: b }))
      }
    )
    r.on("error", reject)
    r.write(data)
    r.end()
  })
}

function getJson(hostname, urlPath, headers) {
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        hostname,
        path: urlPath,
        method: "GET",
        headers: { accept: "application/json", ...headers },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => resolve({ status: res.statusCode, body: b }))
      }
    )
    r.on("error", reject)
    r.end()
  })
}

const env = loadEnv(path.join(__dirname, "../.env.reloved-digital"))
const KEY = env.BREVO_API_KEY
const SENDER = env.BREVO_SENDER_EMAIL || "mail@reloved.digital"
const SENDER_NAME = env.BREVO_SENDER_NAME || "reloved"
const MSG91 = String(env.MSG91_AUTH_KEY || "").trim()

const EMAIL = "aniketgupta83003@gmail.com"
const PHONE = "7304382922"
const CLAIM_ID = "LRSc7ooP9pg9YnAd6cah"
const ITEM_TITLE = "Animal Print Bodycon Dress"
const CLAIMER_NAME = "Umesh"
const GIVER_NAME = "Sheetal"
const CLAIM_URL = `https://reloved.digital/account/claims/${CLAIM_ID}`
const GIFT_URL = "https://reloved.digital/account?tab=giving"

const TPL = {
  deliveredClaimer: env.BREVO_DELIVERY_DELIVERED_CLAIMER_TEMPLATE_ID,
  deliveredGiver: env.BREVO_DELIVERY_DELIVERED_GIVER_TEMPLATE_ID,
  handoverClaimer: env.BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID,
  handoverGiver: env.BREVO_HANDOVER_SUCCESS_GIVER_TEMPLATE_ID,
}

const SMS = {
  delivered:
    String(env.MSG91_TPL_DELIVERY_DELIVERED_CLAIMER || "").trim() || "6ab39ea41235cf02ba092fd5",
  feedback: String(env.MSG91_TPL_FEEDBACK_THANKS || "").trim() || "6ab92b19c18ed5f2080e4d02",
}

async function main() {
  console.log("=== Recent Brevo emails to", EMAIL, "===")
  const list = await getJson(
    "api.brevo.com",
    `/v3/smtp/emails?email=${encodeURIComponent(EMAIL)}&limit=15&sort=desc`,
    { "api-key": KEY }
  )
  console.log("list", list.status)
  try {
    const j = JSON.parse(list.body)
    for (const e of j.transactionalEmails || []) {
      console.log(
        `${e.date} | tpl=${e.templateId} | ${e.subject} | ${e.messageId || e.uuid}`
      )
    }
  } catch {
    console.log(list.body.slice(0, 500))
  }

  // Peek events for last few message IDs from our send
  const msgIds = [
    "<202609291129.42207127706@smtp-relay.mailin.fr>",
    "<202609291129.35532020682@smtp-relay.mailin.fr>",
    "<202609291129.32690031805@smtp-relay.mailin.fr>",
    "<202609291129.36601015844@smtp-relay.mailin.fr>",
  ]
  console.log("\n=== Event check ===")
  for (const mid of msgIds) {
    const ev = await getJson(
      "api.brevo.com",
      `/v3/smtp/statistics/events?messageId=${encodeURIComponent(mid)}&limit=20`,
      { "api-key": KEY }
    )
    console.log(mid, ev.status, ev.body.slice(0, 300))
  }

  console.log("\n=== Resend ALL emails + both SMS ===")
  const sends = [
    ["delivered-claimer", TPL.deliveredClaimer, CLAIMER_NAME, { REQUESTER_NAME: CLAIMER_NAME, ITEM_TITLE }],
    ["delivered-giver", TPL.deliveredGiver, GIVER_NAME, { FIRST_NAME: GIVER_NAME, ITEM_TITLE }],
    [
      "handover-claimer",
      TPL.handoverClaimer,
      CLAIMER_NAME,
      { REQUESTER_NAME: CLAIMER_NAME, ITEM_TITLE, CLAIM_URL },
    ],
    [
      "handover-giver",
      TPL.handoverGiver,
      GIVER_NAME,
      { FIRST_NAME: GIVER_NAME, CLAIMER_NAME, ITEM_TITLE, GIFT_URL },
    ],
  ]

  for (const [label, templateId, name, params] of sends) {
    if (!templateId) {
      console.log("SKIP", label)
      continue
    }
    const res = await postJson(
      "api.brevo.com",
      "/v3/smtp/email",
      { "api-key": KEY },
      {
        sender: { email: SENDER, name: SENDER_NAME },
        to: [{ email: EMAIL, name }],
        templateId: Number(templateId),
        params,
      }
    )
    console.log("EMAIL", label, res.status, res.body.slice(0, 160))
  }

  // Delivered SMS again
  let sms = await postJson(
    "control.msg91.com",
    "/api/v5/flow",
    { authkey: MSG91 },
    {
      template_id: SMS.delivered,
      short_url: "0",
      recipients: [{ mobiles: `91${PHONE}`, name: CLAIMER_NAME, item: ITEM_TITLE }],
    }
  )
  console.log("SMS delivered", sms.status, sms.body.slice(0, 200))

  // Feedback SMS — try common var names if first fails
  sms = await postJson(
    "control.msg91.com",
    "/api/v5/flow",
    { authkey: MSG91 },
    {
      template_id: SMS.feedback,
      short_url: "0",
      recipients: [{ mobiles: `91${PHONE}`, name: CLAIMER_NAME, item: ITEM_TITLE }],
    }
  )
  console.log("SMS feedback (name/item)", sms.status, sms.body.slice(0, 200))

  sms = await postJson(
    "control.msg91.com",
    "/api/v5/flow",
    { authkey: MSG91 },
    {
      template_id: SMS.feedback,
      short_url: "0",
      recipients: [
        {
          mobiles: `91${PHONE}`,
          VAR1: CLAIMER_NAME,
          VAR2: ITEM_TITLE,
          name: CLAIMER_NAME,
          item: ITEM_TITLE,
          requester_name: CLAIMER_NAME,
          item_title: ITEM_TITLE,
        },
      ],
    }
  )
  console.log("SMS feedback (extra vars)", sms.status, sms.body.slice(0, 200))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
