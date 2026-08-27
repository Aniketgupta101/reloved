/**
 * Fix the 4 Wall images with leftover bg:
 * - IMG_6403/6404/6405: erase thin maroon/brown chair-slat crumbs
 * - IMG_6333: color-key beige carpet → white (rembg fails on camo)
 *
 * npx tsx scripts/fix-four-wall-bgs.ts
 */
import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import sharp from "sharp"
import { removeBackgroundToWhite } from "../server/lib/bgRemoval.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "../..")
const ASSETS = path.join(ROOT, "frontend/assets/.aistudio/Assets")
const WALL = path.join(ROOT, "frontend/public/images/wall-items")
const UPLOADS = path.join(ROOT, "backend/uploads/items")
const SIZE = 1400

async function saveBoth(name: string, buf: Buffer) {
  await mkdir(WALL, { recursive: true })
  await mkdir(UPLOADS, { recursive: true })
  await writeFile(path.join(WALL, name), buf)
  await writeFile(path.join(UPLOADS, name), buf)
  console.log("  saved", name, Math.round(buf.length / 1024), "KB")
}

function isMaroonBrown(r: number, g: number, b: number) {
  // chair / stripe leftovers from the bedsheet photos
  if (r < 45 || r > 210) return false
  if (g > 110 || b > 110) return false
  if (r <= g + 15 || r <= b + 15) return false
  return true
}

function isNearWhite(r: number, g: number, b: number) {
  return r > 242 && g > 242 && b > 242
}

/** Wipe thin vertical maroon connected components + border-touching crumbs. */
async function eraseSlats(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: c } = info
  const n = w * h
  const mask = new Uint8Array(n) // 1 = candidate crumb

  for (let i = 0, p = 0; i < n; i++, p += c) {
    if (isMaroonBrown(data[p], data[p + 1], data[p + 2])) mask[i] = 1
  }

  // Connected components on mask
  const seen = new Uint8Array(n)
  const wipe = new Uint8Array(n)
  const stack: number[] = []

  for (let start = 0; start < n; start++) {
    if (!mask[start] || seen[start]) continue
    stack.length = 0
    stack.push(start)
    seen[start] = 1
    const cells: number[] = []
    let minX = w, maxX = 0, minY = h, maxY = 0
    let touchesBorder = false

    while (stack.length) {
      const idx = stack.pop()!
      cells.push(idx)
      const x = idx % w
      const y = (idx / w) | 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) touchesBorder = true
      for (const [dx, dy] of [
        [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1],
      ] as const) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const ni = ny * w + nx
        if (!mask[ni] || seen[ni]) continue
        seen[ni] = 1
        stack.push(ni)
      }
    }

    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    const thinVertical = bw <= 55 && bh >= bw * 2.2
    const smallSpeck = cells.length < 900
    const tallStick = bh > h * 0.12 && bw <= 70

    if (thinVertical || (smallSpeck && touchesBorder) || tallStick || (touchesBorder && bw < 80)) {
      for (const idx of cells) wipe[idx] = 1
    }
  }

  for (let i = 0, p = 0; i < n; i++, p += c) {
    if (!wipe[i]) continue
    data[p] = data[p + 1] = data[p + 2] = 255
    if (c > 3) data[p + 3] = 255
  }

  // Also: any maroon pixel with ≥5 white neighbors → white (fringe)
  const copy = Buffer.from(data)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * c
      if (!isMaroonBrown(copy[i], copy[i + 1], copy[i + 2])) continue
      let whiteN = 0
      for (const [dx, dy] of [
        [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1],
      ] as const) {
        const j = ((y + dy) * w + (x + dx)) * c
        if (isNearWhite(copy[j], copy[j + 1], copy[j + 2])) whiteN++
      }
      if (whiteN >= 4) {
        data[i] = data[i + 1] = data[i + 2] = 255
        if (c > 3) data[i + 3] = 255
      }
    }
  }

  return sharp(data, { raw: { width: w, height: h, channels: c } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** Beige carpet → white; keep dark camo + white logo. */
async function colorKeyCarpet(jpegPath: string): Promise<Buffer> {
  const prepared = await sharp(await readFile(jpegPath))
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { data, info } = prepared
  const { width: w, height: h, channels: c } = info
  const n = w * h

  for (let i = 0, p = 0; i < n; i++, p += c) {
    const r = data[p], g = data[p + 1], b = data[p + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    // dark camo / black fabric
    if (max < 95) continue
    // bright white logo
    if (r > 200 && g > 200 && b > 200) continue
    // beige / tan carpet (warm, mid-light, low-ish chroma)
    const warmBeige =
      r > 130 && g > 110 && b > 70 &&
      r >= g - 10 && g >= b - 15 &&
      max - min < 90 &&
      (r + g + b) / 3 > 120
    // also light rug highlights
    const lightRug = r > 170 && g > 150 && b > 120 && r >= g && g >= b - 20 && max - min < 70
    if (warmBeige || lightRug) {
      data[p] = data[p + 1] = data[p + 2] = 255
      if (c > 3) data[p + 3] = 255
    }
  }

  // Grow white a couple of pixels into remaining carpet fringe
  for (let pass = 0; pass < 4; pass++) {
    const copy = Buffer.from(data)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * c
        if (isNearWhite(copy[i], copy[i + 1], copy[i + 2])) continue
        const r = copy[i], g = copy[i + 1], b = copy[i + 2]
        if (Math.max(r, g, b) < 100) continue // keep camo
        if (r > 200 && g > 200 && b > 200) continue
        let whiteN = 0
        for (const [dx, dy] of [
          [-1, 0], [1, 0], [0, -1], [0, 1],
        ] as const) {
          const j = ((y + dy) * w + (x + dx)) * c
          if (isNearWhite(copy[j], copy[j + 1], copy[j + 2])) whiteN++
        }
        // only eat warm/light fringe next to white
        const warm = r > 120 && g > 100 && b > 60 && r >= g - 5
        if (warm && whiteN >= 2) {
          data[i] = data[i + 1] = data[i + 2] = 255
          if (c > 3) data[i + 3] = 255
        }
      }
    }
  }

  return sharp(data, { raw: { width: w, height: h, channels: c } })
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function fixSlatShirt(stem: string) {
  console.log(`\n→ ${stem} (slat cleanup)`)
  const src = path.join(ASSETS, `${stem}.jpeg`)
  const prepared = await sharp(await readFile(src))
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer()

  process.env.BG_REMOVAL_DISABLED = "false"
  process.env.BG_REMOVAL_MODEL = "medium"
  let cut = await removeBackgroundToWhite(prepared, "image/jpeg")
  cut = await eraseSlats(cut)
  // second pass after rembg
  cut = await eraseSlats(cut)
  cut = await sharp(cut)
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await saveBoth(`${stem}.png`, cut)
}

async function main() {
  await fixSlatShirt("IMG_6403")
  await fixSlatShirt("IMG_6404")
  await fixSlatShirt("IMG_6405")

  console.log("\n→ IMG_6333 (carpet color-key)")
  const buf = await colorKeyCarpet(path.join(ASSETS, "IMG_6333.jpeg"))
  await saveBoth("IMG_6333.png", buf)

  console.log("\nDone.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
