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
  const { removeBackground } = await import("@imgly/background-removal-node")
  const apiBase = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(
    /\/$/,
    "",
  )
  const login = await (
    await fetch(`${apiBase}/api/auth/login`, {
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
      await fetch(`${apiBase}/api/admin/items`, {
        headers: { Authorization: `Bearer ${login.token}` },
      })
    ).json()
  ).items
  const item = items.find((i) => i.id === "1WxRhkw7r89jYaOHUPl7")
  const dirty = (item.images || []).find(
    (img) => img.imageType === "original" && img.bgRemoved !== true,
  )
  const buf = Buffer.from(await (await fetch(dirty.storagePath)).arrayBuffer())
  console.log("in", buf.length)
  const started = Date.now()
  const out = await removeBackground(new Blob([buf], { type: "image/jpeg" }), {
    output: { format: "image/png" },
  })
  const ab = Buffer.from(await out.arrayBuffer())
  fs.writeFileSync(path.join(__dirname, "_test-local-flat.png"), ab)
  console.log("out", ab.length, "ms", Date.now() - started)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
