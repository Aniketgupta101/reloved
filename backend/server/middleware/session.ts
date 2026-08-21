import type { NextFunction, Request, Response } from "express"
import { verifyAdminToken, type AdminSession } from "../lib/auth.js"

// Generic role-gated session check — same JWT mechanism as admin login
// (lib/auth.ts), just requiring a different `role` value in the payload.
// Donor and partner logins both issue tokens through the same signAdminToken
// function with role: "donor" / "partner" respectively.

declare global {
  namespace Express {
    interface Request {
      session?: AdminSession
    }
  }
}

export function requireRole(role: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Not signed in" })
      return
    }

    try {
      const session = await verifyAdminToken(header.slice("Bearer ".length))
      if (session.role !== role) {
        res.status(403).json({ error: "Wrong account type for this action" })
        return
      }
      req.session = session
      next()
    } catch {
      res.status(401).json({ error: "Invalid or expired session" })
    }
  }
}
