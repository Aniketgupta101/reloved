/**
 * Brand / UI static assets.
 * Prefer VITE_ASSET_BASE (Firebase Hosting) so logos and hero art load from
 * the deployed server. Falls back to same-origin `/images/...`.
 */
/**
 * Brand / UI static assets.
 * Points to Firebase Hosting (https://reloved-digital.web.app) in production so logos and
 * hero art load reliably whether the user visits via reloved.digital, Firebase Hosting, or custom domain.
 */
const ENV_ASSET_BASE =
  (import.meta.env.VITE_ASSET_BASE as string | undefined)?.replace(/\/$/, "") || ""

export const ASSET_BASE =
  ENV_ASSET_BASE ||
  (typeof window !== "undefined" &&
   window.location.hostname !== "localhost" &&
   window.location.hostname !== "127.0.0.1"
    ? "https://reloved-digital.web.app"
    : "")

/** Build an asset URL, e.g. assetUrl("/images/wall-items/dont-tell-my-mom-graphic-tee.png"). */
export function assetUrl(path: string): string {
  if (!path) return ""
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  const normalized = path.startsWith("/") ? path : `/${path}`
  return ASSET_BASE ? `${ASSET_BASE}${normalized}` : normalized
}

/** Cream paper texture for fallback surfaces. */
export const SECTION_PAPER_BG = assetUrl("/images/section-bg-paper.webp")

/** Signature courtyard wall - hanging lights shifted outward on both sides, vines, planters (WebP). */
export const COURTYARD_CONTINUE_BG = assetUrl("/images/hero-bg-desktop-lamps-wide.webp")
