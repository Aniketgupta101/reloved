import { FieldValue } from "firebase-admin/firestore"
import { collections, getDb } from "./firestore"

/** Product funnel events mirrored into Firestore for the admin Analytics page. */
export const ANALYTICS_FUNNEL_EVENTS = new Set([
  "cta_drop_item_clicked",
  "cta_claim_item_clicked",
  "cta_explore_wall_clicked",
  "donation_started",
  "donation_step_viewed",
  "donation_submitted",
  "donation_completed",
  "donation_failed",
  "item_card_clicked",
  "item_viewed",
  "claim_started",
  "claim_submitted",
  "claim_failed",
  "login_started",
  "login_completed",
  "onboarding_completed",
  "logout",
  "track_lookup_submitted",
  "track_status_viewed",
  "partner_apply_cta_clicked",
  "partner_application_submitted",
  "contact_submitted",
  "wall_filter_changed",
  "page_view",
])

export function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function counterField(event: string): string {
  // Firestore field names: replace non-alphanumeric with _
  return `e_${event.replace(/[^a-zA-Z0-9_]/g, "_")}`
}

/** Increment a daily counter. Safe to fire-and-forget from request handlers. */
export async function bumpAnalyticsDaily(
  event: string,
  amount = 1,
  extra?: Record<string, string | number | boolean | null>
): Promise<void> {
  if (!ANALYTICS_FUNNEL_EVENTS.has(event) || amount < 1) return
  const db = getDb()
  const key = dayKey()
  const ref = db.collection(collections.analyticsDaily).doc(key)
  const patch: Record<string, unknown> = {
    day: key,
    updatedAt: FieldValue.serverTimestamp(),
    [counterField(event)]: FieldValue.increment(amount),
    totalEvents: FieldValue.increment(amount),
  }
  if (extra?.flow && typeof extra.flow === "string") {
    patch[`flow_${String(extra.flow).replace(/[^a-zA-Z0-9_]/g, "_")}`] = FieldValue.increment(amount)
  }
  if (extra?.host && typeof extra.host === "string") {
    const hostKey = String(extra.host).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80)
    patch[`host_${hostKey}`] = FieldValue.increment(amount)
  }
  await ref.set(patch, { merge: true })
}

export { counterField }
