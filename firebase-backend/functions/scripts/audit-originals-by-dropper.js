/**
 * Audit Wall items: AI-only vs has original, by dropper.
 *   node scripts/audit-originals-by-dropper.js
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

  const adminRes = await fetch(`${apiBase}/api/admin/items`, {
    headers: { Authorization: `Bearer ${loginBody.token}` },
  })
  const adminBody = await adminRes.json()
  const items = (adminBody.items || []).filter((i) => {
    if (i.publicVisibility !== true) return false
    const st = String(i.publicStatus || "")
    return ["available", "being_matched", "claimed", "reloved"].includes(st)
  })

  let withOrig = 0
  let without = 0
  const byDropper = new Map()

  for (const item of items) {
    const imgs = Array.isArray(item.images) ? item.images : []
    const hasOriginal = imgs.some(
      (img) => img && img.imageType === "original" && img.storagePath,
    )
    if (hasOriginal) withOrig++
    else without++

    const dropper = String(item.donorRecognition || "Unknown").trim() || "Unknown"
    if (!byDropper.has(dropper)) {
      byDropper.set(dropper, { items: 0, with: 0, without: 0, titles: [] })
    }
    const row = byDropper.get(dropper)
    row.items++
    if (hasOriginal) row.with++
    else {
      row.without++
      row.titles.push(item.title || item.id)
    }
  }

  const droppers = [...byDropper.entries()].sort((a, b) => b[1].items - a[1].items)
  console.log(
    JSON.stringify(
      {
        wallItems: items.length,
        droppers: droppers.length,
        withOriginal: withOrig,
        withoutOriginal: without,
      },
      null,
      2,
    ),
  )
  console.log("\n| Dropper | Items | With original | Without |")
  console.log("|---|---:|---:|---:|")
  for (const [name, row] of droppers) {
    console.log(`| ${name} | ${row.items} | ${row.with} | ${row.without} |`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
