import { Router } from "express"
import { compare } from "bcryptjs"
import { z } from "zod"
import { signSessionToken, verifySessionToken } from "../lib/auth"

export const authRouter = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

async function verifyAdminPassword(email: string, password: string): Promise<boolean> {
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim()
  if (!adminEmail || email.toLowerCase().trim() !== adminEmail) return false

  const hash = process.env.ADMIN_PASSWORD_HASH
  if (hash) return compare(password, hash)

  const plain = process.env.ADMIN_PASSWORD
  if (plain) return password === plain

  return false
}

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "Email and password are required" })
    return
  }
  const email = parsed.data.email.toLowerCase().trim()
  const { password } = parsed.data

  try {
    const ok = await verifyAdminPassword(email, password)
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password" })
      return
    }
    const token = await signSessionToken({ uid: email, email, role: "admin" })
    res.json({
      token,
      profile: { id: email, email, role: "admin", firstName: "Admin" },
    })
  } catch (err) {
    console.error("admin login", err)
    res.status(500).json({ error: "Login failed" })
  }
})

authRouter.get("/me", async (req, res) => {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not signed in" })
    return
  }
  try {
    const session = await verifySessionToken(header.slice("Bearer ".length))
    if (session.role !== "admin") {
      res.status(401).json({ error: "Not signed in" })
      return
    }
    res.json({
      profile: {
        id: session.uid,
        email: session.email,
        role: "admin",
        firstName: "Admin",
      },
    })
  } catch {
    res.status(401).json({ error: "Not signed in" })
  }
})
