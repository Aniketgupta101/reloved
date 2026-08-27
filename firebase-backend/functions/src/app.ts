import cors from "cors"
import express from "express"
import { itemsRouter } from "./routes/items"
import { waitlistRouter } from "./routes/waitlist"
import { seedRouter } from "./routes/seed"
import { otpRouter } from "./routes/otp"
import { donorRouter } from "./routes/donor"
import { publicWriteRouter } from "./routes/publicWrite"
import { authRouter } from "./routes/auth"
import { adminRouter } from "./routes/admin"

export function createApp() {
  const app = express()
  app.use(cors({ origin: true }))
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      backend: "firebase-firestore",
      message: "Reloved API. Try GET /api/health or GET /api/items?status=wall",
    })
  })

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, backend: "firebase-firestore" })
  })

  app.use("/api/items", itemsRouter)
  app.use("/api/waitlist", waitlistRouter)
  app.use("/api/otp", otpRouter)
  app.use("/api/donor", donorRouter)
  app.use("/api/auth", authRouter)
  app.use("/api/admin", adminRouter)
  app.use("/api", publicWriteRouter)
  app.use("/api/dev/seed", seedRouter)

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err)
    res.status(500).json({ error: "Internal server error" })
  })

  return app
}
