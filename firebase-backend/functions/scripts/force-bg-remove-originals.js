/**
 * Force BG-remove on every Wall original that still has a room background.
 * Keeps existing AI hero; only re-cuts originals with bgRemoved !== true.
 *
 *   node scripts/force-bg-remove-originals.js [--limit=200] [--dry-run] [--match=boss]
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
  const dryRun = argFlag("--dry-run")
  const limit = argValue("--limit", 500)
  const match = argString("--match", "").toLowerCase().trim()
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
  if (!loginRes.ok || !loginBody.token) throw new Error("login failed")
  const token = loginBody.token

  const adminRes = await fetch(`${apiBase}/api/admin/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const adminBody = await adminRes.json()
  let items = (adminBody.items || []).filter((i) => {
    if (i.publicVisibility !== true) return false
    const st = String(i.publicStatus || "")
    return st === "available" || st === "being_matched" || st === "claimed"
  })
  if (match) {
    items = items.filter((i) => `${i.title || ""} ${i.slug || ""}`.toLowerCase().includes(match))
  }

  const needs = []
  for (const item of items) {
    const imgs = Array.isArray(item.images) ? item.images : []
    const originals = imgs.filter((img) => img && img.imageType === "original" && img.storagePath)
    const dirty = originals.filter((img) => img.bgRemoved !== true)
    if (dirty.length > 0) {
      needs.push({
        id: item.id,
        title: item.title || item.id,
        dirty: dirty.length,
        originals: originals.length,
        modelled: imgs.some((img) => img.imageType === "modelled"),
      })
    }
  }

  console.log(
    JSON.stringify(
      { wall: items.length, needBgRemove: needs.length, dryRun, match, limit },
      null,
      2,
    ),
  )

  const targets = needs.slice(0, limit)
  if (dryRun) {
    for (const t of targets) {
      console.log(`- ${t.id} · ${t.title} · dirtyOriginals=${t.dirty}/${t.originals}`)
    }
    return
  }

  let ok = 0
  let fail = 0
  for (const t of targets) {
    console.log(`\n→ ${t.id} · ${String(t.title).slice(0, 55)}`)
    const started = Date.now()
    try {
      const res = await fetch(`${apiBase}/api/donations/polish-item-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ itemId: t.id, force: true }),
      })
      const body = await res.json().catch(() => ({}))
      const secs = Math.round((Date.now() - started) / 1000)
      if (!res.ok) {
        fail++
        console.error(`  FAIL ${res.status} ${secs}s`, JSON.stringify(body).slice(0, 200))
        continue
      }
      ok++
      const types = (body.images || [])
        .map((img) => `${img.imageType}:${img.bgRemoved}`)
        .join(", ")
      console.log(`  ok ${secs}s images=${body.imageCount} [${types}]`)
    } catch (err) {
      fail++
      console.error("  ERROR", err?.message || err)
    }
  }

  console.log("\n==== SUMMARY ====")
  console.log({ ok, fail, remainingListed: needs.length - targets.length })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
