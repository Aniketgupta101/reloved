/**
 * Brand / UI static assets.
 * Prefer VITE_ASSET_BASE (Firebase Hosting) so logos and hero art load from
 * the deployed server. Falls back to same-origin `/images/...`.
 */
export const ASSET_BASE =
  (import.meta.env.VITE_ASSET_BASE as string | undefined)?.replace(/\/$/, "") || ""

/** Build an asset URL, e.g. assetUrl("/images/wall-items/dont-tell-my-mom-graphic-tee.png"). */
export function assetUrl(path: string): string {
  if (!path) return ""
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  const normalized = path.startsWith("/") ? path : `/${path}`
  return ASSET_BASE ? `${ASSET_BASE}${normalized}` : normalized
}

/** Cream paper texture for every public surface except the Home hero. */
export const SECTION_PAPER_BG = assetUrl("/images/section-bg-paper.webp")

/** Home courtyard wall - hanging lights shifted outward on both sides (WebP). */
export const COURTYARD_CONTINUE_BG = assetUrl("/images/hero-bg-desktop-lamps-wide.webp")
