/**
 * Strip unverified second images (wrong product mixes from sibling recovery).
 *   node scripts/strip-unverified-originals.js [--dry-run]
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
  const dryRun = process.argv.includes("--dry-run")
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

  console.log("strip-unverified-originals", { dryRun })
  const res = await fetch(`${apiBase}/api/admin/items/strip-unverified-originals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${loginBody.token}`,
    },
    body: JSON.stringify({ dryRun, limit: 400 }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(res.status, body)
    process.exit(1)
  }
  console.log(
    JSON.stringify(
      {
        scanned: body.scanned,
        kept: body.kept,
        stripped: body.stripped,
      },
      null,
      2,
    ),
  )
  console.log("\nStripped (AI-only now):")
  for (const row of body.strippedAll || body.strippedSample || []) {
    console.log(`- ${row.id} · ${row.title} · removed=${row.removed} (${row.reason})`)
  }
  console.log("\nKept with verified originals:")
  for (const row of body.keptSample || []) {
    console.log(`- ${row.id} · ${row.title} · originals=${row.originals}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
