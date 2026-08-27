/**
 * Post-fix wall cutouts:
 * - IMG_6333 (camo): rembg keeps logo only → pad full JPEG on white
 * - Others: erase thin maroon/dark crumbs left by rembg near white
 */
import { readFile, writeFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import sharp from "sharp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "../..")
const ASSETS = path.join(ROOT, "frontend/assets/.aistudio/Assets")
const WALL = path.join(ROOT, "frontend/public/images/wall-items")
const UPLOADS = path.join(ROOT, "backend/uploads/items")
const SIZE = 1400

async function pad6333() {
  const src = path.join(ASSETS, "IMG_6333.jpeg")
  const buf = await sharp(await readFile(src))
    .rotate()
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await writeFile(path.join(WALL, "IMG_6333.png"), buf)
  await writeFile(path.join(UPLOADS, "IMG_6333.png"), buf)
  console.log("6333 padded", Math.round(buf.length / 1024), "KB")
}

async function cleanCrumbs(file: string) {
  const p = path.join(WALL, file)
  const { data, info } = await sharp(await readFile(p))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: c } = info

  for (let pass = 0; pass < 3; pass++) {
    const copy = Buffer.from(data)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * c
        const r = copy[i], g = copy[i + 1], b = copy[i + 2]
        if (r > 245 && g > 245 && b > 245) continue
        const maroon = r > 70 && r < 200 && g < 90 && b < 90 && r > g + 25
        const darkSpeck = r < 100 && g < 100 && b < 100
        if (!maroon && !darkSpeck) continue
        let whiteN = 0
        for (const [dx, dy] of [
          [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1],
        ] as const) {
          const j = ((y + dy) * w + (x + dx)) * c
          if (copy[j] > 245 && copy[j + 1] > 245 && copy[j + 2] > 245) whiteN++
        }
        // For maroon stripes require fewer white neighbors; for black shirt
        // body require almost all white neighbors so we don't eat the garment
        const need = maroon ? 4 : 7
        if (whiteN >= need) {
          data[i] = data[i + 1] = data[i + 2] = 255
          if (c > 3) data[i + 3] = 255
        }
      }
    }
  }

  const out = await sharp(data, { raw: { width: w, height: h, channels: c } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await writeFile(p, out)
  await writeFile(path.join(UPLOADS, file), out)
  console.log("cleaned", file, Math.round(out.length / 1024), "KB")
}

await pad6333()
for (const f of ["IMG_6403.png", "IMG_6404.png", "IMG_6405.png", "IMG_6309.png", "IMG_6323.png"]) {
  await cleanCrumbs(f)
}
console.log("CLEAN_DONE")
