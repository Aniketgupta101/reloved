/**
 * Admin-facing status labels — keep Wall vocabulary consistent:
 * Available → Claimed → Matched → Reloved
 * Decline path: Declined / Couldn't match (never "rejected" in UI)
 */

import { DROP_GENDER_OPTIONS, giverLogisticsLabel } from "@shared/taxonomy"

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
  if (s === "rejected" || s === "declined" || s === "cancelled") return "Couldn't match"
  if (!s) return "—"
  return s.replace(/_/g, " ")
}

/** Peer handover stages used after match (giver / claimer flow). */
export function handoverStageLabel(stage: string | null | undefined): string {
  const s = String(stage || "").toLowerCase()
  if (s === "pending_giver") return "Awaiting giver"
  if (s === "awaiting_delivery_address") return "Awaiting delivery landmark"
  if (s === "awaiting_handover") return "Awaiting handover"
  if (s === "handed_over") return "Handed over — confirm received"
  if (s === "received") return "Reloved"
  if (!s) return "—"
  return s.replace(/_/g, " ")
}

export function genderAudienceLabel(gender: string | null | undefined): string {
  const v = String(gender || "").toLowerCase()
  const hit = DROP_GENDER_OPTIONS.find((o) => o.value === v)
  if (hit) return hit.label
  if (v === "kids") return "Kids"
  return v || "—"
}

export function logisticsAdminLabel(logistics: string | null | undefined): string {
  return giverLogisticsLabel(logistics)
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

export function categoryDisplayLabel(category: string | null | undefined): string {
  const v = String(category || "").trim()
  if (!v) return "—"
  if (v === "Tops" || v === "Bottoms" || v === "Outerwear" || v === "Clothing") return "Apparel"
  if (v === "Kicks" || v === "Footwear") return "Shoes"
  if (v === "Bags") return "Bags"
  if (v === "Accessories") return "Accessories"
  return v
}
