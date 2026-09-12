import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth, type Auth } from "firebase-admin/auth"

let _auth: Auth | null = null

/** Firebase Admin Auth (verifies Google Sign-In ID tokens) — distinct from lib/auth.ts, which signs/verifies our own Reloved session JWTs. */
export function getAdminAuth(): Auth {
  if (!_auth) {
    if (getApps().length === 0) {
      initializeApp({
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "reloved-digital.firebasestorage.app",
      })
    }
    _auth = getAuth()
  }
  return _auth
}
