import { onRequest } from "firebase-functions/v2/https"
import { onSchedule } from "firebase-functions/v2/scheduler"
import { setGlobalOptions } from "firebase-functions/v2"

setGlobalOptions({
  region: "asia-south1",
  maxInstances: 20,
})

/** HTTPS API — paths match the existing frontend (/api/items, …). */
// Deploy bump: mannequin-head QA + cleanup pass for Wall ghost-mannequin polish (28 Sep 2026).
// Note: Firestore onCreate polish trigger deferred (Eventarc SA not ready on this project).
// Polish runs via POST /api/donations/polish-item-images after submit (+ inline best-effort).
// Reprocess existing Wall: npm run reprocess:wall (from functions/).
export const api = onRequest(
  {
    cors: true,
    memory: "2GiB",
    // Give cutout retries until white-studio succeeds — allow multi-photo headroom.
    timeoutSeconds: 540,
    // Keep one instance warm so the Express app isn't rebuilt from a cold start
    // on every scale-up (Phase 0 scalability hotfix).
    minInstances: 1,
  },
  async (req, res) => {
    // Lazy-load so deploy discovery does not hang on Admin SDK init.
    const { createApp } = await import("./app")
    const app = createApp()
    return app(req, res)
  }
)

/**
 * 9:00 AM Asia/Kolkata — email ops today's delivery board
 * (Brevo template BREVO_OPS_DAILY_DELIVERIES_TEMPLATE_ID → Aniket + Totem).
 * Skips the send when there are zero deliveries today.
 */
export const opsDailyDeliveriesReminder = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async () => {
    const { runOpsDailyDeliveriesReminder } = await import("./lib/opsDailyDeliveries")
    await runOpsDailyDeliveriesReminder()
  }
)
