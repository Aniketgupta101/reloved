/**
 * Force-repolish all available Wall items:
 *   [0] AI modelled (main)
 *   [1] original with BG removed
 *   [n] extra donor angles (BG-removed)
 *
 * Usage:
 *   node scripts/repolish-wall-all.js [--limit=20] [--match=pink] [--dry-run]
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
function argString(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`))
  if (!hit) return fallback
  return hit.slice(name.length + 1) || fallback
}

async function main() {
  const apiBase = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(
    /\/$/,
    "",
  )
  const dryRun = argFlag("--dry-run")
  const limit = argValue("--limit", 500)
  const match = argString("--match", "").toLowerCase().trim()

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

  const adminRes = await fetch(`${apiBase}/api/admin/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const adminBody = await adminRes.json()
  let items = (adminBody.items || []).filter((i) => {
    if (i.publicVisibility !== true) return false
    const status = String(i.publicStatus || "")
    return status === "available" || status === "being_matched" || status === "claimed"
  })
  if (match) {
    items = items.filter((i) =>
      `${i.title || ""} ${i.slug || ""}`.toLowerCase().includes(match),
    )
  }
  items = items.slice(0, limit)

  console.log(
    JSON.stringify(
      { apiBase, dryRun, match, willProcess: items.length },
      null,
      2,
    ),
  )

  const missingOriginal = []
  let ok = 0
  let fail = 0

  for (const item of items) {
    const title = String(item.title || item.id)
    console.log(`\n→ ${item.id} · ${title.slice(0, 60)}`)
    if (dryRun) continue
    try {
      const started = Date.now()
      const res = await fetch(`${apiBase}/api/donations/polish-item-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ itemId: item.id, force: true }),
      })
      const body = await res.json().catch(() => ({}))
      const secs = Math.round((Date.now() - started) / 1000)
      if (!res.ok) {
        fail++
        console.error(`  FAIL ${res.status} ${secs}s`, JSON.stringify(body).slice(0, 240))
        continue
      }
      ok++
      const types = (body.images || []).map((img) => `${img.imageType}:${img.bgRemoved}`).join(", ")
      console.log(
        `  ok ${secs}s images=${body.imageCount} missingOriginal=${body.missingOriginal} [${types}]`,
      )
      if (body.missingOriginal) {
        missingOriginal.push({ id: item.id, title })
      }
    } catch (err) {
      fail++
      console.error("  ERROR", err?.message || err)
    }
  }

  console.log("\n==== SUMMARY ====")
  console.log({ ok, fail, missingOriginalCount: missingOriginal.length })
  if (missingOriginal.length) {
    console.log("\nItems missing a recoverable donor original:")
    for (const row of missingOriginal) {
      console.log(`- ${row.id} · ${row.title}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
