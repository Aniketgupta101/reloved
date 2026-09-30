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
  ).items

  const hits = items.filter((i) =>
    /abercrombie|moose|spurs|distressed jeans|hugo yellow/i.test(i.title || ""),
  )
  for (const i of hits) {
    console.log({
      id: i.id,
      slug: i.slug,
      title: i.title,
      publicStatus: i.publicStatus,
      publicVisibility: i.publicVisibility,
      imgs: (i.images || []).length,
    })
    if (i.slug) {
      const r = await fetch(`${api}/api/items/${encodeURIComponent(i.slug)}`)
      const t = await r.text()
      console.log(`  GET slug => ${r.status} ${t.slice(0, 160)}`)
    }
    // also try by id if someone shares wrong url
    const r2 = await fetch(`${api}/api/items/${encodeURIComponent(i.id)}`)
    console.log(`  GET id => ${r2.status}`)
  }

  const claimed = items.filter((i) => String(i.publicStatus) === "claimed")
  console.log("\nclaimed count", claimed.length)
  const invis = claimed.filter((i) => i.publicVisibility !== true)
  console.log("claimed but not visible", invis.length)
  for (const i of invis.slice(0, 10)) {
    console.log("  invis", i.id, i.slug, i.title)
  }
  // sample a few visible claimed
  for (const i of claimed.filter((c) => c.publicVisibility === true).slice(0, 5)) {
    const r = await fetch(`${api}/api/items/${encodeURIComponent(i.slug || i.id)}`)
    console.log(`sample claimed ${i.slug} => ${r.status} vis=${i.publicVisibility}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
