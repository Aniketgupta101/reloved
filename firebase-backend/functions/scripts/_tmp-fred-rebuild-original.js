const fs = require("fs")
const path = require("path")
const sharp = require("sharp")
const https = require("https")

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

function getFirebaseAccessToken() {
  const p = path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json")
  const j = JSON.parse(fs.readFileSync(p, "utf8"))
  return j.tokens.access_token
}

function firestoreGet(docPath, token) {
  const url = `https://firestore.googleapis.com/v1/projects/reloved-digital/databases/(default)/documents/${docPath}`
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
        let d = ""
        res.on("data", (c) => (d += c))
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(d) })
          } catch (e) {
            reject(e)
          }
        })
      })
      .on("error", reject)
  })
}

function decodeFirestoreValue(v) {
  if (v == null) return null
  if ("stringValue" in v) return v.stringValue
  if ("integerValue" in v) return Number(v.integerValue)
  if ("doubleValue" in v) return v.doubleValue
  if ("booleanValue" in v) return v.booleanValue
  if ("timestampValue" in v) return v.timestampValue
  if ("nullValue" in v) return null
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeFirestoreValue)
  if ("mapValue" in v) {
    const out = {}
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      out[k] = decodeFirestoreValue(val)
    }
    return out
  }
  return v
}

