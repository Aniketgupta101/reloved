const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

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

async function isGhostCutout(url) {
  const res = await fetch(url)
  if (!res.ok) return false
  const buf = Buffer.from(await res.arrayBuffer())
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  let white = 0
  let dark = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] >= 252 && data[i + 1] >= 252 && data[i + 2] >= 252) white++
    else {
      const L = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      if (L < 80) dark++
    }
  }
  const ghost = white / n >= 0.92 && dark / n <= 0.03
  console.log("  analyze", {
    whitePct: +(white / n * 100).toFixed(1),
    darkPct: +(dark / n * 100).toFixed(1),
    ghost,
  })
  return ghost
}

async function main() {
  const api = (process.env.PUBLIC_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api").replace(
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
  if (!login.token) throw new Error(`login failed: ${JSON.stringify(login)}`)
  const headers = {
    Authorization: `Bearer ${login.token}`,
    "Content-Type": "application/json",
  }

  const list = await (await fetch(`${api}/api/items?limit=150`)).json()
  const targets = (list.items || []).filter((x) =>
    /fred perry laurel wreath/i.test(String(x.title || "")),
  )
  if (!targets.length) throw new Error("Fred Perry Laurel item not found")

  for (const t of targets) {
    console.log("item", t.id, t.title)
    const images = Array.isArray(t.images) ? [...t.images] : []
    const kept = []
    for (const img of images) {
      const type = String(img.imageType || "")
      const url = String(img.storagePath || "")
      if (!url) continue
      console.log(" image", type || "(none)", url.slice(-56))
      if (type === "original" || !type) {
        if (await isGhostCutout(url)) {
          console.log("  -> DROP ghost cutout")
          continue
        }
      }
      kept.push(img)
    }
    if (kept.length === 0) {
      console.log("refusing empty gallery")
      continue
    }
    if (kept.length === images.length) {
      console.log("no change")
      continue
    }
    const patch = await fetch(`${api}/api/admin/items/${t.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ images: kept }),
    })
    const body = await patch.json()
    console.log("patched", patch.status, (body.item?.images || []).length)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
