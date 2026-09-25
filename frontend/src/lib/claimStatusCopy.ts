/**
 * Public claim-status labels for claimers.
 * DB may store `rejected` — never show that word on claimer-facing UI.
 *
 * Lifecycle vocabulary (Wall item publicStatus):
 *   Available → Being Matched → Claimed → Reloved
 *   Decline path: Couldn't match (item returns to Available)
 * Claim request status (separate): Pending → Matched (approved) / Couldn't match
 * dropper actions: Accept / Decline
 */
export const CLAIM_DECLINE_SOFT_BODY =
  "We couldn't match you this time — distance or timing may not have worked. The item is back on the Wall if you'd like to browse nearby."

export function claimStatusLabel(opts: {
  status: string
  handoverStage?: string | null
}): string {
  const status = (opts.status || "").toLowerCase()
  const stage = (opts.handoverStage || "").toLowerCase()
  if (stage === "received" || status === "reloved") return "Reloved"
  if (stage === "handed_over") return "Delivered — confirm received"
  if (stage === "awaiting_address_confirm") return "Confirm your address"
  if (stage === "awaiting_schedule") return "Waiting for a delivery time"
  if (stage === "schedule_proposed") return "Dropper shared a time — confirm"
  if (stage === "schedule_agreed") return "Time locked — courier soon"
  if (stage === "awaiting_handover") return "Courier booked"
  if (status === "pending") return "Awaiting dropper"
  if (status === "approved") return "Matched"
  if (status === "cancelled") return "Cancelled"
  if (status === "rejected" || status === "declined") {
    return "Couldn't match"
  }
  return status.replace(/_/g, " ") || "Update"
}
