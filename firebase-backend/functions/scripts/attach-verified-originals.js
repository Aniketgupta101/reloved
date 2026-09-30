/**
 * Attach ONLY visually verified matches from _verified-visual-map.js
 *   node scripts/attach-verified-originals.js [--dry-run]
 */
const fs = require("fs")
const path = require("path")
const map = require("./_verified-visual-map")

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

const DIRS = {
  tshirts: "c:\\Users\\PC 3\\Downloads\\main_tshirts_images",
  pants: "c:\\Users\\PC 3\\Downloads\\main_pants_images",
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
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
  if (!login.token) throw new Error("login failed")
  const token = login.token

  // Extra pants verified after map file write
  const extra = [
    { file: "07_scotchsoda_stuart_mustard_chino.jpg", folder: "pants", itemId: "rxn7nIAxe2nkj6X1QL1z", title: "Stuart Mustard" },
    { file: "11_scotchsoda_mott_green_chino.jpg", folder: "pants", itemId: "uKIP6YrOqqgVCUXw7HQS", title: "Mott Green" },
    { file: "04_armani_jeans.jpg", folder: "pants", itemId: "Qe8362YSdagiqOKXzjpM", title: "Armani Jeans" },
    { file: "01_black_dress_pants.jpg", folder: "pants", itemId: "o0AYZDBVu3jmSZsg9pNN", title: "Black Dress Pants" },
  ]
  const jobs = [...map.high, ...extra]
  const seen = new Set()
  const unique = jobs.filter((j) => {
    if (seen.has(j.itemId)) return false
    seen.add(j.itemId)
    return true
  })

  console.log(JSON.stringify({ dryRun, count: unique.length }, null, 2))
  for (const j of unique) console.log(`✓ ${j.file} → ${j.itemId} · ${j.title}`)
  if (dryRun) return

  let ok = 0
  let fail = 0
  for (const j of unique) {
    const filePath = path.join(DIRS[j.folder], j.file)
    if (!fs.existsSync(filePath)) {
      console.error("missing file", filePath)
      fail++
      continue
    }
    const buf = fs.readFileSync(filePath)
    const form = new FormData()
    form.append("photo", new Blob([buf], { type: "image/jpeg" }), j.file)
    console.log(`\n→ ${j.file} → ${j.title}`)
    const started = Date.now()
    const res = await fetch(`${api}/api/admin/items/${j.itemId}/attach-original`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    const body = await res.json().catch(() => ({}))
    const secs = Math.round((Date.now() - started) / 1000)
    if (!res.ok) {
      fail++
      console.error(`  FAIL ${res.status}`, JSON.stringify(body).slice(0, 200))
      continue
    }
    ok++
    console.log(`  ok ${secs}s images=${body.imageCount}`)
  }
  console.log("\n==== SUMMARY ====", { ok, fail })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
