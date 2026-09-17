import { getApps, initializeApp, type App } from "firebase-admin/app"

/**
 * Single Admin init for Firestore / Auth / Storage.
 * analyze-photos can hit Storage before any route calls getDb(), so every
 * Admin consumer must go through this — never call getStorage() alone.
 */
export function ensureFirebaseApp(): App {
  const existing = getApps()[0]
  if (existing) return existing
  return initializeApp({
    storageBucket: getStorageBucketName(),
  })
}

/** Canonical uploads bucket (live analyze responses use this name). */
export function getStorageBucketName(): string {
  return (
    process.env.STORAGE_BUCKET ||
    process.env.FIREBASE_STORAGE_BUCKET ||
    "reloved-digital-uploads"
  )
}
