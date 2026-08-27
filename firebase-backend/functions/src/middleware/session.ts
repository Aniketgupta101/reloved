import type { NextFunction, Request, Response } from "express"
import { verifySessionToken, type Session } from "../lib/auth"

declare global {
  namespace Express {
    interface Request {
      session?: Session
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
      const session = await verifySessionToken(header.slice("Bearer ".length))
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
