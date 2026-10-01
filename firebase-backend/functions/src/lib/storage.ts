import { getStorage } from "firebase-admin/storage"
import { randomBytes } from "crypto"
import { ensureFirebaseApp, getStorageBucketName } from "./firebaseApp"

export const STORAGE_FOLDERS = {
  DONATIONS_ORIGINALS: "donations/originals",
  DONATIONS_ENHANCED: "donations/enhanced",
  DONATIONS_CUTOUTS: "donations/cutouts",
  DONATIONS: "donations",
} as const

let _bucketAclDisallowed: boolean | null = null

/** Upload a buffer to Firebase Storage. Returns a public HTTPS URL when possible. */
export async function uploadImage(
  buffer: Buffer,
  folder: string,
  contentType = "image/jpeg"
): Promise<{ path: string; url: string }> {
  ensureFirebaseApp()
  const ext =
    contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg"
  const objectPath = `${folder}/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`
  // Always pass the bucket name — app may have been initialized elsewhere without storageBucket.
  const bucket = getStorage().bucket(getStorageBucketName())
  const file = bucket.file(objectPath)
  await file.save(buffer, {
    metadata: {
      contentType,
      // Unique object paths — browsers/CDNs can cache forever and skip re-download.
      cacheControl: "public, max-age=31536000, immutable",
    },
    resumable: false,
  })
  if (_bucketAclDisallowed !== true) {
    try {
      await file.makePublic()
      _bucketAclDisallowed = false
    } catch {
      // Bucket disallows ACL (uniform bucket-level access); remember so subsequent uploads don't waste 200ms
      _bucketAclDisallowed = true
    }
  }
  const url = `https://storage.googleapis.com/${bucket.name}/${objectPath}`
  return { path: objectPath, url }
}
