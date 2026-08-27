import { onRequest } from "firebase-functions/v2/https"
import { setGlobalOptions } from "firebase-functions/v2"

setGlobalOptions({
  region: "asia-south1",
  maxInstances: 20,
})

/** HTTPS API — paths match the existing frontend (/api/health, /api/items, …). */
export const api = onRequest(
  {
    cors: true,
    memory: "1GiB",
    timeoutSeconds: 180,
  },
  async (req, res) => {
    // Lazy-load so deploy discovery does not hang on Admin SDK init.
    const { createApp } = await import("./app")
    const app = createApp()
    return app(req, res)
  }
)
