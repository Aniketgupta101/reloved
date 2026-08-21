import bcrypt from "bcryptjs"
import { SignJWT, jwtVerify } from "jose"

// Own email+password admin auth, backed by the `profiles` table — not
// Firebase Auth. Firebase Email/Password sign-in is disabled on the
// project's console (not fixable from code), so this is the primary login
// path. requireAdmin (see ../middleware/adminAuth.ts) still also accepts a
// Firebase ID token, so Google OAuth via Firebase can be added as a second
// sign-in option later without touching this.

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.warn("[auth] JWT_SECRET is not set — admin login will fail. Set it in backend/.env.")
}

const secretKey = () => new TextEncoder().encode(JWT_SECRET || "insecure-dev-secret-set-JWT_SECRET")
const TOKEN_TTL = "7d"

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export interface AdminSession {
  uid: string
  email: string
  role: string
}

export async function signAdminToken(session: AdminSession): Promise<string> {
  return new SignJWT({ email: session.email, role: session.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.uid)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey())
}

export async function verifyAdminToken(token: string): Promise<AdminSession> {
  const { payload } = await jwtVerify(token, secretKey())
  if (!payload.sub) throw new Error("Token missing subject")
  return { uid: payload.sub, email: String(payload.email), role: String(payload.role || "admin") }
}
