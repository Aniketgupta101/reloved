/**
 * One-off: force-polish specific Wall item IDs.
 * Usage: node scripts/polishTwoWallItems.js
 */
const fs = require("fs")
const path = require("path")

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = val
  }
}

loadEnv(path.join(__dirname, "../.env.reloved-digital"))

const IDS = [
  "V7ArcEUjZIERQv63gVEn", // HRX Performance T-shirt
  "o2hyLEJrHGcutUwdzqab", // Red Strapless Ruched Dress (mannequin)
]

async function main() {
  const apiBase = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(
    /\/$/,
    "",
  )
  const email = (process.env.ADMIN_EMAIL || "").trim()
  const password = (process.env.ADMIN_PASSWORD || "").trim()
  if (!email || !password) throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD missing")

  console.log("Logging in…")
  const loginRes = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const loginBody = await loginRes.json()
  if (!loginRes.ok || !loginBody.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginBody).slice(0, 200)}`)
  }
  const token = loginBody.token

  for (const itemId of IDS) {
    console.log(`\n→ force polish ${itemId}`)
    const started = Date.now()
    const res = await fetch(`${apiBase}/api/donations/polish-item-images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ itemId, force: true }),
    })
    const body = await res.json().catch(() => ({}))
    console.log(
      `  ${res.status} in ${Math.round((Date.now() - started) / 1000)}s`,
      JSON.stringify(body),
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
