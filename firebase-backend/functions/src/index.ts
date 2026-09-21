import { onRequest } from "firebase-functions/v2/https"
import { setGlobalOptions } from "firebase-functions/v2"

setGlobalOptions({
  region: "asia-south1",
  maxInstances: 20,
})

/** HTTPS API — paths match the existing frontend (/api/health, /api/items, …). */
// Deploy bump: OTP email relay→Brevo fallback (15 Sep 2026).
export const api = onRequest(
  {
    cors: true,
    memory: "1GiB",
    // Multi-photo Give: catalog + best-effort cutout per image needs headroom.
    timeoutSeconds: 300,
  },
  async (req, res) => {
    // Lazy-load so deploy discovery does not hang on Admin SDK init.
    const { createApp } = await import("./app")
    const app = createApp()
    return app(req, res)
  }
)
