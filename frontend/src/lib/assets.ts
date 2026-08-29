/**
 * Brand / UI static assets.
 * In local Vite (and Firebase Hosting) prefer same-origin `/images/...`
 * so wall cutouts don't wait on the external CDN. Override with VITE_ASSET_BASE
 * if you need to force cPanel (https://reloved.digital).
 */
export const ASSET_BASE =
  (import.meta.env.VITE_ASSET_BASE as string | undefined)?.replace(/\/$/, "") || ""

/** Cream paper texture for every public surface except the Home hero. */
export const SECTION_PAPER_BG = "/images/section-bg-paper.webp"

/** Home courtyard wall - lamps shifted slightly toward both corners (WebP). */
export const COURTYARD_CONTINUE_BG = "/images/hero-bg-desktop-lamps-corners.webp"

/** Build an asset URL, e.g. assetUrl("/images/wall-items/dont-tell-my-mom-graphic-tee.png"). */
export function assetUrl(path: string): string {
  if (!path) return ""
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  const normalized = path.startsWith("/") ? path : `/${path}`
  return ASSET_BASE ? `${ASSET_BASE}${normalized}` : normalized
}
