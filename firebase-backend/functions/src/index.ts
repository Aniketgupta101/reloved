import { onRequest } from "firebase-functions/v2/https"
import { setGlobalOptions } from "firebase-functions/v2"

setGlobalOptions({
  region: "asia-south1",
  maxInstances: 20,
})

/** HTTPS API — paths match the existing frontend (/api/items, …). */
// Deploy bump: async catalog-first Drop + Wall image polish (25 Sep 2026).
// Note: Firestore onCreate polish trigger deferred (Eventarc SA not ready on this project).
// Polish runs via POST /api/donations/polish-item-images after submit (+ inline best-effort).
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
