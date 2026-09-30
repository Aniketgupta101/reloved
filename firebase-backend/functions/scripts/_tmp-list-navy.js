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
  const api = (process.env.PUBLIC_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api").replace(/\/$/, "")
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
  const items = (
    await (
      await fetch(`${api}/api/admin/items`, {
        headers: { Authorization: `Bearer ${login.token}` },
      })
    ).json()
  ).items.filter((i) => i.publicVisibility === true)

  const navy = items.filter((i) => /navy|corduroy|dress pant/i.test(i.title))
  for (const i of navy) {
    const types = (i.images || []).map((x) => x.imageType || "?").join(",")
    console.log(`${i.id} | ${i.title} | imgs=${(i.images || []).length} [${types}]`)
  }

  // Probe attach-original
  const probe = await fetch(`${api}/api/admin/items/probe-test/attach-original`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.token}` },
  })
  console.log("\nattach-original probe:", probe.status, await probe.text().then((t) => t.slice(0, 200)))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
