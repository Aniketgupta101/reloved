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
  "jvpd",
  "mumbai",
]

/** Street landmarks only — never preferred over a real suburb on the Wall. */
const MUMBAI_STREET_HINTS = ["perry cross", "linking road", "hill road", "turner road"]

/** Common pincode → display locality (short form preferred by product). */
const PINCODE_AREA: Record<string, string> = {
  "400050": "Bandra W",
  "400051": "Bandra E",
  "400052": "Khar W",
  // Andheri HO / Azad Nagar — was wrongly mapped to Bandra W.
  "400053": "Andheri W",
  "400054": "Khar E",
  "400055": "Santacruz E",
  "400056": "Santacruz W",
  "400057": "Vile Parle E",
  "400058": "Vile Parle W",
  "400064": "Kandivali E",
  "400067": "Kandivali W",
  "400069": "Andheri E",
  "400091": "Kandivali E",
  "400095": "Andheri W",
  "400101": "Kandivali E",
  "400102": "Kandivali E",
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
  // Normalize spaced Indian pincodes ("400 013" / "400 050" → "400013").
  const value = String(raw || "")
    .replace(/\b(\d{3})\s+(\d{3})\b/g, "$1$2")
    .trim()
  if (!value) return "Mumbai"

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

  if (parts.length === 0) {
    // Address was only a pincode / private markers — fall back to pin map.
    const pinOnly = value.match(/\b(40\d{4})\b/)
    if (pinOnly && PINCODE_AREA[pinOnly[1]]) return `${PINCODE_AREA[pinOnly[1]]}, Mumbai`
    return "Mumbai"
  }

  // Prefer neighbourhood text in the address over pincode (pins can be wrong /
  // shared HO codes — e.g. 400053 is Andheri HO, not Bandra).
  const suburbParts = parts.filter((part) => {
    const lower = part.toLowerCase()
    if (isZoneLabel(part)) return false
    return MUMBAI_AREA_HINTS.some((hint) => hint !== "mumbai" && lower.includes(hint))
  })

  if (suburbParts.length > 0) {
    const labels = suburbParts
      .map((p) => extractSuburbLabel(p) || shortenAreaName(p))
      .filter(Boolean)
    const chosen = labels[labels.length - 1]
    if (chosen && !/^mumbai$/i.test(chosen)) {
      return titleCaseArea(`${chosen}, Mumbai`)
    }
  }

  // No suburb text — use pincode map when present.
  const pinMatch = value.match(/\b(40\d{4})\b/)
  if (pinMatch && PINCODE_AREA[pinMatch[1]]) {
    return `${PINCODE_AREA[pinMatch[1]]}, Mumbai`
  }

  // Street landmarks only if nothing else (never preferred over suburb/pin).
  const streetParts = parts.filter((part) => {
    const lower = part.toLowerCase()
    return MUMBAI_STREET_HINTS.some((hint) => lower.includes(hint))
  })
  if (streetParts.length > 0) {
    return titleCaseArea(`${shortenAreaName(streetParts[streetParts.length - 1])}, Mumbai`)
  }

  const cityOnly = parts.some((p) => /^mumbai$/i.test(p.trim()))
  if (cityOnly) return "Mumbai"

  // Fallback: if multi-segment, hide the first (usually building name).
  if (parts.length >= 2) {
    const rest = parts.slice(1).filter((p) => !isZoneLabel(p))
    if (rest.length === 0) return "Mumbai"
    return titleCaseArea(rest.map(shortenAreaName).slice(0, 2).join(", "))
  }

  // Single segment with no known area → keep generic city label (never a zone).
  if (isZoneLabel(parts[0])) return "Mumbai"
  return "Mumbai"
}

function extractSuburbLabel(part: string): string | null {
  const lower = part.toLowerCase()
  if (/\bjvpd\b/.test(lower)) return "Juhu"
  // Prefer longer suburb names first (e.g. "vile parle" before "parel").
  const hints = [...MUMBAI_AREA_HINTS]
    .filter((h) => h !== "mumbai" && h !== "jvpd")
    .sort((a, b) => b.length - a.length)
  for (const hint of hints) {
    const idx = lower.indexOf(hint)
    if (idx < 0) continue
    const slice = part.slice(idx, idx + hint.length)
    const after = part.slice(idx + hint.length).match(/^\s*(west|east|north|south|w|e|n|s)\b/i)
    return shortenAreaName(`${slice}${after ? ` ${after[1]}` : ""}`)
  }
  return null
}

function titleCaseArea(value: string): string {
  return value
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(W|E|N|S)\b/gi, (m) => m.toUpperCase())
}

/** True when the public label looks like a real Mumbai suburb (not a street / bare city). */
export function isRecognisablePublicArea(raw: string | null | undefined): boolean {
  const value = String(raw || "").trim()
  if (!value || /^mumbai$/i.test(value)) return false
  if (/\b(road|marg|street|lane|colony|nagar|chsl|apartment|villa)\b/i.test(value) &&
      !MUMBAI_AREA_HINTS.some((h) => h !== "mumbai" && value.toLowerCase().includes(h))) {
    return false
  }
  const lower = value.toLowerCase()
  return MUMBAI_AREA_HINTS.some((hint) => hint !== "mumbai" && lower.includes(hint))
}
