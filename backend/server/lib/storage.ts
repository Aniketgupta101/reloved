import { randomUUID } from "crypto"
import { mkdir, rm, writeFile } from "fs/promises"
import path from "path"
import sharp from "sharp"
import { Storage } from "@google-cloud/storage"

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
