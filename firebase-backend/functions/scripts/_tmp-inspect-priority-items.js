/**
 * Inspect specific Wall items for donor recovery paths.
 *   node scripts/_tmp-inspect-priority-items.js
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

const IDS = [
  "dLeS4yIgyB80rbN4J548", // Hugo yellow
  "pdGssaEpoGVS3zJ0syMs", // Westcoast
  "FmoZHWmurQcPDouyx653", // Spurs (likely "Superman" from video)
  "CSiMphkkZsvyHH1sLclB", // Marvel Hulk
  "3a6UsBzLcODSLO6f75mx", // Hugo patterned
]

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

  for (const id of IDS) {
    const i = items.find((x) => x.id === id)
    if (!i) {
      console.log("MISSING", id)
      continue
    }
    console.log("\n====", id, i.title)
    console.log({
      status: i.publicStatus,
      submissionId: i.submissionId || null,
      donorOriginalPaths: i.donorOriginalPaths || [],
      images: (i.images || []).map((img) => ({
        type: img.imageType,
        bg: img.bgRemoved,
        path: String(img.storagePath || "").slice(-60),
      })),
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
