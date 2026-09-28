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

const IDS = [
  "c0VYy9e1gqs52ECAaWIU",
  "7eX1gi4R7YUMBH53mRv9",
  "hmUGlkZlnWEprIermRNI",
  "yLAZ5ynfjYiic4USZX5k",
  "oQCzBz7XWn0KdK8bZnqe",
]

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
  if (!loginRes.ok || !loginBody.token) throw new Error(JSON.stringify(loginBody))

  const outDir = path.join(__dirname, "_mannequin_check")
  fs.mkdirSync(outDir, { recursive: true })

  const listed = []
  for (const status of ["wall", "claimed", "matched", "completed"]) {
    const res = await fetch(`${apiBase}/api/items?status=${status}&limit=200`, {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    })
    const body = await res.json()
    for (const it of body.items || []) listed.push(it)
  }
  const byId = new Map(listed.map((it) => [it.id, it]))

  for (const id of IDS) {
    const item = byId.get(id)
    if (!item) {
      console.warn(id, "not found in list")
      continue
    }
    const img = (item.images || [])[0]
    const url = img?.storagePath
    console.log(id, item.title, `bgRemoved=${img?.bgRemoved}`, String(url || "").slice(0, 100))
    if (!url) continue
    const ir = await fetch(url)
    if (!ir.ok) {
      console.warn("  download failed", ir.status)
      continue
    }
    const buf = Buffer.from(await ir.arrayBuffer())
    const file = path.join(outDir, `${id}.jpg`)
    fs.writeFileSync(file, buf)
    console.log("  saved", file, buf.length)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
