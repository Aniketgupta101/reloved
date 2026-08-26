import sharp from "sharp"
import { execFile } from "child_process"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = path.join(__dirname, "bgRemovalWorker.cjs")
// Worker resolves @imgly model files from cwd — must be backend root (where
// node_modules lives). WORKER_PATH is server/lib/bgRemovalWorker.cjs, so
// backend root is two levels up, not one — one level up lands at server/,
// which has no node_modules of its own and made every bg-removal attempt
// fail with ENOENT, silently falling back to the original (uncut) photo.
const BACKEND_ROOT = path.join(path.dirname(WORKER_PATH), "..", "..")

async function flattenToWhite(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toBuffer()
}

/**
 * The segmentation model sometimes leaves ambiguous edge/interior pixels at
 * mid-range alpha instead of a clean transparent/opaque decision — flatten()
 * then blends the original pixel color with white there instead of showing
 * clean white, which shows up as a faint leftover texture where the
 * background should be gone. Hard-thresholding the alpha channel first
 * forces every pixel to one clean side or the other, eliminating that
 * partial-blend artifact before flatten ever runs.
 */
async function thresholdAlpha(buffer: Buffer, threshold = 128): Promise<Buffer> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = info.channels - 1; i < data.length; i += info.channels) {
    data[i] = data[i] >= threshold ? 255 : 0
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer()
}

/**
 * Strips the background from a product photo and recomposites it onto solid
 * white. The actual segmentation runs in a separate `node` child process
 * (see bgRemovalWorker.cjs) — sharp (used everywhere else in this server)
 * and @imgly/background-removal-node's onnxruntime-node addon segfault Node
 * when loaded in the same process. Confirmed by reproduction, not a
 * theoretical concern; do not "simplify" this back into an in-process call.
 */
export async function removeBackgroundToWhite(buffer: Buffer, mimeType = "image/jpeg"): Promise<Buffer> {
  if (process.env.BG_REMOVAL_DISABLED === "true") {
    return flattenToWhite(buffer)
  }

  const dir = await mkdtemp(path.join(tmpdir(), "reloved-bgremoval-"))
  const inputPath = path.join(dir, "input")
  const outputPath = path.join(dir, "output.png")

  try {
    await writeFile(inputPath, buffer)

    await new Promise<void>((resolve, reject) => {
      execFile(
        process.execPath,
        [WORKER_PATH, inputPath, outputPath, mimeType],
        { timeout: 120_000, cwd: BACKEND_ROOT, env: process.env },
        (err, _stdout, stderr) => {
          if (err) reject(new Error(`bg-removal worker failed: ${stderr || err.message}`))
          else resolve()
        }
      )
    })

    const cutout = await readFile(outputPath)
    return flattenToWhite(await thresholdAlpha(cutout))
  } catch (err) {
    console.warn("Background removal unavailable, using white flatten fallback:", err)
    return flattenToWhite(buffer)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
