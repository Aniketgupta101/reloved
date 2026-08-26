/** Static media hosted on cPanel (reloved.digital) — not bundled with each deploy. */
export const ASSET_BASE = "https://reloved.digital"

/** Build an absolute asset URL, e.g. assetUrl("/images/wall-items/IMG_6293.png"). */
export function assetUrl(path: string): string {
  if (!path) return ""
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  const normalized = path.startsWith("/") ? path : `/${path}`
  return `${ASSET_BASE}${normalized}`
}
