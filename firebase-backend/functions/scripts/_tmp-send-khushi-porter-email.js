/** One-shot: porter-instead-of-pickup email → Khushi (Green Clutch). */
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

const KEY = process.env.BREVO_API_KEY
const TPL = Number(process.env.BREVO_OPS_PORTER_INSTEAD_OF_PICKUP_TEMPLATE_ID || 33)
const DROP =
  process.argv[2] ||
  "Andheri West railway station, Nacado shopping Centre, Andheri West tattoo tanix, Mumbai 400058"

async function main() {
  if (!KEY) throw new Error("BREVO_API_KEY missing")
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({
      templateId: TPL,
      to: [{ email: "k7697719@gmail.com", name: "Khushi" }],
      params: {
        CLAIMER_NAME: "Khushi",
        ITEM_TITLE: "Green Clutch Bag with Shoulder Strap",
        SLOT_LABEL: "29 Sept 2026, 8:00 pm",
        DROP_ADDRESS: DROP,
        PROFILE_URL: "https://reloved.digital/account/claims/Wn5QHRwzNRJq3xOvFguT",
      },
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text)
  console.log("Sent to k7697719@gmail.com OK", text)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
