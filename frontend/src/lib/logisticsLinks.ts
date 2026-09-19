/** Launch logistics helpers — always open courier websites (no app-download mandate). */

export const BORZO_INDIA_URL = "https://borzodelivery.com/in/"
export const PORTER_URL = "https://porter.in/"
export const INSTAGRAM_URL = "https://www.instagram.com/reloved.digital"
export const SITE_URL = "https://reloved-digital.web.app"
/** Short / waitlist landing used on print QR materials. */
export const GO_URL = "https://go.reloved.digital/go"

export const RIDER_GATE_NOTE =
  "Collect package directly from the building main gate security. Do not call flat."

function openCourierWebsite(webUrl: string): void {
  window.open(webUrl, "_blank", "noopener,noreferrer")
}

export function mapsSearchUrl(buildingOrLocality: string): string {
  const q = buildingOrLocality.trim() || "Mumbai"
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/** Opens Borzo India in the browser (website — not an app install). */
export function openBorzo(): void {
  openCourierWebsite(BORZO_INDIA_URL)
}

/** Opens Porter in the browser (website — not an app install). */
export function openPorter(): void {
  openCourierWebsite(PORTER_URL)
}

/**
 * Test API returns apitest.borzodelivery.com/in/track/... which 404s.
 * Prefer the public India track host.
 */
export function normalizeBorzoTrackingUrl(url?: string | null): string | null {
  const raw = String(url || "").trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase()
    if (
      host === "apitest.borzodelivery.com" ||
      host === "www.apitest.borzodelivery.com" ||
      host.includes("robotapitest")
    ) {
      u.protocol = "https:"
      u.hostname = "borzodelivery.com"
      return u.toString()
    }
    return raw
  } catch {
    return raw
  }
}

export function isBrokenBorzoTestTrackUrl(url?: string | null): boolean {
  const raw = String(url || "").toLowerCase()
  return raw.includes("apitest.borzodelivery.com") || raw.includes("robotapitest")
}

export function openMapsForBuilding(buildingOrLocality: string): void {
  window.open(mapsSearchUrl(buildingOrLocality), "_blank", "noopener,noreferrer")
}


export function buildPickupClipboard(opts: {
  building: string
  reference?: string
  opsNote?: string
}): string {
  const lines = [
    opts.reference ? `Reloved ref: ${opts.reference}` : null,
    `Building / landmark: ${opts.building.trim() || "(add building)"}`,
    `Rider note: ${RIDER_GATE_NOTE}`,
    opts.opsNote?.trim() ? `Team note: ${opts.opsNote.trim()}` : null,
    "Use the central company phone on the booking — not the donor's personal number.",
  ].filter(Boolean)
  return lines.join("\n")
}

export async function copyPickupForOps(opts: {
  building: string
  reference?: string
  opsNote?: string
}): Promise<void> {
  const text = buildPickupClipboard(opts)
  await navigator.clipboard.writeText(text)
}

/** Claimer self-serve: paste pickup + drop into Borzo/Porter website (Reloved covers pilot courier). */
export function buildSelfServeCourierClipboard(opts: {
  pickupBuilding: string
  dropBuilding: string
  itemTitle?: string
  reference?: string
}): string {
  return [
    opts.reference ? `Reloved: ${opts.reference}` : null,
    opts.itemTitle ? `Item: ${opts.itemTitle}` : null,
    `PICKUP (giver building gate): ${opts.pickupBuilding.trim() || "(ask Reloved chat if missing)"}`,
    `DROP (your building gate): ${opts.dropBuilding.trim() || "(your saved address)"}`,
    `Rider note: ${RIDER_GATE_NOTE}`,
    "Book on the Borzo or Porter website (no app download required). Chat Reloved if you need help with the ride.",
  ]
    .filter(Boolean)
    .join("\n")
}

export async function copySelfServeCourierBooking(opts: {
  pickupBuilding: string
  dropBuilding: string
  itemTitle?: string
  reference?: string
}): Promise<void> {
  await navigator.clipboard.writeText(buildSelfServeCourierClipboard(opts))
}

/** WhatsApp deep link to a partner contact (India numbers). */
export function partnerWhatsAppUrl(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, "")
  const withCountry = digits.length === 10 ? `91${digits}` : digits
  const base = `https://wa.me/${withCountry}`
  if (!message) return base
  return `${base}?text=${encodeURIComponent(message)}`
}

export function partnerMailtoUrl(email: string, subject?: string, body?: string): string {
  const params = new URLSearchParams()
  if (subject) params.set("subject", subject)
  if (body) params.set("body", body)
  const qs = params.toString()
  return `mailto:${email}${qs ? `?${qs}` : ""}`
}

/** Public QR image URL (no extra npm dep). For marketing download page only. */
export function qrImageUrl(
  data: string,
  size = 320,
  opts?: { color?: string; bgcolor?: string; ecc?: "L" | "M" | "Q" | "H" },
): string {
  const color = opts?.color ?? "000000"
  const bgcolor = opts?.bgcolor ?? "FFFFFF"
  const ecc = opts?.ecc ?? "M"
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&ecc=${ecc}&color=${color}&bgcolor=${bgcolor}&data=${encodeURIComponent(data)}`
}
