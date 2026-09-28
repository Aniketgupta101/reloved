import cors from "cors"
import express from "express"
import { randomBytes } from "crypto"
import { itemsRouter } from "./routes/items"
import { waitlistRouter } from "./routes/waitlist"
import { seedRouter } from "./routes/seed"
import { otpRouter } from "./routes/otp"
import { donorRouter } from "./routes/donor"
import { publicWriteRouter } from "./routes/publicWrite"
import { authRouter } from "./routes/auth"
import { adminRouter } from "./routes/admin"
import { borzoWebhookRouter } from "./routes/borzoWebhook"
import { edesyInboundRouter } from "./routes/edesyInbound"
import { opsActionRouter } from "./routes/opsActions"

export function createApp() {
  const app = express()
  app.use(cors({ origin: true }))
  app.use((req, res, next) => {
    const incoming = req.header("x-request-id") || ""
    const requestId = /^[\w-]{1,64}$/.test(incoming) ? incoming : randomBytes(8).toString("hex")
    res.setHeader("x-request-id", requestId)
    const started = Date.now()
    res.on("finish", () => {
      const path = (req.originalUrl || req.url || "/").split("?")[0]
      console.log(
        JSON.stringify({
          requestId,
          method: req.method,
          path,
          status: res.statusCode,
          ms: Date.now() - started,
        }),
      )
    })
    next()
  })
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        ;(req as { rawBody?: Buffer }).rawBody = buf
      },
    }),
  )
  app.use(express.urlencoded({ extended: true }))

  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      backend: "firebase-firestore",
      message: "Reloved API. Try GET /api/health or GET /api/items?status=wall",
    })
  })

  app.get("/api/health", async (_req, res) => {
    try {
      const { collections, getDb } = await import("./lib/firestore")
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("firestore health timeout")), 2_000)
        getDb()
          .collection(collections.analyticsDaily)
          .doc("_health")
          .get()
          .then(
            () => {
              clearTimeout(timer)
              resolve()
            },
            (err: unknown) => {
              clearTimeout(timer)
              reject(err)
            },
          )
      })
      res.json({ ok: true })
    } catch (err) {
      console.error("health", err)
      res.status(503).json({ ok: false })
    }
  })

  app.use("/api/items", itemsRouter)
  app.use("/api/waitlist", waitlistRouter)
  app.use("/api/otp", otpRouter)
  app.use("/api/donor", donorRouter)
  app.use("/api/auth", authRouter)
  app.use("/api/admin", adminRouter)
  app.use("/api/borzo", borzoWebhookRouter)
  app.use("/api/edesy", edesyInboundRouter)
  app.use("/api/ops", opsActionRouter)
  app.use("/api", publicWriteRouter)
  app.use("/api/dev/seed", seedRouter)

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err)
    res.status(500).json({ error: "Internal server error" })
  })

  return app
}
