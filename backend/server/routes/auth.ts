import { Router } from "express"
import { prisma } from "../lib/prisma.js"
import { verifyPassword, signAdminToken, verifyAdminToken } from "../lib/auth.js"

export const authRouter = Router()

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" })
    return
  }

  const profile = await prisma.profile.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (!profile || !profile.active) {
    res.status(401).json({ error: "Invalid email or password" })
    return
  }

  const valid = await verifyPassword(password, profile.passwordHash)
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" })
    return
  }

  const token = await signAdminToken({ uid: profile.id, email: profile.email, role: profile.role })
  res.json({
    token,
    profile: { id: profile.id, email: profile.email, role: profile.role, firstName: profile.firstName },
  })
})

authRouter.get("/me", async (req, res) => {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not signed in" })
    return
  }

  try {
    const session = await verifyAdminToken(header.slice("Bearer ".length))
    const profile = await prisma.profile.findUnique({ where: { id: session.uid } })
    if (!profile || !profile.active) {
      res.status(401).json({ error: "Not signed in" })
      return
    }
    res.json({ profile: { id: profile.id, email: profile.email, role: profile.role, firstName: profile.firstName } })
  } catch {
    res.status(401).json({ error: "Not signed in" })
  }
})
