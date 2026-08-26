/**
 * Re-cut IMG_6314 (heather Henley): crop the bottom rug strip from the
 * source photo, re-run bg removal, harden alpha, write transparent PNG.
 */
import { execFile } from "child_process"
import { mkdir, copyFile, writeFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import sharp from "sharp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(BACKEND_ROOT, "..")
const SRC = path.join(REPO_ROOT, "frontend", "assets", ".aistudio", "Assets", "IMG_6314.jpeg")
const WORKER = path.join(BACKEND_ROOT, "server", "lib", "bgRemovalWorker.cjs")
const OUT_PUBLIC = path.join(REPO_ROOT, "frontend", "public", "images", "wall-items", "IMG_6314.png")
const OUT_UPLOADS = path.join(BACKEND_ROOT, "uploads", "items", "IMG_6314.png")
const TMP = path.join(BACKEND_ROOT, "tmp-cutouts")

function cutout(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [WORKER, inputPath, outputPath, "image/jpeg"],
      {
        timeout: 240_000,
        cwd: BACKEND_ROOT,
        env: { ...process.env, BG_REMOVAL_MODEL: process.env.BG_REMOVAL_MODEL || "medium" },
      },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve()
      }
    )
  })
}

/** Force soft alpha to hard transparent/opaque — kills ghost rug haze. */
async function hardenAlpha(buffer, threshold = 96) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = info.channels - 1; i < data.length; i += info.channels) {
    data[i] = data[i] >= threshold ? 255 : 0
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer()
}

/**
 * Zero out any leftover non-shirt pixels along the bottom band (rug strip
 * the model sometimes keeps as "foreground").
 */
async function clearBottomStrip(buffer, stripRatio = 0.06) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const stripStart = Math.floor(height * (1 - stripRatio))
  for (let y = stripStart; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      const a = data[i + 3]
      if (a === 0) continue
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      // Beige/tan rug: warm mid tones, not the cool heather grey of the shirt
      const isWarm = r > g && r > b - 10
      const isTan = r > 120 && g > 90 && b < 160 && r - b > 25
      const isLightEdge = r > 180 && g > 170 && b > 150 && Math.abs(r - g) < 40
      if (isWarm || isTan || isLightEdge) {
        data[i + 3] = 0
      }
    }
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer()
}

await mkdir(TMP, { recursive: true })
await mkdir(path.dirname(OUT_PUBLIC), { recursive: true })
await mkdir(path.dirname(OUT_UPLOADS), { recursive: true })

const meta = await sharp(SRC).metadata()
const cropH = Math.floor(meta.height * 0.9) // drop bottom ~10% rug before segmentation
const croppedPath = path.join(TMP, "IMG_6314-cropped.jpg")
const rawPng = path.join(TMP, "IMG_6314-raw.png")

console.log(`source ${meta.width}x${meta.height} → crop height ${cropH}`)
await sharp(SRC)
  .extract({ left: 0, top: 0, width: meta.width, height: cropH })
  .jpeg({ quality: 92 })
  .toFile(croppedPath)

console.log("bg-removal…")
await cutout(croppedPath, rawPng)

let processed = await hardenAlpha(await sharp(rawPng).png().toBuffer(), 100)
processed = await clearBottomStrip(processed, 0.08)
processed = await sharp(processed)
  .trim({ threshold: 8 })
  .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
  .png({ compressionLevel: 9 })
  .toBuffer()

await writeFile(OUT_PUBLIC, processed)
await copyFile(OUT_PUBLIC, OUT_UPLOADS)

const outMeta = await sharp(OUT_PUBLIC).metadata()
console.log(`ok ${OUT_PUBLIC} ${outMeta.width}x${outMeta.height} alpha=${outMeta.hasAlpha}`)
