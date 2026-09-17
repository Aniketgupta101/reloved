/**
 * Public claim-status labels for claimers.
 * DB may store `rejected` — never show that word on claimer-facing UI.
 *
 * Lifecycle vocabulary (Wall):
 *   Available → Claimed → Matched → Reloved
 *   Decline path: Couldn't match (item returns to Available)
 * Giver actions: Accept / Decline
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
  if (status === "pending") return "Awaiting giver"
  if (status === "approved") return "Matched"
  if (status === "rejected" || status === "declined" || status === "cancelled") {
    return "Couldn't match"
  }
  return status.replace(/_/g, " ") || "Update"
}
