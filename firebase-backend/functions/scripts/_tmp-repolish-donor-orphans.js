/**
 * Re-polish Wall items that have donorOriginalPaths but no BG-removed original slot.
 *   node scripts/_tmp-repolish-donor-orphans.js
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

async function main() {
  const api = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(
    /\/$/,
    "",
  )
  const login = await (
    await fetch(`${api}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      }),
    })
  ).json()
  const items = (
    await (
      await fetch(`${api}/api/admin/items`, {
        headers: { Authorization: `Bearer ${login.token}` },
      })
    ).json()
  ).items.filter((i) => {
    if (i.publicVisibility !== true) return false
    const st = String(i.publicStatus || "")
    if (!(st === "available" || st === "being_matched" || st === "claimed")) return false
    const donors = Array.isArray(i.donorOriginalPaths) ? i.donorOriginalPaths.length : 0
    if (donors < 1) return false
    const imgs = Array.isArray(i.images) ? i.images : []
    const hasOriginalReady = imgs.some(
      (img) => img.imageType === "original" && img.bgRemoved === true,
    )
    return !hasOriginalReady
  })

  console.log(JSON.stringify({ orphanCount: items.length, titles: items.map((i) => i.title) }, null, 2))

  let ok = 0
  let fail = 0
  for (const item of items) {
    console.log(`\n→ ${item.id} · ${item.title}`)
    try {
      const started = Date.now()
      const res = await fetch(`${api}/api/donations/polish-item-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${login.token}`,
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
      console.log(`  ok ${secs}s images=${body.imageCount} [${types}]`)
    } catch (err) {
      fail++
      console.error("  ERROR", err?.message || err)
    }
  }
  console.log("\n==== SUMMARY ====", { ok, fail })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
