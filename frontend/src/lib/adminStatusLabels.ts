/**
 * Admin-facing status labels — keep Wall vocabulary consistent:
 * Available → Claimed → Matched → Reloved
 * Decline path: Declined / Couldn't match (never "rejected" in UI)
 */

export function wallPublicStatusLabel(status: string | null | undefined): string {
  const s = String(status || "").toLowerCase()
  if (s === "available") return "Available"
  if (s === "being_matched" || s === "claimed") return "Claimed"
  if (s === "reloved") return "Reloved"
  if (s === "withdrawn") return "Withdrawn"
  if (!s) return "—"
  return s.replace(/_/g, " ")
}

export function claimRequestStatusLabel(status: string | null | undefined): string {
  const s = String(status || "").toLowerCase()
  if (s === "pending") return "Pending"
  if (s === "approved") return "Matched"
  if (s === "rejected" || s === "declined" || s === "cancelled") return "Declined"
  if (!s) return "—"
  return s.replace(/_/g, " ")
}

export function submissionStatusLabel(status: string | null | undefined): string {
  const s = String(status || "").toLowerCase()
  if (s === "submitted" || s === "pending") return "Submitted"
  if (s === "under_review") return "Under review"
  if (s === "approved") return "Approved"
  if (s === "rejected") return "Declined"
  if (!s) return "—"
  return s.replace(/_/g, " ")
}

export function itemQcStatusLabel(status: string | null | undefined): string {
  const s = String(status || "").toLowerCase()
  if (s === "submitted" || s === "pending") return "Submitted"
  if (s === "under_review") return "Under review"
  if (s === "approved") return "Approved"
  if (s === "rejected") return "Declined"
  if (!s) return "—"
  return s.replace(/_/g, " ")
}
