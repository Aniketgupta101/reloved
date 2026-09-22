import type { NextFunction, Request, Response } from "express"
import { verifySessionToken, type Session } from "../lib/auth"
import { findDonorProfileDoc } from "../lib/donorIdentity"
import { getDb } from "../lib/firestore"

declare global {
  namespace Express {
    interface Request {
      session?: Session
    }
  }
}

/** Reject donor JWTs issued before the profile's sessionEpoch (global logout). */
async function assertDonorSessionEpoch(session: Session): Promise<void> {
  if (session.role !== "donor") return
  const profileDoc = await findDonorProfileDoc(getDb(), session.uid)
  const liveEpoch = Number(profileDoc?.data()?.sessionEpoch || 0)
  if (!Number.isFinite(liveEpoch) || liveEpoch <= 0) return
  const tokenEpoch = Number(session.epoch || 0)
  if (tokenEpoch < liveEpoch) {
    throw new Error("Session revoked")
  }
}

/** Attaches session when a valid Bearer token is present; never rejects. */
export async function attachSessionIfPresent(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    next()
    return
  }
  try {
    const session = await verifySessionToken(header.slice("Bearer ".length))
    await assertDonorSessionEpoch(session)
    req.session = session
  } catch {
    // ignore invalid token for public routes
  }
  next()
}

export function requireRole(role: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Not signed in" })
      return
    }
    try {
      const session = await verifySessionToken(header.slice("Bearer ".length))
      if (session.role !== role) {
        res.status(403).json({ error: "Wrong account type for this action" })
        return
      }
      await assertDonorSessionEpoch(session)
      req.session = session
      next()
    } catch {
      res.status(401).json({ error: "Invalid or expired session" })
    }
  }
}
