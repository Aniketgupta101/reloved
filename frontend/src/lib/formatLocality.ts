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
