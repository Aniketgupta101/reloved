/** Launch logistics helpers — open courier websites, and on mobile try the native app first. */

export const BORZO_INDIA_URL = "https://borzodelivery.com/in/"
export const PORTER_URL = "https://porter.in/"
export const INSTAGRAM_URL = "https://www.instagram.com/reloved.digital"
export const SITE_URL = "https://reloved-digital.web.app"
/** Short / waitlist landing used on print QR materials. */
export const GO_URL = "https://go.reloved.digital/go"

export const RIDER_GATE_NOTE =
  "Collect package directly from the building main gate security. Do not call flat."

/** Porter Play Store package (India customer app). */
const PORTER_ANDROID_PACKAGE = "com.theporter.android.customerapp"
/** Borzo / Dostavista Android customer app. */
const BORZO_ANDROID_PACKAGE = "com.dostavista.android.client"

function isMobileUa(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "")
}

function isAndroidUa(): boolean {
  return /Android/i.test(navigator.userAgent || "")
}

/**
 * On Android: intent URL opens the app if installed, else browser_fallback_url.
 * On iOS / desktop: open the https booking page (App Links may hand off to the app).
 */
function openExternalAppOrWeb(opts: {
  webUrl: string
  androidPackage: string
  androidHostPath: string
}): void {
  if (isAndroidUa()) {
    const fallback = encodeURIComponent(opts.webUrl)
    const intent = `intent://${opts.androidHostPath}#Intent;scheme=https;package=${opts.androidPackage};S.browser_fallback_url=${fallback};end`
    window.location.href = intent
    return
  }
  if (isMobileUa()) {
    // iOS: https App Link / Universal Link — opens app when installed, else Safari.
    window.location.href = opts.webUrl
    return
  }
  window.open(opts.webUrl, "_blank", "noopener,noreferrer")
}

export function mapsSearchUrl(buildingOrLocality: string): string {
  const q = buildingOrLocality.trim() || "Mumbai"
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/** Opens Borzo India — prefers the Borzo app on mobile when installed. */
export function openBorzo(): void {
  openExternalAppOrWeb({
    webUrl: BORZO_INDIA_URL,
    androidPackage: BORZO_ANDROID_PACKAGE,
    androidHostPath: "borzodelivery.com/in/",
  })
}

/** Opens Porter — prefers the Porter app on mobile when installed. */
export function openPorter(): void {
  openExternalAppOrWeb({
    webUrl: PORTER_URL,
    androidPackage: PORTER_ANDROID_PACKAGE,
    androidHostPath: "porter.in/",
  })
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
