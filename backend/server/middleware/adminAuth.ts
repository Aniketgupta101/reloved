import type { NextFunction, Request, Response } from "express"
import { verifyFirebaseIdToken, type AdminUser } from "../lib/firebaseAuth.js"
import { verifyAdminToken } from "../lib/auth.js"

declare global {
  namespace Express {
    interface Request {
      admin?: AdminUser
    }
  }
}

// Local-dev-only bypass. Gated behind NODE_ENV + an explicit flag so it can
// never activate in production.
const DEV_BYPASS_ENABLED = process.env.NODE_ENV !== "production" && process.env.DEV_ADMIN_BYPASS === "true"
const DEV_BYPASS_TOKEN = "dev-admin"

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing admin token" })
    return
  }

  const token = header.slice("Bearer ".length)

  if (DEV_BYPASS_ENABLED && token === DEV_BYPASS_TOKEN) {
    req.admin = { uid: "dev-admin", email: "dev-admin@local" }
    next()
    return
  }

  // Primary path: our own DB-backed login (see lib/auth.ts). Falls back to
  // verifying a Firebase ID token, so Google OAuth via Firebase can be added
  // as a second sign-in option later without touching this middleware.
  try {
    const session = await verifyAdminToken(token)
    req.admin = { uid: session.uid, email: session.email }
    next()
    return
  } catch {
    // not one of ours — try Firebase below
  }

  try {
    req.admin = await verifyFirebaseIdToken(token)
    next()
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired admin token" })
  }
}
