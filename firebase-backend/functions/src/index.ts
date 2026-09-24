import { onRequest } from "firebase-functions/v2/https"
import { setGlobalOptions } from "firebase-functions/v2"

setGlobalOptions({
  region: "asia-south1",
  maxInstances: 20,
})

/** HTTPS API — paths match the existing frontend (/api/items, …). */
// Deploy bump: collapse notification cards + mobile button overflow (24 Sep 2026).
export const api = onRequest(
  {
    cors: true,
    memory: "1GiB",
    // Give cutout retries until white-studio succeeds — allow multi-photo headroom.
    timeoutSeconds: 540,
  },
  async (req, res) => {
    // Lazy-load so deploy discovery does not hang on Admin SDK init.
    const { createApp } = await import("./app")
    const app = createApp()
    return app(req, res)
  }
)
