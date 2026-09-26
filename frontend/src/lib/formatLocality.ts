/** Prefer recognisable suburb over opaque “Mumbai Zone N” labels. */
export function formatWallLocality(raw: string | null | undefined): string {
  const value = String(raw || "").trim()
  if (!value) return "Mumbai"
  if (/\bzone\s*\d+\b/i.test(value)) {
    const withoutZone = value
      .replace(/\bMumbai\s+Zone\s*\d+\b/gi, "")
      .replace(/\bZone\s*\d+\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[,.\s]+|[,.\s]+$/g, "")
      .trim()
    if (withoutZone && !/^mumbai$/i.test(withoutZone)) return withoutZone
    return "Mumbai"
  }
  return value
    .replace(/\bWest\b/gi, "W")
    .replace(/\bEast\b/gi, "E")
    .trim()
}

/** `@Priya` from the claimer's username (preferred) or first name — never the giver. */
export function formatClaimerHandle(nameOrUsername: string | null | undefined): string {
  const raw = String(nameOrUsername || "")
    .trim()
    .replace(/^@+/, "")
  if (!raw) return "Someone"
  const handle = raw.split(/\s+/)[0]
  return handle ? `@${handle}` : "Someone"
}

/** Short area for “from Juhu” — strips city suffix and privacy placeholders. */
export function formatClaimerArea(localityOrAddress: string | null | undefined): string | null {
  const raw = String(localityOrAddress || "").trim()
  if (!raw) return null
  if (/delivery building|waiting for|hidden for privacy|exact flat/i.test(raw)) return null
  const formatted = formatWallLocality(raw)
    .replace(/,\s*Mumbai$/i, "")
    .trim()
  if (!formatted || /^mumbai$/i.test(formatted)) return null
  return formatted
}

/** Giver-facing: `@Priya from Juhu wants to Relove your Pink Corduroy Cropped Jacket 💗`
 *  Handle is always the claimer (person requesting), never the logged-in giver.
 */
export function claimerWantsToReloveLine(opts: {
  username?: string | null
  name?: string | null
  locality?: string | null
  address?: string | null
  itemTitle?: string | null
}): string {
  // Prefer claimer username; fall back to the name they entered when claiming.
  const handle = formatClaimerHandle(opts.username || opts.name)
  const area = formatClaimerArea(opts.locality || opts.address)
  const title = String(opts.itemTitle || "").trim() || "item"
  if (handle === "Someone" && !area) return `Someone wants to Relove your ${title} 💗`
  if (area) return `${handle} from ${area} wants to Relove your ${title} 💗`
  return `${handle} wants to Relove your ${title} 💗`
}
