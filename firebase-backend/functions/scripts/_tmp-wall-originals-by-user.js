/**
 * One-off: list Wall droppers + which items have / lack original images.
 * Usage: node scripts/_tmp-wall-originals-by-user.js
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

function donorName(i) {
  return (
    String(
      i.donorRecognition ||
        i.donorFirstName ||
        i.donorName ||
        i.giverName ||
        i.donorEmail ||
        i.donorPhone ||
        "Unknown",
    ).trim() || "Unknown"
  )
}

function hasOriginal(i) {
  const imgs = Array.isArray(i.images) ? i.images : []
  const hasTyped = imgs.some((img) => img && img.imageType === "original" && img.storagePath)
  const hasDonorPaths =
    Array.isArray(i.donorOriginalPaths) &&
    i.donorOriginalPaths.some((p) => String(p || "").trim())
  const hasNonBg = imgs.some(
    (img) =>
      img &&
      img.bgRemoved !== true &&
      img.storagePath &&
      img.imageType !== "modelled",
  )
  return Boolean(hasTyped || hasDonorPaths || hasNonBg)
}

function isWallDrop(i) {
  if (i.publicVisibility === true) return true
  const st = String(i.publicStatus || "")
  return ["available", "being_matched", "claimed", "matched"].includes(st)
}

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
  if (!loginRes.ok || !loginBody.token) {
    throw new Error(`login failed: ${JSON.stringify(loginBody)}`)
  }
  const token = loginBody.token

  const adminRes = await fetch(`${apiBase}/api/admin/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const adminBody = await adminRes.json()
  const items = adminBody.items || []
  const wall = items.filter(isWallDrop)

  const byUser = new Map()
  for (const i of wall) {
    const name = donorName(i)
    if (!byUser.has(name)) {
      byUser.set(name, {
        withOriginal: [],
        withoutOriginal: [],
        phone: null,
        email: null,
      })
    }
    const row = byUser.get(name)
    if (!row.phone && (i.donorPhone || i.phone)) row.phone = i.donorPhone || i.phone
    if (!row.email && i.donorEmail) row.email = i.donorEmail
    const entry = {
      id: i.id,
      title: i.title || "(no title)",
      status: i.publicStatus || i.status || "",
      createdAt: i.createdAt || null,
    }
    if (hasOriginal(i)) row.withOriginal.push(entry)
    else row.withoutOriginal.push(entry)
  }

  const users = [...byUser.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  // Global image-shape sanity check
  let typedOrig = 0
  let donorPaths = 0
  let nonBg = 0
  const samples = []
  for (const i of wall) {
    const imgs = Array.isArray(i.images) ? i.images : []
    if (imgs.some((img) => img && img.imageType === "original" && img.storagePath)) typedOrig++
    if (
      Array.isArray(i.donorOriginalPaths) &&
      i.donorOriginalPaths.some((p) => String(p || "").trim())
    ) {
      donorPaths++
    }
    if (
      imgs.some(
        (img) =>
          img &&
          img.bgRemoved !== true &&
          img.storagePath &&
          img.imageType !== "modelled",
      )
    ) {
      nonBg++
    }
    if (samples.length < 6) {
      samples.push({
        id: i.id,
        title: i.title,
        donor: donorName(i),
        donorOriginalPaths: i.donorOriginalPaths || null,
        imgs: imgs.map((img) => ({
          type: img.imageType,
          bg: img.bgRemoved,
          pathTail: String(img.storagePath || "").slice(-50),
        })),
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        totalAdminItems: items.length,
        wallItems: wall.length,
        uniqueDroppers: users.length,
        sanity: { typedOrig, donorPaths, nonBg, samples },
        users: users.map(([name, data]) => ({
          name,
          phone: data.phone,
          email: data.email,
          totalItems: data.withOriginal.length + data.withoutOriginal.length,
          withOriginalCount: data.withOriginal.length,
          withoutOriginalCount: data.withoutOriginal.length,
          withOriginal: data.withOriginal.map(
            (e) => `${e.title} [${e.id}] (${e.status})`,
          ),
          withoutOriginal: data.withoutOriginal.map(
            (e) => `${e.title} [${e.id}] (${e.status})`,
          ),
        })),
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
