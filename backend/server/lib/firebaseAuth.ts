import { createRemoteJWKSet, jwtVerify } from "jose"

// Verifies Firebase Auth ID tokens using Google's public JWKS, so the
// backend can trust AdminLogin.tsx's existing Firebase Auth session without
// needing a private service-account key. Only the project ID (already
// public, see frontend/firebase-applet-config.json) is required.

const projectId = process.env.FIREBASE_PROJECT_ID
if (!projectId) {
  console.warn("[firebaseAuth] FIREBASE_PROJECT_ID is not set — admin routes will reject all tokens.")
}

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
)

export interface AdminUser {
  uid: string
  email: string | null
}

export async function verifyFirebaseIdToken(token: string): Promise<AdminUser> {
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID not configured")

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  })

  if (!payload.sub) throw new Error("Token missing subject")

  return { uid: payload.sub, email: (payload.email as string) ?? null }
}
