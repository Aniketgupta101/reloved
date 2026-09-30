/**
 * Find Wall items by title keywords.
 *   node scripts/_tmp-find-named-wall.js
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
    return st === "available" || st === "being_matched" || st === "claimed"
  })

  const keys = [
    "superman",
    "west coast",
    "westcoast",
    "hugo",
    "marvel",
    "hulk",
    "batman",
    "spider",
    "graphic",
    "checkered",
    "yellow",
  ]
  for (const k of keys) {
    const hits = items.filter((i) => String(i.title || "").toLowerCase().includes(k))
    console.log("---", k, hits.length)
    for (const h of hits.slice(0, 12)) {
      const imgs = (h.images || []).map((img) => `${img.imageType}:${img.bgRemoved}`)
      console.log(
        h.id,
        String(h.title || "").slice(0, 55),
        imgs.join(", "),
        "donors",
        (h.donorOriginalPaths || []).length,
      )
    }
  }
  console.log("wall total", items.length)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
