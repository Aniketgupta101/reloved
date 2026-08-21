import "dotenv/config"
import express from "express"
import cors from "cors"
import rateLimit from "express-rate-limit"
import path from "path"
import { publicRouter } from "./routes/public.js"
import { adminRouter } from "./routes/admin.js"
import { authRouter } from "./routes/auth.js"
import { donorRouter } from "./routes/donor.js"
import { partnerRouter } from "./routes/partner.js"
import { UPLOADS_ROOT } from "./lib/storage.js"

// Defense-in-depth: an unhandled rejection in any route (a vendor API
// hiccup, a bad key, a DB blip) should never take the whole process down.
// Every route should already have its own try/catch — this is the backstop
// for the one that doesn't, not a substitute for writing them.
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection (server stayed up):", err)
})
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server stayed up):", err)
})

const app = express()
const PORT = Number(process.env.PORT) || 8787

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use("/uploads", express.static(UPLOADS_ROOT))

// Public write endpoints are unauthenticated by design (see Docs/BACKEND_PLAN.md) —
// rate-limit them so an open form can't be scripted into a flood.
const publicWriteLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20 })
app.use("/api/donations", publicWriteLimiter)
app.use("/api/partner-applications", publicWriteLimiter)
app.use("/api/contact", publicWriteLimiter)
app.use("/api/otp", rateLimit({ windowMs: 10 * 60 * 1000, limit: 10 }))
// Bulk-upload analysis runs local ML + a Gemini call per image — cap how often it can be kicked off.
app.use("/api/admin/bulk-upload/analyze", rateLimit({ windowMs: 10 * 60 * 1000, limit: 10 }))
app.use("/api/donations/analyze-photos", rateLimit({ windowMs: 10 * 60 * 1000, limit: 10 }))
// Login is a brute-force target — cap attempts per IP.
app.use("/api/auth/login", rateLimit({ windowMs: 10 * 60 * 1000, limit: 10 }))
app.use("/api/partner/login", rateLimit({ windowMs: 10 * 60 * 1000, limit: 10 }))
app.use("/api/donor/session", rateLimit({ windowMs: 10 * 60 * 1000, limit: 10 }))
app.use("/api/donor/item-requests", publicWriteLimiter)

app.use("/api", publicRouter)
app.use("/api/auth", authRouter)
app.use("/api/donor", donorRouter)
app.use("/api/partner", partnerRouter)
app.use("/api/admin", adminRouter)

app.get("/api/health", (_req, res) => res.json({ ok: true }))

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(err?.status || 500).json({ error: err?.message || "Internal server error" })
})

app.listen(PORT, () => {
  console.log(`reloved backend listening on http://localhost:${PORT}`)
})
