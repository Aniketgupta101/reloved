/**
 * Fred Perry: Gemini cream-plate cutout → square frame → upload + patch live.
 * Avoids remove.bg #fff flatten and @imgly Windows crash.
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

const PROMPT = `Create a clean product cutout of the EXACT item in this photo for Reloved.

RULES:
- Keep the clothing EXACTLY as photographed: same off-white fabric, black Fred Perry laurel logo, wrinkles, collar, sleeves. Do NOT redesign or invent volume.
- Remove EVERYTHING behind and around the shirt: tiled floor, marble, grout, shadows of the room — ZERO leftover floor pixels.
- The mask must be clean and complete. No holes in the fabric, no floor between sleeves.
- Place the shirt alone on soft paper cream (#EDE8DF). Never pure white #FFFFFF — the off-white tee must stay visible against the plate.
- Do NOT add a mannequin, props, drop shadows, or text.
- Centre the shirt with modest cream padding.
Return only the edited photo.`

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

function extractImageFromGemini(json) {
  const parts = json?.candidates?.[0]?.content?.parts || []
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data
    if (inline?.data) {
      return {
        buffer: Buffer.from(inline.data, "base64"),
        mimeType: inline.mimeType || inline.mime_type || "image/png",
      }
    }
  }
  return null
}

async function geminiCutout(inputBuf, mimeType) {
  const keys = String(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
    .split(/[,;]+/)
    .map((k) => k.trim())
    .filter(Boolean)
  if (!keys.length) throw new Error("no GEMINI keys")
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.0-flash-preview-image-generation"

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    console.log(`gemini try …${key.slice(-6)} model=${model}`)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: inputBuf.toString("base64") } },
            { text: PROMPT },
          ],
        },
      ],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature: 0.2 },
    }
    const started = Date.now()
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    console.log(`status ${res.status} ${Math.round((Date.now() - started) / 1000)}s len=${text.length}`)
    if (!res.ok) {
      console.warn(text.slice(0, 240))
      continue
    }
    let json
    try {
      json = JSON.parse(text)
    } catch {
      continue
    }
    const img = extractImageFromGemini(json)
    if (img) return img
    console.warn("no image part", JSON.stringify(json).slice(0, 300))
  }
  throw new Error("all Gemini keys failed for cutout")
}

async function frameOnCream(inputBuf) {
  const prepared = await sharp(inputBuf).rotate().flatten({ background: PLATE }).jpeg({ quality: 95 }).toBuffer()
  const { data, info } = await sharp(prepared).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const ch = info.channels
  const isMat = (i) => {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r >= 245 && g >= 245 && b >= 245) return true
    return Math.abs(r - 237) <= 22 && Math.abs(g - 232) <= 22 && Math.abs(b - 223) <= 24
  }

  // Keep full frame for light garments — only strip obvious outer mat bands.
  let top = 0
  let bottom = h - 1
  let left = 0
  let right = w - 1
  const rowBand = (y) => {
    let band = 0
    let n = 0
    const step = Math.max(1, Math.floor(w / 60))
    for (let x = 0; x < w; x += step) {
      n++
      if (isMat((y * w + x) * ch)) band++
    }
    return n > 0 && band / n >= 0.94
  }
  const colBand = (x) => {
    let band = 0
    let n = 0
    const step = Math.max(1, Math.floor(h / 60))
    for (let y = 0; y < h; y += step) {
      n++
      if (isMat((y * w + x) * ch)) band++
    }
    return n > 0 && band / n >= 0.94
  }
  const maxBand = Math.floor(Math.min(w, h) * 0.35)
  while (top < bottom && top < maxBand && rowBand(top)) top++
  while (bottom > top && h - 1 - bottom < maxBand && rowBand(bottom)) bottom--
  while (left < right && left < maxBand && colBand(left)) left++
  while (right > left && w - 1 - right < maxBand && colBand(right)) right--

  const cropW = right - left + 1
  const cropH = bottom - top + 1
  const box = Math.round(SIZE * 0.88)
  const fit = Math.min(box / cropW, box / cropH)
  const dw = Math.max(1, Math.round(cropW * fit))
  const dh = Math.max(1, Math.round(cropH * fit))
  const cropped = await sharp(prepared)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(dw, dh, { fit: "fill" })
    .jpeg({ quality: 92 })
    .toBuffer()

  return sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: PLATE },
  })
    .composite([
      {
        input: cropped,
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
  let creamish = 0
  let mid = 0
  let dark = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (Math.abs(r - 237) <= 18 && Math.abs(g - 232) <= 18 && Math.abs(b - 223) <= 20) creamish++
    else if (L >= 230) nearWhite++
    else if (L >= 80) mid++
    else dark++
  }
  return {
    size: `${info.width}x${info.height}`,
    creamPct: +((creamish / n) * 100).toFixed(1),
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
  console.log("gemini cream cutout…")
  const cut = await geminiCutout(donorBuf, "image/jpeg")
  fs.writeFileSync(path.join(outDir, "fred-gemini-raw.bin"), cut.buffer)
  const framed = await frameOnCream(cut.buffer)
  fs.writeFileSync(path.join(outDir, "fred-gemini-cream.jpg"), framed)
  await sharp(framed)
    .resize(600)
    .jpeg({ quality: 85 })
    .toFile(path.join(outDir, "fred-gemini-cream-preview.jpg"))
  const stats = await pixelPreview(framed)
  console.log("stats", stats)
  // Reject pure ghosts: almost all cream/white with almost no mid/dark (logo).
  if (stats.darkPct < 0.3 && stats.midPct < 2 && stats.nearWhitePct + stats.creamPct > 97) {
    throw new Error("cutout looks like a ghost — aborting patch")
  }

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
