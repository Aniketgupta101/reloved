import { getStorage } from "firebase-admin/storage"
import { randomBytes } from "crypto"
import { ensureFirebaseApp, getStorageBucketName } from "./firebaseApp"

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
    metadata: { contentType },
    resumable: false,
  })
  try {
    await file.makePublic()
  } catch {
    // Bucket may disallow ACL; signed/public URL fallback below.
  }
  const url = `https://storage.googleapis.com/${bucket.name}/${objectPath}`
  return { path: objectPath, url }
}
