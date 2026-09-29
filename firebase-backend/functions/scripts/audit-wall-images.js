/**
 * Audit Wall items for image shape + search titles (e.g. "Here").
 * Usage: node scripts/audit-wall-images.js
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
  const token = loginBody.token

  const adminRes = await fetch(`${apiBase}/api/admin/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const adminBody = await adminRes.json()
  const items = adminBody.items || []
  console.log("admin items", items.length)

  const needle = (process.argv[2] || "here").toLowerCase()
  const matches = items.filter((i) => {
    const hay = `${i.title || ""} ${i.slug || ""} ${i.donorRecognition || ""}`.toLowerCase()
    return hay.includes(needle)
  })
  console.log(`\nMatches for "${needle}":`, matches.length)
  for (const i of matches) {
    console.log(
      JSON.stringify(
        {
          id: i.id,
          title: i.title,
          publicStatus: i.publicStatus,
          publicVisibility: i.publicVisibility,
          images: (i.images || []).map((img) => ({
            imageType: img.imageType,
            bgRemoved: img.bgRemoved,
            path: img.storagePath,
          })),
        },
        null,
        2,
      ),
    )
  }

  const available = items.filter(
    (i) => i.publicVisibility === true && String(i.publicStatus || "") === "available",
  )
  console.log("\navailable on wall", available.length)

  let missingTypedOriginal = 0
  let hasRawPlusModelled = 0
  let onlyModelledOrProduct = 0
  const missingList = []
  for (const i of available) {
    const imgs = Array.isArray(i.images) ? i.images : []
    const hasOriginalType = imgs.some((img) => img.imageType === "original")
    const hasNonBg = imgs.some((img) => img.bgRemoved !== true && img.storagePath)
    const hasModelled = imgs.some(
      (img) => img.imageType === "modelled" || (img.bgRemoved === true && img.storagePath),
    )
    if (hasOriginalType || hasNonBg) hasRawPlusModelled++
    else {
      onlyModelledOrProduct++
      missingTypedOriginal++
      missingList.push({ id: i.id, title: i.title, imageCount: imgs.length })
    }
    void hasModelled
  }
  console.log({ hasRawOrTypedOriginal: hasRawPlusModelled, likelyMissingOriginal: missingTypedOriginal })
  console.log("\nLikely missing true original (only polished/product paths):")
  for (const row of missingList) console.log(`- ${row.id} · ${row.title} · imgs=${row.imageCount}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
