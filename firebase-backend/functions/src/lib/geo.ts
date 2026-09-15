/** Earth-radius haversine distance in kilometres. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const GIVER_SENDS_MATCH_RADIUS_KM = 3

export function parseCoord(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Strip building/flat/wing from a full address so public listings only show
 * neighbourhood / area (BUG-02 / BUG-19).
 *
 * Examples:
 *  "Phoenix Palladium, Lower Parel, Mumbai" → "Lower Parel, Mumbai"
 *  "Bandra West, Mumbai" → "Bandra West, Mumbai"
 *  "flat 12B Wing A, Andheri West" → "Andheri West"
 */
const MUMBAI_AREA_HINTS = [
  "andheri",
  "bandra",
  "juhu",
  "powai",
  "worli",
  "parel",
  "lower parel",
  "colaba",
  "fort",
  "dadar",
  "matunga",
  "sion",
  "kurla",
  "chembur",
  "ghatkopar",
  "vikhroli",
  "bhandup",
  "mulund",
  "malad",
  "goregaon",
  "jogeshwari",
  "kandivali",
  "borivali",
  "dahisar",
  "santacruz",
  "vile parle",
  "khar",
  "mahim",
  "prabhadevi",
  "byculla",
  "grant road",
  "churchgate",
  "cuffe parade",
  "wadala",
  "sewri",
  "trombay",
  "govandi",
  "deonar",
  "kalina",
  "versova",
  "marol",
  "chandivali",
  "thane",
  "navi mumbai",
  "mumbai",
]

export function toPublicArea(raw: string | null | undefined): string {
  const value = String(raw || "").trim()
  if (!value) return "Mumbai"

  // Drop obvious private housing markers first.
  let cleaned = value
    .replace(/\b(flat|apt\.?|apartment|wing|floor|house|unit|tower|block)\s*[#.:-]?\s*[a-z0-9/-]+/gi, "")
    .replace(/#\s*\d+[a-z]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim()

  const parts = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length === 0) return "Mumbai"

  // Prefer the last parts that look like known Mumbai neighbourhoods / city.
  const areaParts = parts.filter((part) => {
    const lower = part.toLowerCase()
    return MUMBAI_AREA_HINTS.some((hint) => lower.includes(hint))
  })

  if (areaParts.length > 0) {
    // Keep at most area + city (2 segments).
    return areaParts.slice(-2).join(", ")
  }

  // Fallback: if multi-segment, hide the first (usually building name).
  if (parts.length >= 2) {
    return parts.slice(1).join(", ")
  }

  // Single segment with no known area → keep generic city label.
  return "Mumbai"
}
