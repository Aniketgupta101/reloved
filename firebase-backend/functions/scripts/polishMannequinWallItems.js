/**
 * Force-polish Wall items that still show mannequin heads/torsos.
 * Usage: node scripts/polishMannequinWallItems.js
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

const NEEDLES = [
  "zanella",
  "thor avengers",
  "teen titans",
  "robin costume",
  "lemon ice lolly",
  "spider belly",
  "baby spider",
]

function matches(title) {
  const hay = String(title || "").toLowerCase()
  return NEEDLES.some((n) => hay.includes(n))
}

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

  // Claimed + available wall cards both need the cleanup.
  const statuses = ["wall", "claimed", "matched", "completed"]
  const seen = new Set()
  const targets = []

  for (const status of statuses) {
    const itemsRes = await fetch(`${apiBase}/api/items?status=${status}&limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const itemsBody = await itemsRes.json().catch(() => ({}))
    if (!itemsRes.ok) {
      console.warn(`List ${status} failed:`, itemsRes.status, JSON.stringify(itemsBody).slice(0, 160))
      continue
    }
    for (const it of itemsBody.items || []) {
      if (!it?.id || seen.has(it.id)) continue
      if (!matches(it.title)) continue
      seen.add(it.id)
      targets.push({ id: it.id, title: it.title, status })
    }
  }

  console.log(
    JSON.stringify(
      {
        apiBase,
        matched: targets.map((t) => ({ id: t.id, title: t.title, status: t.status })),
      },
      null,
      2,
    ),
  )

  if (!targets.length) {
    console.log("No matching items found.")
    return
  }

  let ok = 0
  let fail = 0
  for (const item of targets) {
    console.log(`\n→ force polish ${item.id} · ${String(item.title).slice(0, 60)}`)
    const started = Date.now()
    try {
      const res = await fetch(`${apiBase}/api/donations/polish-item-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ itemId: item.id, force: true }),
      })
      const body = await res.json().catch(() => ({}))
      console.log(
        `  ${res.status} in ${Math.round((Date.now() - started) / 1000)}s`,
        JSON.stringify(body),
      )
      if (res.ok) ok++
      else fail++
    } catch (err) {
      fail++
      console.error("  ERROR", err?.message || err)
    }
  }

  console.log("\nDone:", { ok, fail })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
