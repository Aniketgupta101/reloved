/**
 * Fred Perry: restore intact original (full donor shirt on soft plate).
 * Aggressive local cutouts chewed the fabric — visibility first.
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

async function frameFullDonor(inputBuf) {
  const prepared = await sharp(inputBuf).rotate().jpeg({ quality: 95 }).toBuffer()
  const meta = await sharp(prepared).metadata()
  const w = meta.width || 1
  const h = meta.height || 1
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

async function main() {
  const api = (process.env.PUBLIC_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api").replace(
    /\/$/,
    "",
  )
  const outDir = path.join(__dirname, "_tmp-white-check")
  fs.mkdirSync(outDir, { recursive: true })

  const donorBuf = Buffer.from(await (await fetch(DONOR)).arrayBuffer())
  const framed = await frameFullDonor(donorBuf)
  fs.writeFileSync(path.join(outDir, "fred-intact-framed.jpg"), framed)
  await sharp(framed).resize(600).jpeg({ quality: 85 }).toFile(path.join(outDir, "fred-intact-preview.jpg"))

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
          bgRemoved: false,
          originalStoragePath: DONOR,
        },
      ],
    }),
  })
  console.log("patch", patch.status)
  const body = await patch.json()
  console.log(
    "gallery",
    (body.item?.images || []).map((i) => ({
      type: i.imageType,
      path: String(i.storagePath || "").slice(-52),
    })),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
