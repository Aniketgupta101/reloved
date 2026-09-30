/**
 * Fred Perry: @imgly PNG alpha cutout → soft cream plate → upload + patch live.
 * Keeps white fabric visible (never flatten to #fff).
 */
const fs = require("fs")
const path = require("path")
const sharp = require("sharp")
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
const SIZE = 1200

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
  if (!t.access_token) throw new Error("token refresh failed")
  j.tokens.access_token = t.access_token
  j.tokens.expires_at = Date.now() + (t.expires_in || 3600) * 1000
  fs.writeFileSync(p, JSON.stringify(j, null, 2))
  return t.access_token
}

async function cutoutOnCream(inputBuf) {
  const { removeBackground } = require("@imgly/background-removal-node")
  const blob = new Blob([inputBuf], { type: "image/jpeg" })
  const out = await removeBackground(blob, {
    model: "medium",
    output: { format: "image/png", quality: 1 },
  })
  const png = Buffer.from(await out.arrayBuffer())

  const preparedAlpha = await sharp(png).rotate().ensureAlpha().png().toBuffer()
  const meta = await sharp(preparedAlpha).metadata()
  const w = meta.width || 1
  const h = meta.height || 1

  // Opaque bounds (ignore transparent) so we frame the shirt tightly.
  const { data, info } = await sharp(preparedAlpha).raw().toBuffer({ resolveWithObject: true })
  const ch = info.channels
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch
      if (data[i + 3] < 16) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX) throw new Error("cutout produced no opaque pixels")

  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04)
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(w - 1, maxX + pad)
  maxY = Math.min(h - 1, maxY + pad)
  const cropW = maxX - minX + 1
  const cropH = maxY - minY + 1

  const flattened = await sharp(preparedAlpha)
    .flatten({ background: PLATE })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .jpeg({ quality: 95 })
    .toBuffer()

  const box = Math.round(SIZE * 0.88)
  const fit = Math.min(box / cropW, box / cropH)
  const dw = Math.max(1, Math.round(cropW * fit))
  const dh = Math.max(1, Math.round(cropH * fit))
  const resized = await sharp(flattened).resize(dw, dh, { fit: "fill" }).jpeg({ quality: 92 }).toBuffer()

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
    .jpeg({ quality: 92 })
    .toBuffer()
}

async function uploadToGcs(buffer, objectPath, contentType, token) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: buffer,
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`GCS ${res.status} ${JSON.stringify(body).slice(0, 300)}`)
  return `https://storage.googleapis.com/${BUCKET}/${objectPath}`
}

async function pixelPreview(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  let nearWhite = 0
  let mid = 0
  let dark = 0
  for (let i = 0; i < data.length; i += 4) {
    const L = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    if (L >= 230) nearWhite++
    else if (L >= 80) mid++
    else dark++
  }
  return {
    size: `${info.width}x${info.height}`,
    nearWhitePct: +((nearWhite / n) * 100).toFixed(1),
    midPct: +((mid / n) * 100).toFixed(1),
    darkPct: +((dark / n) * 100).toFixed(1),
  }
}

async function main() {
  const api = (
    process.env.PUBLIC_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
  ).replace(/\/$/, "")
  const outDir = path.join(__dirname, "_tmp-white-check")
  fs.mkdirSync(outDir, { recursive: true })

  console.log("downloading donor…")
  const donorBuf = Buffer.from(await (await fetch(DONOR)).arrayBuffer())
  console.log("cutting out (imgly medium)…")
  const framed = await cutoutOnCream(donorBuf)
  fs.writeFileSync(path.join(outDir, "fred-png-cream.jpg"), framed)
  await sharp(framed).resize(600).jpeg({ quality: 85 }).toFile(path.join(outDir, "fred-png-cream-preview.jpg"))
  console.log("stats", await pixelPreview(framed))

  const gcsToken = await refreshTokenIfNeeded()
  const objectPath = `donations/${Date.now()}-${randomBytes(6).toString("hex")}.jpg`
  const url = await uploadToGcs(framed, objectPath, "image/jpeg", gcsToken)
  console.log("uploaded", url)

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

  const cur = await (await fetch(`${api}/api/items/fred-perry-laurel-wreath-t-shirt-muo5ptjx`)).json()
  const modelled = (cur.item?.images || []).find((i) => i.imageType === "modelled")
  if (!modelled?.storagePath) throw new Error("no modelled")

  const patch = await fetch(`${api}/api/admin/items/${ITEM_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${login.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      images: [
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
          bgRemoved: true,
          originalStoragePath: DONOR,
        },
      ],
      donorOriginalPaths: [DONOR],
    }),
  })
  console.log("patch", patch.status)
  const body = await patch.json()
  console.log(
    "gallery",
    (body.item?.images || []).map((i) => ({
      type: i.imageType,
      bg: i.bgRemoved,
      path: String(i.storagePath || "").slice(-52),
    })),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
