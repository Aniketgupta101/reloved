/**
 * Withdraw the E2E test wall item.
 * Usage: node scripts/_tmp-remove-e2e-test-item.js
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

const ITEM_ID = "7oyQTSzmyjAitkb8vSVL"

async function main() {
  const apiBase = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(
    /\/$/,
    "",
  )
  const loginRes = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  })
  const loginBody = await loginRes.json()
  if (!loginRes.ok || !loginBody.token) {
    throw new Error(`login failed: ${JSON.stringify(loginBody)}`)
  }
  const token = loginBody.token

  const beforeRes = await fetch(`${apiBase}/api/admin/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const beforeBody = await beforeRes.json()
  const before = (beforeBody.items || []).find((i) => i.id === ITEM_ID)
  console.log(
    "before:",
    before
      ? {
          id: before.id,
          title: before.title,
          donor: before.donorRecognition || before.donorFirstName,
          publicStatus: before.publicStatus,
          publicVisibility: before.publicVisibility,
        }
      : "not in default admin list (maybe already withdrawn)",
  )

  const patchRes = await fetch(`${apiBase}/api/admin/items/${ITEM_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      publicVisibility: false,
      publicStatus: "withdrawn",
      status: "withdrawn",
    }),
  })
  const patchBody = await patchRes.json()
  if (!patchRes.ok) {
    throw new Error(`patch failed ${patchRes.status}: ${JSON.stringify(patchBody)}`)
  }

  const item = patchBody.item || {}
  console.log("after:", {
    id: item.id,
    title: item.title,
    publicStatus: item.publicStatus,
    publicVisibility: item.publicVisibility,
    status: item.status,
  })
  console.log("ok: E2E test item withdrawn from Wall")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
