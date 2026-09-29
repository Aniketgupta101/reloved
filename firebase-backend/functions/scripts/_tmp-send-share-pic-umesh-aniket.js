/** Send share-a-pic / handover claimer email (#28) → Umesh + Aniket */
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

const env = loadEnv(path.join(__dirname, "../.env.reloved-digital"))
const KEY = env.BREVO_API_KEY
const SENDER = env.BREVO_SENDER_EMAIL || "mail@reloved.digital"
const SENDER_NAME = env.BREVO_SENDER_NAME || "reloved"
const TPL = Number(env.BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID || 28)

const CLAIM_ID = "LRSc7ooP9pg9YnAd6cah"
const ITEM_TITLE = "Animal Print Bodycon Dress"
const CLAIMER_NAME = "Umesh"
const CLAIM_URL = `https://reloved.digital/account/claims/${CLAIM_ID}`

const RECIPIENTS = [
  { email: "umeshranglani@gmail.com", name: "Umesh" },
  { email: "aniketgupta83003@gmail.com", name: "Aniket" },
]

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  for (const to of RECIPIENTS) {
    const res = await postJson(
      "api.brevo.com",
      "/v3/smtp/email",
      { "api-key": KEY },
      {
        sender: { email: SENDER, name: SENDER_NAME },
        to: [to],
        templateId: TPL,
        params: {
          REQUESTER_NAME: CLAIMER_NAME,
          ITEM_TITLE,
          CLAIM_URL,
        },
      }
    )
    console.log("share-a-pic →", to.email, res.status, res.body.slice(0, 160))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
