/**
 * Push fixed claim email HTML to live Reloved Brevo templates #4 and #12.
 *   node scripts/push-brevo-claim-templates.mjs
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const ENV_PATH = path.resolve(ROOT, "..", "firebase-backend", "functions", ".env.reloved-digital")
const TPL_DIR = path.resolve(ROOT, "..", "firebase-backend", "email-templates")

function loadEnv(raw) {
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
  return env
}

async function updateTemplate(apiKey, id, file, subject) {
  const htmlContent = await readFile(path.join(TPL_DIR, file), "utf8")
  const res = await fetch(`https://api.brevo.com/v3/smtp/templates/${id}`, {
    method: "PUT",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ htmlContent, subject, isActive: true }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`#${id} update failed ${res.status}: ${text}`)
  console.log(`Updated #${id} (${file})`)
}

async function verify(apiKey, id) {
  const res = await fetch(`https://api.brevo.com/v3/smtp/templates/${id}`, {
    headers: { "api-key": apiKey, accept: "application/json" },
  })
  const j = await res.json()
  const html = j.htmlContent || ""
  console.log(
    `verify #${id}: admin-review=${/24.?48|Our team reviews/i.test(html)} giver-decide=${/Accept or Decline/i.test(html)}`,
  )
}

const env = loadEnv(await readFile(ENV_PATH, "utf8"))
if (!env.BREVO_API_KEY) throw new Error("BREVO_API_KEY missing")

await updateTemplate(env.BREVO_API_KEY, 4, "claim-confirmation-user.html", "We've got your request — RE-LOVED")
await updateTemplate(env.BREVO_API_KEY, 12, "item-claim-notify-giver.html", "Someone wants to Relove your item")
await verify(env.BREVO_API_KEY, 4)
await verify(env.BREVO_API_KEY, 12)
console.log("Brevo #4 and #12 are live.")
