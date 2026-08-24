import { randomUUID } from "crypto"
import { mkdir, rm, writeFile } from "fs/promises"
import path from "path"
import sharp from "sharp"
import { Storage } from "@google-cloud/storage"
import type multer from "multer"

// First line of defense for every upload endpoint — rejects anything whose
// declared MIME type isn't a plain raster image before it's even buffered.
// Client-supplied MIME is spoofable, so this is defense-in-depth, not the
// real gate: saveImage()'s sharp() call is what actually verifies the bytes
// decode as a genuine image (and re-encodes them, stripping anything a
// disguised/polyglot file smuggled in). svg is excluded even though libvips
// can rasterize it — no reason to hand attacker-controlled XML to an SVG
// parser when every other format already covers real donor photos.
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])

export const imageFileFilter: NonNullable<multer.Options["fileFilter"]> = (_req, file, cb) => {
  if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
    cb(Object.assign(new Error("Only JPEG, PNG, WEBP, or HEIC/HEIF image files are allowed"), { status: 400 }))
    return
  }
  cb(null, true)
}

// Asset storage, swappable via STORAGE_DRIVER so nothing else in the app
// touches the filesystem or a cloud SDK directly.
//
// - "disk" (default, used in local dev): writes to ./uploads, served via the
//   /uploads static route in server/index.ts.
// - "gcs": writes to a Cloud Storage bucket, for deploying on Cloud Run
//   where local disk doesn't survive a redeploy. Uses Application Default
//   Credentials — on Cloud Run that's the service's runtime service account
//   (needs "Storage Object Admin" on the bucket), no key file required.
//   See Docs/BACKEND_PLAN.md for the provisioning steps.

const DRIVER = process.env.STORAGE_DRIVER === "gcs" ? "gcs" : "disk"
const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads")
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME

const gcsClient = DRIVER === "gcs" ? new Storage() : null

export interface SavedFile {
  path: string // relative path, stored in the DB (e.g. "items/abc123.webp")
  url: string  // renderable URL — a relative /uploads path on disk, or a full https:// URL on GCS
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true })
}

/**
 * Shrinks a raw upload (phone camera photos can be 4000px+/10MB+) down to a
 * sane working size BEFORE it hits bg-removal or Gemini — both scale with
 * pixel count, so this is what actually cuts processing time and AI tokens.
 * saveImage() re-compresses to webp afterwards regardless; this pass exists
 * so everything upstream of it (segmentation, analysis) isn't paying full
 * resolution cost too.
 */
export async function compressUpload(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: string }> {
  const resized = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()
  return { buffer: resized, mimeType: "image/jpeg" }
}

/**
 * Resizes, strips EXIF and re-encodes an uploaded image, then saves it under
 * {entity}/{uuid}.webp on whichever driver is active. This is what Give.tsx
 * already claims happens ("images are compressed and location data is
 * removed automatically") but nothing actually did until now.
 */
export async function saveImage(buffer: Buffer, entity: string): Promise<SavedFile> {
  const processed = await sharp(buffer)
    .rotate() // apply EXIF orientation before stripping it
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer()

  const relPath = `${entity}/${randomUUID()}.webp`

  if (DRIVER === "gcs") {
    if (!GCS_BUCKET_NAME) throw new Error("GCS_BUCKET_NAME is not configured")
    const bucket = gcsClient!.bucket(GCS_BUCKET_NAME)
    const file = bucket.file(relPath)
    await file.save(processed, { contentType: "image/webp" })
    await file.makePublic()
    return { path: relPath, url: `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${relPath}` }
  }

  const dir = path.join(UPLOADS_ROOT, entity)
  await ensureDir(dir)
  await writeFile(path.join(UPLOADS_ROOT, relPath), processed)
  return { path: relPath, url: `/uploads/${relPath}` }
}

export async function deleteImage(relPath: string): Promise<void> {
  if (DRIVER === "gcs") {
    if (!GCS_BUCKET_NAME) return
    await gcsClient!.bucket(GCS_BUCKET_NAME).file(relPath).delete({ ignoreNotFound: true })
    return
  }

  const fullPath = path.join(UPLOADS_ROOT, relPath)
  await rm(fullPath, { force: true })
}

export { UPLOADS_ROOT, DRIVER as STORAGE_DRIVER }
