import { SignJWT, jwtVerify } from "jose"

export interface Session {
  uid: string
  email: string
  role: string
  /** Bumped on logout — older JWTs become invalid across all browsers. */
  epoch?: number
}

const DEV_JWT_FALLBACK = "reloved-firebase-dev-jwt-change-me"

function isCloudFunctionsRuntime(): boolean {
  return Boolean(process.env.FUNCTION_TARGET || process.env.K_SERVICE || process.env.GCLOUD_PROJECT)
}

function secretKey() {
  const secret = String(process.env.JWT_SECRET || "").trim()
  // Fail closed in deployed Functions — never sign with the public dev fallback.
  if (!secret || secret === DEV_JWT_FALLBACK) {
    if (isCloudFunctionsRuntime() && process.env.FUNCTIONS_EMULATOR !== "true") {
      throw new Error("JWT_SECRET must be set to a strong secret in production")
    }
    console.warn("[auth] JWT_SECRET unset — using insecure local-dev fallback")
    return new TextEncoder().encode(DEV_JWT_FALLBACK)
  }
  return new TextEncoder().encode(secret)
}

/** Donor stays signed in for a rolling month; admin/partner keep a shorter window. */
function sessionTtl(role: string): string {
  if (role === "donor") return process.env.DONOR_SESSION_TTL || "30d"
  return process.env.SESSION_TTL || "7d"
}

export async function signSessionToken(session: Session): Promise<string> {
  const claims: Record<string, unknown> = {
    email: session.email,
    role: session.role,
  }
  if (typeof session.epoch === "number" && Number.isFinite(session.epoch)) {
    claims.epoch = session.epoch
  }
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.uid)
    .setIssuedAt()
    .setExpirationTime(sessionTtl(session.role))
    .sign(secretKey())
}

export async function verifySessionToken(token: string): Promise<Session> {
  const { payload } = await jwtVerify(token, secretKey())
  if (!payload.sub) throw new Error("Token missing subject")
  const epochRaw = payload.epoch
  const epoch =
    typeof epochRaw === "number"
      ? epochRaw
      : typeof epochRaw === "string" && epochRaw.trim()
        ? Number(epochRaw)
        : undefined
  return {
    uid: payload.sub,
    email: String(payload.email || ""),
    role: String(payload.role || "donor"),
    epoch: Number.isFinite(epoch as number) ? (epoch as number) : undefined,
  }
}
