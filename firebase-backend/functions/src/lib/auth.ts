import { SignJWT, jwtVerify } from "jose"

export interface Session {
  uid: string
  email: string
  role: string
}

function secretKey() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || "reloved-firebase-dev-jwt-change-me"
  )
}

/** Donor stays signed in until logout; admin/partner keep a shorter window. */
function sessionTtl(role: string): string {
  if (role === "donor") return process.env.DONOR_SESSION_TTL || "365d"
  return process.env.SESSION_TTL || "7d"
}

export async function signSessionToken(session: Session): Promise<string> {
  return new SignJWT({ email: session.email, role: session.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.uid)
    .setIssuedAt()
    .setExpirationTime(sessionTtl(session.role))
    .sign(secretKey())
}

export async function verifySessionToken(token: string): Promise<Session> {
  const { payload } = await jwtVerify(token, secretKey())
  if (!payload.sub) throw new Error("Token missing subject")
  return {
    uid: payload.sub,
    email: String(payload.email || ""),
    role: String(payload.role || "donor"),
  }
}