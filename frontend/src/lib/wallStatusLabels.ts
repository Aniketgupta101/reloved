/**
 * Wall of Kindness publicStatus → UI labels.
 *
 * Lifecycle (DB → Wall tag):
 *   available      → Available
 *   being_matched  → Being Matched  (claim pending / in transaction)
 *   claimed        → Claimed        (accepted match still on Wall, or Batch 0 seed)
 *   reloved        → Reloved        (Wall of Love; not on active Wall grid)
 *
 * Visibility: available / being_matched / claimed stay publicVisibility=true on the Wall.
 * Reloved stays visible for Wall of Love; withdrawn is hidden.
 */

export type WallPublicStatus = "available" | "being_matched" | "claimed" | "reloved" | "withdrawn" | string

export function normalizeWallPublicStatus(raw: string | null | undefined): string {
  const s = String(raw || "available").trim().toLowerCase().replace(/\s+/g, "_")
  if (s === "being_matched" || s === "claimed" || s === "reloved" || s === "available" || s === "withdrawn") {
    return s
  }
  return "available"
}

/** Short stamp shown on Wall cards / item detail. */
export function wallStatusTagLabel(status: string | null | undefined): string {
  const s = normalizeWallPublicStatus(status)
  if (s === "available") return "Available"
  if (s === "being_matched") return "Being Matched"
  if (s === "claimed") return "Claimed"
  if (s === "reloved") return "Reloved"
  if (s === "withdrawn") return "Withdrawn"
  return s.replace(/_/g, " ")
}

/** Compact mobile label when space is tight. */
export function wallStatusTagShortLabel(status: string | null | undefined): string {
  const s = normalizeWallPublicStatus(status)
  if (s === "being_matched") return "Matched"
  if (s === "claimed") return "Claimed"
  if (s === "available") return "Free"
  if (s === "reloved") return "Reloved"
  return wallStatusTagLabel(s)
}

export function wallStatusShowsCornerTag(status: string | null | undefined): boolean {
  const s = normalizeWallPublicStatus(status)
  return s === "being_matched" || s === "claimed" || s === "reloved"
}

/** Corner-tag chrome for Wall cards. */
export function wallStatusTagClassName(status: string | null | undefined): string {
  const s = normalizeWallPublicStatus(status)
  if (s === "being_matched") {
    // Yellow “in progress” — readable on product photos
    return "border-foreground bg-accent-yellow text-foreground"
  }
  if (s === "claimed") {
    return "border-foreground bg-accent-pink text-white"
  }
  if (s === "reloved") {
    return "border-foreground bg-white text-accent-pink"
  }
  return "border-foreground bg-white text-foreground"
}
