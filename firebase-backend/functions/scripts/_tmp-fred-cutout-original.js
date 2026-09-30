/**
 * Fred Perry original: gentle border-only floor wipe (depth-limited) so shirt
 * fabric/sleeves stay intact — then soft-paper frame, upload, patch live.
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

function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function dist(r, g, b, fr, fg, fb) {
  return Math.max(Math.abs(r - fr), Math.abs(g - fg), Math.abs(b - fb))
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
  if (!t.access_token) throw new Error("token refresh failed")
  j.tokens.access_token = t.access_token
  j.tokens.expires_at = Date.now() + (t.expires_in || 3600) * 1000
  fs.writeFileSync(p, JSON.stringify(j, null, 2))
  return t.access_token
}

async function pixelStats(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  let light = 0,
    mid = 0,
    dark = 0,
    opaque = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 12) continue
    opaque++
    const L = lum(data[i], data[i + 1], data[i + 2])
    if (L >= 200) light++
    else if (L >= 80) mid++
    else dark++
  }
  return {
    size: `${info.width}x${info.height}`,
    opaquePct: +((opaque / n) * 100).toFixed(1),
    lightOfOpaque: opaque ? +((light / opaque) * 100).toFixed(1) : 0,
    midOfOpaque: opaque ? +((mid / opaque) * 100).toFixed(1) : 0,
    darkOfOpaque: opaque ? +((dark / opaque) * 100).toFixed(1) : 0,
  }
}

/**
 * Only wipe floor near the frame edge. Never flood deep into the garment.
 * Depth cap ~12% of min side — removes outer tiles, keeps full shirt body.
 */
async function gentleBorderCutout(inputBuf) {
  const { data, info } = await sharp(inputBuf)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const n = w * h
  const maxDepth = Math.floor(Math.min(w, h) * 0.12)

  let fr = 0,
    fg = 0,
    fb = 0,
    c = 0
  for (const [x, y] of [
    [6, 6],
    [w - 7, 6],
    [6, h - 7],
    [w - 7, h - 7],
    [Math.floor(w / 2), 6],
    [Math.floor(w / 2), h - 7],
  ]) {
    const i = (y * w + x) * 4
    fr += data[i]
    fg += data[i + 1]
    fb += data[i + 2]
    c++
  }
  fr = Math.round(fr / c)
  fg = Math.round(fg / c)
  fb = Math.round(fb / c)

  const isFloor = (r, g, b) => {
    const L = lum(r, g, b)
    // Never wipe bright cream fabric or dark logo
    if (L >= 195) return false
    if (L <= 90) return false
    return dist(r, g, b, fr, fg, fb) <= 30 && L <= 180
  }

  const bg = new Uint8Array(n)
  const depth = new Int16Array(n)
  depth.fill(-1)
  const qx = new Int32Array(n)
  const qy = new Int32Array(n)
  let qh = 0,
    qt = 0

  const tryPush = (x, y, d) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    if (d > maxDepth) return
    const idx = y * w + x
    if (bg[idx]) return
    const i = idx * 4
    if (!isFloor(data[i], data[i + 1], data[i + 2])) return
    bg[idx] = 1
    depth[idx] = d
    qx[qt] = x
    qy[qt] = y
    qt++
  }

  for (let x = 0; x < w; x++) {
    tryPush(x, 0, 0)
    tryPush(x, h - 1, 0)
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y, 0)
    tryPush(w - 1, y, 0)
  }

  while (qh < qt) {
    const x = qx[qh]
    const y = qy[qh]
    const d = depth[y * w + x]
    qh++
    tryPush(x - 1, y, d + 1)
    tryPush(x + 1, y, d + 1)
    tryPush(x, y - 1, d + 1)
    tryPush(x, y + 1, d + 1)
  }

  const out = Buffer.alloc(n * 4)
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1,
    kept = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const i = idx * 4
      out[i] = data[i]
      out[i + 1] = data[i + 1]
      out[i + 2] = data[i + 2]
      if (bg[idx]) {
        out[i + 3] = 0
      } else {
        out[i + 3] = 255
        kept++
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  console.log("kept", +((kept / n) * 100).toFixed(1), "floorAvg", fr, fg, fb, { minX, minY, maxX, maxY })

  const png = await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
  return { png, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } }
}

