import { execFile } from "child_process"
import { mkdir, copyFile, readFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import sharp from "sharp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(BACKEND_ROOT, "..")
const SRC_DIR = path.join(REPO_ROOT, "frontend", "assets", ".aistudio", "Assets")
const WORKER = path.join(BACKEND_ROOT, "server", "lib", "bgRemovalWorker.cjs")
const OUT_PUBLIC = path.join(REPO_ROOT, "frontend", "public", "images", "wall-items")
const OUT_UPLOADS = path.join(BACKEND_ROOT, "uploads", "items")

function cutout(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [WORKER, inputPath, outputPath, "image/jpeg"],
      { timeout: 180_000, cwd: BACKEND_ROOT, env: { ...process.env, BG_REMOVAL_MODEL: process.env.BG_REMOVAL_MODEL || "medium" } },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve()
      }
    )
  })
}

const files = [
  "IMG_6293.jpeg",
  "IMG_6299.jpeg",
  "IMG_6301.jpeg",
  "IMG_6303.jpeg",
  "IMG_6310.jpeg",
  "IMG_6311.jpeg",
  "IMG_6312.jpeg",
  "IMG_6314.jpeg",
  "IMG_6316.jpeg",
  "IMG_6317.jpeg",
  "IMG_6318.jpeg",
  "IMG_6320.jpeg",
  "IMG_6321.jpeg",
  "IMG_6322.jpeg",
  "IMG_6325.jpeg",
  "IMG_6327.jpeg",
  "IMG_6328.jpeg",
  "IMG_6329.jpeg",
  "IMG_6330.jpeg",
  "IMG_6331.jpeg",
  "IMG_6332.jpeg",
  "IMG_6333.jpeg",
  "IMG_6334.jpeg",
  "IMG_6336.jpeg",
  "IMG_6337.jpeg",
]

await mkdir(OUT_PUBLIC, { recursive: true })
await mkdir(OUT_UPLOADS, { recursive: true })
await mkdir(path.join(BACKEND_ROOT, "tmp-cutouts"), { recursive: true })

for (const file of files) {
  const src = path.join(SRC_DIR, file)
  const stem = file.replace(/\.jpeg$/i, "")
  const rawPng = path.join(BACKEND_ROOT, "tmp-cutouts", `${stem}.png`)
  const destName = `${stem}.png`
  console.log(`cutout ${file}...`)
  try {
    await cutout(src, rawPng)
    const processed = await sharp(rawPng)
      .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer()
    const destPublic = path.join(OUT_PUBLIC, destName)
    const destUpload = path.join(OUT_UPLOADS, destName)
    await sharp(processed).toFile(destPublic)
    await copyFile(destPublic, destUpload)
    console.log(`  ok ${destName}`)
  } catch (err) {
    console.warn(`  FAIL ${file}: ${err.message}`)
  }
}

console.log("DONE")
