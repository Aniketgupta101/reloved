/**
 * Brand / UI static assets live on cPanel (reloved.digital).
 * Wall item cutouts are absolute URLs from the API host in the DB.
 */
export const ASSET_BASE =
  (import.meta.env.VITE_ASSET_BASE as string | undefined)?.replace(/\/$/, "") ||
  "https://reloved.digital"

/** Cream paper texture for every public surface except the Home hero. */
export const SECTION_PAPER_BG = "/images/section-bg-paper.png"

/** Home courtyard wall — lamps shifted slightly toward both corners. */
export const COURTYARD_CONTINUE_BG = "/images/hero-bg-desktop-lamps-corners.png"

/** Build an absolute asset URL, e.g. assetUrl("/images/wall-items/dont-tell-my-mom-graphic-tee.png"). */
export function assetUrl(path: string): string {
  if (!path) return ""
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  const normalized = path.startsWith("/") ? path : `/${path}`
  return `${ASSET_BASE}${normalized}`
}