async function frameOnPlate(pngBuf, bounds) {
  const pad = Math.round(Math.max(bounds.w, bounds.h) * 0.04)
  const meta = await sharp(pngBuf).metadata()
  const cx = Math.max(0, bounds.x - pad)
  const cy = Math.max(0, bounds.y - pad)
  const cw = Math.min((meta.width || 1) - cx, bounds.w + pad * 2)
  const ch = Math.min((meta.height || 1) - cy, bounds.h + pad * 2)
  const cropped = await sharp(pngBuf).extract({ left: cx, top: cy, width: cw, height: ch }).png().toBuffer()
  const box = Math.round(SIZE * 0.9)
  const fit = Math.min(box / cw, box / ch)
  const dw = Math.max(1, Math.round(cw * fit))
  const dh = Math.max(1, Math.round(ch * fit))
  const resized = await sharp(cropped).resize(dw, dh, { fit: "fill" }).png().toBuffer()
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

/** Safest fallback: full donor photo on soft plate — shirt 100% intact. */
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

async function tryImglyCutout(inputBuf) {
  try {
    const { removeBackground } = require("@imgly/background-removal-node")
    console.log("trying @imgly small model…")
    const blob = new Blob([inputBuf], { type: "image/jpeg" })
    const out = await removeBackground(blob, {
      model: "small",
      output: { format: "image/png", quality: 1 },
    })
    const png = Buffer.from(await out.arrayBuffer())
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const w = info.width
    const h = info.height
    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1,
      kept = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (data[i + 3] < 20) continue
        kept++
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
    const keptPct = (kept / (w * h)) * 100
    console.log("imgly kept%", keptPct.toFixed(1), { minX, minY, maxX, maxY })
    // White tee should keep a solid body (~25–70% of frame). Logo-only ghosts are <10%.
    if (keptPct < 12 || keptPct > 85) throw new Error("imgly mask looks wrong")
    return {
      png,
      bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    }
  } catch (e) {
    console.warn("imgly failed:", e.message || e)
    return null
  }
}

async function main() {
  const api = (process.env.PUBLIC_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api").replace(
    /\/$/,
    "",
  )
  const outDir = path.join(__dirname, "_tmp-white-check")
  fs.mkdirSync(outDir, { recursive: true })

  const donorBuf = Buffer.from(await (await fetch(DONOR)).arrayBuffer())

  let framed
  let mode = "full-intact-shirt"

  const imgly = await tryImglyCutout(donorBuf)
  if (imgly) {
    framed = await frameOnPlate(imgly.png, imgly.bounds)
    const st = await pixelStats(framed)
    console.log("imgly framed", st)
    // Must keep fabric (not logo-only). Opaque mid+light should be substantial.
    if (st.lightOfOpaque + st.midOfOpaque >= 60 && st.darkOfOpaque < 40) {
      mode = "imgly-cutout"
      fs.writeFileSync(path.join(outDir, "fred-imgly-framed.jpg"), framed)
    } else {
      console.warn("imgly result rejected — fabric check failed")
      framed = null
    }
  }

  if (!framed) {
    // Intact shirt wins over a chewed-up cutout. Soft plate + full donor photo.
    framed = await frameFullDonor(donorBuf)
    mode = "full-intact-shirt"
  }

  console.log("shipping mode", mode, await pixelStats(framed))
  await sharp(framed).resize(600).jpeg({ quality: 85 }).toFile(path.join(outDir, "fred-fix-preview.jpg"))

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
          bgRemoved: mode === "imgly-cutout",
          originalStoragePath: DONOR,
        },
      ],
    }),
  })
  const body = await patch.json()
  console.log("patch", patch.status)
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
