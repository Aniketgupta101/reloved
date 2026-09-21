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
 * neighbourhood / area (BUG-02 / BUG-19). Prefer recognisable locality
 * (e.g. "Bandra W") over opaque admin labels like "Mumbai Zone 3".
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
  "perry cross",
  "linking road",
  "hill road",
  "turner road",
  "mumbai",
]

/** Common pincode → display locality (short form preferred by product). */
const PINCODE_AREA: Record<string, string> = {
  "400050": "Bandra W",
  "400051": "Bandra E",
  "400052": "Khar W",
  "400053": "Bandra W",
  "400054": "Khar E",
  "400055": "Santacruz E",
  "400056": "Santacruz W",
  "400057": "Vile Parle E",
  "400058": "Vile Parle W",
  "400069": "Andheri E",
  "400095": "Andheri W",
  "400049": "Juhu",
  "400076": "Powai",
  "400012": "Lower Parel",
  "400013": "Lower Parel",
  "400018": "Worli",
  "400028": "Dadar W",
}

function shortenAreaName(name: string): string {
  return name
    .replace(/\bWest\b/gi, "W")
    .replace(/\bEast\b/gi, "E")
    .replace(/\bNorth\b/gi, "N")
    .replace(/\bSouth\b/gi, "S")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function isZoneLabel(part: string): boolean {
  return /\bzone\s*\d+\b/i.test(part) || /^mumbai\s+zone/i.test(part.trim())
}

export function toPublicArea(raw: string | null | undefined): string {
  const value = String(raw || "").trim()
  if (!value) return "Mumbai"

  // Prefer pincode → known locality when present.
  const pinMatch = value.match(/\b(40\d{4})\b/)
  if (pinMatch && PINCODE_AREA[pinMatch[1]]) {
    return `${PINCODE_AREA[pinMatch[1]]}, Mumbai`
  }

  // Drop obvious private housing markers first.
  let cleaned = value
    .replace(/\b(flat|apt\.?|apartment|wing|floor|house|unit|tower|block)\s*[#.:-]?\s*[a-z0-9/-]+/gi, "")
    .replace(/#\s*\d+[a-z]?/gi, "")
    .replace(/\b(maharashtra|india)\b/gi, "")
    .replace(/\b\d{6}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim()

  const parts = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !isZoneLabel(p))

  if (parts.length === 0) return "Mumbai"

  // Prefer the last parts that look like known Mumbai neighbourhoods / city.
  const areaParts = parts.filter((part) => {
    const lower = part.toLowerCase()
    if (isZoneLabel(part)) return false
    return MUMBAI_AREA_HINTS.some((hint) => lower.includes(hint))
  })

  if (areaParts.length > 0) {
    // Drop bare "Mumbai" if we also have a neighbourhood.
    const withoutCity = areaParts.filter((p) => !/^mumbai$/i.test(p.trim()))
    const chosen = (withoutCity.length > 0 ? withoutCity : areaParts).slice(-2)
    const shortened = chosen.map(shortenAreaName)
    // Always end with Mumbai for consistency when we have a suburb.
    if (!shortened.some((p) => /^mumbai$/i.test(p))) {
      return `${shortened[shortened.length - 1]}, Mumbai`
    }
    return shortened.join(", ")
  }

  // Fallback: if multi-segment, hide the first (usually building name).
  if (parts.length >= 2) {
    const rest = parts.slice(1).filter((p) => !isZoneLabel(p))
    if (rest.length === 0) return "Mumbai"
    return rest.map(shortenAreaName).slice(0, 2).join(", ")
  }

  // Single segment with no known area → keep generic city label (never a zone).
  if (isZoneLabel(parts[0])) return "Mumbai"
  return "Mumbai"
}
