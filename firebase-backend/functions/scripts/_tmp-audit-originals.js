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
  const api = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(/\/$/, "")
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

  let withOrig = 0
  let missing = 0
  const missingList = []
  for (const i of items) {
    const imgs = Array.isArray(i.images) ? i.images : []
    const hasOrig = imgs.some((img) => img && img.imageType === "original" && img.storagePath)
    if (hasOrig) withOrig++
    else {
      missing++
      missingList.push({
        id: i.id,
        title: i.title,
        donor: i.donorName || i.donorDisplayName || "",
        submissionId: i.submissionId || "",
        types: imgs.map((x) => x.imageType).join(","),
      })
    }
  }
  console.log(JSON.stringify({ wall: items.length, withOrig, missing }, null, 2))
  console.log("\n--- missing sample (40) ---")
  for (const m of missingList.slice(0, 40)) {
    console.log(`${m.id} | ${m.title} | donor=${m.donor} | sub=${m.submissionId}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
