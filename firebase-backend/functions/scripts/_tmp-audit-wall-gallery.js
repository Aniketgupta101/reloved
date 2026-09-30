/**
 * Audit Wall galleries: expect [0]=modelled, [1+]=original with bgRemoved.
 *   node scripts/_tmp-audit-wall-gallery.js
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

  const issues = []
  let okShape = 0
  for (const i of items) {
    const imgs = Array.isArray(i.images) ? i.images : []
    const types = imgs.map((img) => `${img.imageType || "?"}:${img.bgRemoved === true}`)
    const first = imgs[0]
    const rest = imgs.slice(1)
    const firstAi = first && (first.imageType === "modelled" || first.bgRemoved === true)
    const originalsOk =
      rest.length > 0 &&
      rest.every((img) => img.imageType === "original" && img.bgRemoved === true)
    const hasDonorPaths = Array.isArray(i.donorOriginalPaths) && i.donorOriginalPaths.length > 0
    const problem =
      !firstAi ||
      rest.length === 0 ||
      !originalsOk ||
      imgs.filter((img) => img.imageType === "modelled").length !== 1

    if (!problem) okShape++
    else {
      issues.push({
        id: i.id,
        title: i.title,
        types,
        hasDonorPaths,
        donorPathCount: hasDonorPaths ? i.donorOriginalPaths.length : 0,
      })
    }
  }

  const focus = items.filter((i) =>
    /superman|westcoast|west coast|hugo yellow|spider/i.test(String(i.title || "")),
  )
  console.log(JSON.stringify({ wall: items.length, okShape, issues: issues.length }, null, 2))
  console.log("\n--- focus items ---")
  for (const i of focus) {
    const imgs = i.images || []
    console.log(
      `${i.id} · ${i.title} · [${imgs.map((img) => `${img.imageType}:${img.bgRemoved}`).join(", ")}] donors=${(i.donorOriginalPaths || []).length}`,
    )
  }
  console.log("\n--- first 40 issues ---")
  for (const row of issues.slice(0, 40)) {
    console.log(`- ${row.id} · ${row.title} · [${row.types.join(", ")}] donors=${row.donorPathCount}`)
  }
  fs.writeFileSync(
    path.join(__dirname, "_wall-gallery-audit.json"),
    JSON.stringify({ wall: items.length, okShape, issues }, null, 2),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
