/**
 * Recover originals one item at a time (avoids Cloud Function timeout),
 * then polish each to AI + BG-removed original.
 *
 *   node scripts/run-recover-originals.js [--dry-run] [--limit=200]
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

function argFlag(name) {
  return process.argv.includes(name)
}
function argValue(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`))
  if (!hit) return fallback
  const n = Number(hit.split("=")[1])
  return Number.isFinite(n) ? n : fallback
}

async function main() {
  const dryRun = argFlag("--dry-run")
  const limit = argValue("--limit", 200)
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
    throw new Error(`login failed: ${JSON.stringify(loginBody).slice(0, 200)}`)
  }
  const token = loginBody.token
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

  console.log("1) dry-run discover recoverable items…")
  const discoverRes = await fetch(`${apiBase}/api/admin/items/recover-originals`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ dryRun: true, forcePolish: false, limit }),
  })
  const discover = await discoverRes.json().catch(() => ({}))
  if (!discoverRes.ok) {
    console.error("discover failed", discoverRes.status, discover)
    process.exit(1)
  }
  const recoverable = (discover.results || []).filter((r) => r.status === "recovered")
  const unrecovered = (discover.results || []).filter((r) => r.status === "unrecovered")
  console.log(
    JSON.stringify(
      {
        wall: discover.wall,
        missingBefore: discover.missingBefore,
        recoverable: recoverable.length,
        unrecovered: unrecovered.length,
      },
      null,
      2,
    ),
  )

  if (dryRun) {
    for (const r of recoverable) {
      console.log(`✓ ${r.id} · ${r.title} · ${r.source}`)
    }
    console.log("\nStill missing:")
    for (const r of unrecovered) console.log(`- ${r.id} · ${r.title}`)
    return
  }

  let ok = 0
  let fail = 0
  for (const row of recoverable) {
    console.log(`\n→ ${row.id} · ${(row.title || "").slice(0, 50)}`)
    const started = Date.now()
    try {
      const res = await fetch(`${apiBase}/api/admin/items/recover-originals`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          dryRun: false,
          forcePolish: true,
          limit: 1,
          itemIds: [row.id],
        }),
      })
      const body = await res.json().catch(() => ({}))
      const secs = Math.round((Date.now() - started) / 1000)
      if (!res.ok || (body.recovered || 0) < 1) {
        fail++
        console.error(`  FAIL ${res.status} ${secs}s`, JSON.stringify(body).slice(0, 240))
        continue
      }
      ok++
      const one = (body.results || [])[0]
      console.log(
        `  ok ${secs}s source=${one?.source} polish=${JSON.stringify(one?.polish || {})}`,
      )
    } catch (err) {
      fail++
      console.error("  ERROR", err?.message || err)
    }
  }

  console.log("\n==== SUMMARY ====")
  console.log({ ok, fail, unrecovered: unrecovered.length })
  if (unrecovered.length) {
    console.log("\nStill missing originals (no file found):")
    for (const r of unrecovered) console.log(`- ${r.id} · ${r.title}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
