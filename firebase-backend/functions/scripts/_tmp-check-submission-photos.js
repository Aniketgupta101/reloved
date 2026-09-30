/**
 * Recover donor paths from submissions for AI-only Wall items.
 *   node scripts/_tmp-check-submission-photos.js
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

const PAIRS = [
  ["pdGssaEpoGVS3zJ0syMs", "xLRLWjHacjzJ4DpQWapn", "Westcoast"],
  ["FmoZHWmurQcPDouyx653", "rcy2QY2qsWDkedpYdByT", "Spurs"],
  ["CSiMphkkZsvyHH1sLclB", null, "Hulk"],
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

  for (const [itemId, subId, label] of PAIRS) {
    console.log("\n====", label, itemId)
    if (!subId) {
      console.log("no submissionId")
      continue
    }
    const res = await fetch(`${api}/api/admin/donation-submissions/${subId}`, {
      headers: { Authorization: `Bearer ${login.token}` },
    })
    const body = await res.json().catch(() => ({}))
    console.log("status", res.status)
    const sub = body.submission || body.data || body
    console.log({
      keys: Object.keys(sub || {}).slice(0, 40),
      donorOriginalPaths: sub.donorOriginalPaths,
      photoStoragePaths: sub.photoStoragePaths,
      photoBgRemoved: sub.photoBgRemoved,
      photos: Array.isArray(sub.photos) ? sub.photos.slice(0, 5) : undefined,
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
