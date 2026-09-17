import { getAuth, type Auth } from "firebase-admin/auth"
import { ensureFirebaseApp } from "./firebaseApp"

let _auth: Auth | null = null

/** Firebase Admin Auth (verifies Google Sign-In ID tokens) — distinct from lib/auth.ts, which signs/verifies our own Reloved session JWTs. */
export function getAdminAuth(): Auth {
  if (!_auth) {
    ensureFirebaseApp()
    _auth = getAuth()
  }
  return _auth
}
