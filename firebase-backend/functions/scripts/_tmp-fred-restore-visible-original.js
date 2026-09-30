/**
 * Rebuild Fred Perry Laurel original from the REAL donor upload
 * (donorOriginalPaths) — frame onto soft paper WITHOUT BG-removal so white
 * fabric is not eaten. Patch live item gallery: modelled + visible original.
 */
const fs = require("fs")
const path = require("path")
const sharp = require("sharp")
const https = require("https")
const { randomBytes } = require("crypto")

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

const PLATE = { r: 237, g: 232, b: 223 }
const ITEM_ID = "O1nIOVmQzWSipXGZ29Jt"
const DONOR =
  "https://storage.googleapis.com/reloved-digital-uploads/donations/1790775695428-8e6171d65b72.jpg"
const BUCKET = "reloved-digital-uploads"

function getFirebaseAccessToken() {
  const p = path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json")
  const j = JSON.parse(fs.readFileSync(p, "utf8"))
  return j.tokens.access_token
}

async function refreshTokenIfNeeded() {
  const p = path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json")
  const j = JSON.parse(fs.readFileSync(p, "utf8"))
  if (j.tokens?.expires_at && j.tokens.expires_at > Date.now() + 60_000) {
    return j.tokens.access_token
  }
  const body = new URLSearchParams({
    client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
    client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
    grant_type: "refresh_token",
    refresh_token: j.tokens.refresh_token,
  }).toString()
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const t = await res.json()
  if (!t.access_token) throw new Error("token refresh failed " + JSON.stringify(t))
  j.tokens.access_token = t.access_token
  j.tokens.expires_at = Date.now() + (t.expires_in || 3600) * 1000
  fs.writeFileSync(p, JSON.stringify(j, null, 2))
  return t.access_token
}

/** Frame donor photo onto soft paper square — no BG wipe (keeps white tee). */
async function frameDonorAsStudio(buf) {
  const SIZE = 1200
  const prepared = await sharp(buf).rotate().jpeg({ quality: 95 }).toBuffer()
  const meta = await sharp(prepared).metadata()
  const w = meta.width || 1
  const h = meta.height || 1

  // Fit garment into ~90% of square (contain), soft paper plate.
  const box = Math.round(SIZE * 0.9)
  const fit = Math.min(box / w, box / h)
  const dw = Math.max(1, Math.round(w * fit))
  const dh = Math.max(1, Math.round(h * fit))
  const resized = await sharp(prepared).resize(dw, dh, { fit: "fill" }).jpeg({ quality: 92 }).toBuffer()

  return sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: PLATE },
  })
    .composite([
      {
        input: resized,
        left: Math.round((SIZE - dw) / 2),
        top: Math.round((SIZE - dh) / 2),
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function uploadToGcs(buffer, objectPath, contentType, token) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body: buffer,
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`GCS upload failed ${res.status} ${JSON.stringify(body).slice(0, 400)}`)
  // Make public via IAM-style URL (bucket may have uniform access / public read)
  return `https://storage.googleapis.com/${BUCKET}/${objectPath}`
}

async function pixelStats(bufOrUrl) {
  const buf =
    Buffer.isBuffer(bufOrUrl)
      ? bufOrUrl
      : Buffer.from(await (await fetch(bufOrUrl)).arrayBuffer())
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  let white = 0,
    light = 0,
    mid = 0,
    dark = 0
  for (let i = 0; i < data.length; i += 4) {
    const L = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    if (data[i] >= 252 && data[i + 1] >= 252 && data[i + 2] >= 252) white++
    else if (L >= 200) light++
    else if (L >= 80) mid++
    else dark++
  }
  return {
    size: `${info.width}x${info.height}`,
    white: +(white / n * 100).toFixed(1),
    light: +(light / n * 100).toFixed(1),
    mid: +(mid / n * 100).toFixed(1),
    dark: +(dark / n * 100).toFixed(1),
  }
}

async function main() {
  const api = (process.env.PUBLIC_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api").replace(
    /\/$/,
    "",
  )
  const gcsToken = await refreshTokenIfNeeded()

  const donorBuf = Buffer.from(await (await fetch(DONOR)).arrayBuffer())
  console.log("donor", await pixelStats(donorBuf))

  const framed = await frameDonorAsStudio(donorBuf)
  const outFile = path.join(__dirname, "_tmp-white-check/fred-original-visible.jpg")
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, framed)
  console.log("framed", await pixelStats(framed), "bytes", framed.length)

  const objectPath = `donations/${Date.now()}-${randomBytes(6).toString("hex")}.jpg`
  const url = await uploadToGcs(framed, objectPath, "image/jpeg", gcsToken)
  console.log("uploaded", url)

  // Verify public read
  const head = await fetch(url, { method: "HEAD" })
  console.log("public HEAD", head.status, head.headers.get("content-type"))

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
  if (!login.token) throw new Error("admin login failed")

  const cur = await (await fetch(`${api}/api/items/fred-perry-laurel-wreath-t-shirt-muo5ptjx`)).json()
  const modelled = (cur.item?.images || []).find((i) => i.imageType === "modelled")
  if (!modelled?.storagePath) throw new Error("no modelled image")

  const images = [
    {
      storagePath: modelled.storagePath,
      imageType: "modelled",
      sortOrder: 0,
      bgRemoved: true,
    },
    {
      storagePath: url,
      imageType: "original",
      sortOrder: 1,
      bgRemoved: false,
      originalStoragePath: DONOR,
    },
  ]

  const patch = await fetch(`${api}/api/admin/items/${ITEM_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${login.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ images }),
  })
  const body = await patch.json()
  console.log("patch", patch.status)
  console.log(
    "gallery",
    (body.item?.images || []).map((i) => ({
      type: i.imageType,
      path: String(i.storagePath || "").slice(-48),
    })),
  )
  if (body.item?.images?.[1]?.storagePath) {
    console.log("new original stats", await pixelStats(body.item.images[1].storagePath))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
