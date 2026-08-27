/**
 * Wall PNGs: rembg → white with quality gate.
 * If rembg eats the garment (logo-only) or leaves almost everything,
 * fall back to a gentler second pass then reject → pad is NOT used
 * (caller can decide). This script only writes accepted cutouts or
 * best-effort rembg results after retry.
 *
 * Usage: npx tsx scripts/reprocess-wall-bgs.ts
 */
import "dotenv/config"
import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import sharp from "sharp"
import { removeBackgroundToWhite } from "../server/lib/bgRemoval.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(BACKEND_ROOT, "..")
const SRC_DIR = path.join(REPO_ROOT, "frontend", "assets", ".aistudio", "Assets")
const OUT_PUBLIC = path.join(REPO_ROOT, "frontend", "public", "images", "wall-items")
const OUT_UPLOADS = path.join(BACKEND_ROOT, "uploads", "items")
const SIZE = 1400

const DEFAULT_STEMS = [
  "IMG_6309",
  "IMG_6323",
  "IMG_6333",
  "IMG_6338",
  "IMG_6396",
  "IMG_6397",
  "IMG_6399",
  "IMG_6400",
  "IMG_6403",
  "IMG_6404",
  "IMG_6405",
]

async function findSource(stem: string): Promise<string | null> {
  for (const ext of [".jpeg", ".JPEG", ".jpg", ".JPG"]) {
    const p = path.join(SRC_DIR, `${stem}${ext}`)
    try {
      await readFile(p)
      return p
    } catch {
      /* next */
    }
  }
  return null
}

/** Fraction of pixels that are not near-white (subject coverage). */
async function subjectCoverage(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png)
    .resize(200, 200, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let subject = 0
  const total = info.width * info.height
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    // near-white canvas
    if (r > 245 && g > 245 && b > 245) continue
    subject++
  }
  return subject / total
}

async function prepare(src: string): Promise<Buffer> {
  return sharp(await readFile(src))
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer()
}

async function finalize(cut: Buffer): Promise<Buffer> {
  return sharp(cut)
    .resize({ width: SIZE, height: SIZE, fit: "inside", withoutEnlargement: true })
    .extend({
      top: 40,
      bottom: 40,
      left: 40,
      right: 40,
      background: { r: 255, g: 255, b: 255 },
    })
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function main() {
  process.env.BG_REMOVAL_DISABLED = "false"
  process.env.BG_REMOVAL_MODEL = process.env.BG_REMOVAL_MODEL || "medium"

  const stems = process.argv.slice(2).map((s) => s.replace(/\.png$/i, ""))
  const list = stems.length ? stems : DEFAULT_STEMS
  await mkdir(OUT_PUBLIC, { recursive: true })
  await mkdir(OUT_UPLOADS, { recursive: true })

  console.log(`Cutouts with model=${process.env.BG_REMOVAL_MODEL} for ${list.length} images`)

  for (const stem of list) {
    const src = await findSource(stem)
    if (!src) {
      console.warn(`SKIP ${stem}`)
      continue
    }
    console.log(`\n→ ${stem}`)
    const prepared = await prepare(src)
    let cut = await removeBackgroundToWhite(prepared, "image/jpeg")
    let cov = await subjectCoverage(cut)
    console.log(`  coverage ${(cov * 100).toFixed(1)}%`)

    // Logo-only / over-deleted — retry once
    if (cov < 0.06 || cov > 0.92) {
      console.warn(`  coverage out of range — retry`)
      cut = await removeBackgroundToWhite(prepared, "image/jpeg")
      cov = await subjectCoverage(cut)
      console.log(`  retry coverage ${(cov * 100).toFixed(1)}%`)
    }

    if (cov < 0.05 || cov > 0.95) {
      console.warn(`  rembg still bad (cov=${(cov * 100).toFixed(1)}%) — keep prior file if any`)
      const existing = path.join(OUT_PUBLIC, `${stem}.png`)
      try {
        // If we already had a previous cutout with ok coverage, skip overwrite
        const prev = await readFile(existing)
        const prevCov = await subjectCoverage(prev)
        if (prevCov >= 0.05 && prevCov <= 0.9) {
          console.warn(`  keeping existing cutout (cov ${(prevCov * 100).toFixed(1)}%)`)
          continue
        }
      } catch {
        /* none */
      }
    }

    cut = await finalize(cut)
    const dest = `${stem}.png`
    await writeFile(path.join(OUT_PUBLIC, dest), cut)
    await writeFile(path.join(OUT_UPLOADS, dest), cut)
    console.log(`  wrote ${dest} (${Math.round(cut.length / 1024)} KB) cov=${(cov * 100).toFixed(1)}%`)
  }
  console.log("\nDone.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
