import type { NextFunction, Request, Response } from "express"
import { verifySessionToken } from "../lib/auth"

declare global {
  namespace Express {
    interface Request {
      admin?: { uid: string; email: string }
    }
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing admin token" })
    return
  }
  try {
    const session = await verifySessionToken(header.slice("Bearer ".length))
    if (session.role !== "admin") {
      res.status(403).json({ error: "Admin access required" })
      return
    }
    req.admin = { uid: session.uid, email: session.email }
    next()
  } catch {
    res.status(401).json({ error: "Invalid or expired admin token" })
  }
}
