/**
 * Download AI images for all Wall items that look like batch candidates
 * (polos/shirts/pants brands), for visual rematch.
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

function toPublicUrl(storagePath) {
  const p = String(storagePath || "")
  if (p.startsWith("http")) return p
  const bucket = process.env.FIREBASE_STORAGE_BUCKET || "reloved-digital.firebasestorage.app"
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(p)}?alt=media`
}

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
  ).items.filter((i) => i.publicVisibility === true)

  const re =
    /boss|hugo|canali|brooks|scotch|giordano|armani|paul\s*smith|scalpers|chino|jeans|dress\s*pant|corduroy|polo|shirt/i
  const candidates = items.filter((i) => re.test(String(i.title || "")))

  const outDir = path.join(__dirname, "_wall-ai-candidates")
  fs.mkdirSync(outDir, { recursive: true })
  const rows = []
  for (const item of candidates) {
    const img = (item.images || [])[0]
    if (!img?.storagePath) continue
    const url = toPublicUrl(img.storagePath)
    const safeTitle = String(item.title)
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .slice(0, 60)
    const dest = path.join(outDir, `${item.id}__${safeTitle}.jpg`)
    try {
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
      fs.writeFileSync(dest, buf)
      rows.push({ id: item.id, title: item.title, path: dest, imgCount: (item.images || []).length })
      console.log(`${item.id} · ${item.title}`)
    } catch (e) {
      console.error("fail", item.id, e.message)
    }
  }
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(rows, null, 2))
  console.log("candidates", rows.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