async function pixelStats(url) {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
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

/**
 * Rebuild a visible white-tee original onto soft paper from the best available
 * source (modelled AI has the fabric; ghost cutouts do not).
 */
async function rebuildVisibleTee(sourceUrl) {
  const PLATE = { r: 237, g: 232, b: 223 }
  const buf = Buffer.from(await (await fetch(sourceUrl)).arrayBuffer())
  const meta = await sharp(buf).metadata()
  const maxSide = 1200
  const scale = Math.min(1, maxSide / Math.max(meta.width || 1, meta.height || 1))
  const w = Math.max(1, Math.round((meta.width || 1) * scale))
  const h = Math.max(1, Math.round((meta.height || 1) * scale))

  const { data, info } = await sharp(buf)
    .resize(w, h, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const width = info.width
  const height = info.height
  const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  const isEmpty = (i) =>
    data[i + 3] < 12 ||
    (data[i] >= 252 && data[i + 1] >= 252 && data[i + 2] >= 252) ||
    (lum(i) <= 28 &&
      Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) <= 18)

  // Letterbox trim
  const rowBand = (y) => {
    let band = 0,
      s = 0
    const step = Math.max(1, Math.floor(width / 80))
    for (let x = 0; x < width; x += step) {
      s++
      if (isEmpty((y * width + x) * 4)) band++
    }
    return s > 0 && band / s >= 0.92
  }
  let top = 0,
    bottom = height - 1
  const maxY = Math.floor(height * 0.42)
  while (top < bottom && top < maxY && rowBand(top)) top++
  while (bottom > top && height - 1 - bottom < maxY && rowBand(bottom)) bottom--

  // For light garments keep letterboxed frame (don't crop to logo only).
  let minX = 0,
    minY = top,
    maxX = width - 1,
    maxY2 = bottom
  // Expand garment using non-pure-white that isn't near-black letterbox — soft fabric
  // For white tee detection: if light-dominant, keep full letter frame.
  let light = 0,
    mid = 0,
    total = 0
  for (let y = top; y <= bottom; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4
      total++
      const L = lum(i)
      if (data[i + 3] < 12 || L >= 200) light++
      else if (L >= 80) mid++
    }
  }
  const lightGarment = total > 0 && light / total >= 0.55 && mid / total < 0.22
  if (!lightGarment) {
    minX = width
    minY = height
    maxX = -1
    maxY2 = -1
    for (let y = top; y <= bottom; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        if (isEmpty(i)) continue
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY2) maxY2 = y
      }
    }
    if (maxX < minX) {
      minX = 0
      minY = top
      maxX = width - 1
      maxY2 = bottom
    }
  }

  const pad = Math.round(Math.max(maxX - minX + 1, maxY2 - minY + 1) * 0.04)
  const cx = Math.max(0, minX - pad)
  const cy = Math.max(0, minY - pad)
  const cw = Math.min(width - cx, maxX - minX + 1 + pad * 2)
  const ch = Math.min(height - cy, maxY2 - minY + 1 + pad * 2)

  const SIZE = 1200
  const MARGIN = 0.05
  const box = Math.round(SIZE * (1 - MARGIN * 2))
  const fit = Math.min(box / cw, box / ch)
  const dw = Math.max(1, Math.round(cw * fit))
  const dh = Math.max(1, Math.round(ch * fit))

  const cropped = await sharp(buf)
    .resize(width, height, { fit: "fill" })
    .extract({ left: cx, top: cy, width: cw, height: ch })
    .resize(dw, dh, { fit: "fill" })
    .jpeg({ quality: 92 })
    .toBuffer()
    .catch(async () => {
      // fallback if resize path odd — extract from original scale
      const full = await sharp(buf).rotate().ensureAlpha().png().toBuffer()
      const m = await sharp(full).metadata()
      const sx = m.width / width
      const sy = m.height / height
      return sharp(full)
        .extract({
          left: Math.round(cx * sx),
          top: Math.round(cy * sy),
          width: Math.max(1, Math.round(cw * sx)),
          height: Math.max(1, Math.round(ch * sy)),
        })
        .resize(dw, dh, { fit: "fill" })
        .jpeg({ quality: 92 })
        .toBuffer()
    })

  const out = await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: PLATE },
  })
    .composite([
      {
        input: cropped,
        left: Math.round((SIZE - dw) / 2),
        top: Math.round((SIZE - dh) / 2),
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer()

  return out
}

async function main() {
  const api = (process.env.PUBLIC_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api").replace(
    /\/$/,
    "",
  )
  const token = getFirebaseAccessToken()
  const itemId = "O1nIOVmQzWSipXGZ29Jt"
  const doc = await firestoreGet(`items/${itemId}`, token)
  if (doc.status !== 200) {
    console.error("firestore", doc.status, JSON.stringify(doc.body).slice(0, 300))
    process.exit(1)
  }
  const fields = {}
  for (const [k, v] of Object.entries(doc.body.fields || {})) {
    fields[k] = decodeFirestoreValue(v)
  }
  console.log("donorOriginalPaths", fields.donorOriginalPaths)
  console.log("originalSource", fields.originalSource)
  console.log("images", fields.images)

  const modelled = (fields.images || []).find((i) => i.imageType === "modelled")
  const original = (fields.images || []).find((i) => i.imageType === "original")
  const donorPath =
    (Array.isArray(fields.donorOriginalPaths) && fields.donorOriginalPaths[0]) ||
    null

  // Prefer true donor upload if it still has fabric; else modelled (has the tee).
  let source = modelled?.storagePath
  if (donorPath) {
    const st = await pixelStats(donorPath)
    console.log("donor stats", st)
    if (st.light + st.mid > 5) source = donorPath
  }
  if (original?.storagePath) {
    const st = await pixelStats(original.storagePath)
    console.log("current original stats", st)
  }
  console.log("rebuild source", source)
  console.log("source stats", await pixelStats(source))

  const rebuilt = await rebuildVisibleTee(source)
  const outPath = path.join(__dirname, "_tmp-white-check/fred-original-rebuilt.jpg")
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, rebuilt)
  console.log("wrote", outPath, rebuilt.length)

  // Upload via admin attach-original style: use polish endpoint or patch with uploaded URL.
  // Admin login + multipart isn't available easily; use donations upload if exists,
  // else GCS via signed — simplest: POST polish with force after uploading through
  // a small FormData to an existing upload route.

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

  // Try admin attach-original with the rebuilt buffer as the "original"
  const FormData = require("form-data")
  const form = new FormData()
  form.append("photo", rebuilt, {
    filename: "fred-perry-original.jpg",
    contentType: "image/jpeg",
  })

  const attach = await fetch(`${api}/api/admin/items/${itemId}/attach-original`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${login.token}`,
      ...form.getHeaders(),
    },
    body: form,
  })
  const attachBody = await attach.json()
  console.log("attach-original", attach.status, JSON.stringify(attachBody, null, 2))

  // If attach re-ruined it via polish BG remove, patch images directly with
  // modelled + our rebuilt uploaded URL from attach response, forcing bgRemoved
  // without another wipe.
  if (attach.ok && Array.isArray(attachBody.images)) {
    const rebuiltUrl =
      attachBody.images.find((i) => i.imageType === "original")?.storagePath ||
      null
    // Check if polish ghosted it again
    if (rebuiltUrl) {
      const st = await pixelStats(rebuiltUrl)
      console.log("post-attach original stats", st)
      if (st.white >= 92 && st.light + st.mid < 5) {
        console.log("polish ghosted again — need direct upload without BG remove")
      }
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
