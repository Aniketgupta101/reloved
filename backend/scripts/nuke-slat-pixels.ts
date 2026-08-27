/**
 * Nuclear cleanup for the 3 stripe-photo tees: any maroon/brown pixel → white.
 * (Those colors are never part of the yellow / black / navy shirts.)
 * Also tightens Converse carpet leftovers.
 */
import { readFile, writeFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import sharp from "sharp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WALL = path.join(__dirname, "../../frontend/public/images/wall-items")
const UPLOADS = path.join(__dirname, "../uploads/items")

function isMaroonBrown(r: number, g: number, b: number) {
  // broad: chair slats, wood, maroon stripe
  if (g > 125 || b > 125) return false
  if (r < 40) return false
  // red-dominant warm darks
  if (r > g + 12 && r > b + 12) return true
  // brown-ish low saturation darks that aren't pure black garment
  if (r > 55 && r < 170 && Math.abs(r - g) < 35 && r > b + 8 && (r + g + b) / 3 < 140) return true
  return false
}

async function wipeMaroon(file: string) {
  const p = path.join(WALL, file)
  const { data, info } = await sharp(await readFile(p))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: c } = info
  let killed = 0
  for (let i = 0; i < data.length; i += c) {
    if (!isMaroonBrown(data[i], data[i + 1], data[i + 2])) continue
    data[i] = data[i + 1] = data[i + 2] = 255
    if (c > 3) data[i + 3] = 255
    killed++
  }
  // 2-pass: dark fringe next to white that looks like leftover wood
  for (let pass = 0; pass < 3; pass++) {
    const copy = Buffer.from(data)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * c
        const r = copy[i], g = copy[i + 1], b = copy[i + 2]
        if (r > 240 && g > 240 && b > 240) continue
        // skip saturated yellow (6403 graphic/shirt)
        if (r > 180 && g > 140 && b < 120) continue
        // skip bright graphic colors on black tee
        if (r > 180 || g > 180 || (b > 180 && r < 100)) continue
        // skip navy bulk (dark blue)
        if (b > r + 15 && b > g + 10 && b < 120 && r < 80) continue
        // skip black garment bulk (very dark, neutral)
        if (r < 45 && g < 45 && b < 45) continue

        let whiteN = 0
        for (const [dx, dy] of [
          [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1],
        ] as const) {
          const j = ((y + dy) * w + (x + dx)) * c
          if (copy[j] > 240 && copy[j + 1] > 240 && copy[j + 2] > 240) whiteN++
        }
        const brownish = r > 50 && r > g && r > b && g < 130
        if (brownish && whiteN >= 3) {
          data[i] = data[i + 1] = data[i + 2] = 255
          if (c > 3) data[i + 3] = 255
          killed++
        }
      }
    }
  }

  const out = await sharp(data, { raw: { width: w, height: h, channels: c } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await writeFile(p, out)
  await writeFile(path.join(UPLOADS, file), out)
  console.log(file, "killed", killed, "→", Math.round(out.length / 1024), "KB")
}

async function tightenConverse() {
  const file = "IMG_6333.png"
  const p = path.join(WALL, file)
  const { data, info } = await sharp(await readFile(p))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: c } = info
  let killed = 0
  for (let pass = 0; pass < 6; pass++) {
    const copy = Buffer.from(data)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * c
        const r = copy[i], g = copy[i + 1], b = copy[i + 2]
        if (r > 240 && g > 240 && b > 240) continue
        const max = Math.max(r, g, b)
        if (max < 100) continue // camo
        if (r > 200 && g > 200 && b > 200) continue // logo
        let whiteN = 0
        for (const [dx, dy] of [
          [-1, 0], [1, 0], [0, -1], [0, 1],
        ] as const) {
          const j = ((y + dy) * w + (x + dx)) * c
          if (copy[j] > 240 && copy[j + 1] > 240 && copy[j + 2] > 240) whiteN++
        }
        const beige = r > 115 && g > 100 && b > 60 && r >= g - 8 && max - Math.min(r, g, b) < 95
        if (beige && whiteN >= 1) {
          data[i] = data[i + 1] = data[i + 2] = 255
          if (c > 3) data[i + 3] = 255
          killed++
        }
      }
    }
  }
  const out = await sharp(data, { raw: { width: w, height: h, channels: c } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await writeFile(p, out)
  await writeFile(path.join(UPLOADS, file), out)
  console.log(file, "tightened", killed, "→", Math.round(out.length / 1024), "KB")
}

await wipeMaroon("IMG_6403.png")
await wipeMaroon("IMG_6404.png")
await wipeMaroon("IMG_6405.png")
await tightenConverse()
console.log("NUKE_DONE")
