/**
 * Client-side image cache so Wall/detail photos don't re-download on every visit.
 * Uses Cache Storage for remote URLs + sessionStorage for Wall fill display URLs.
 */

const CACHE_NAME = "reloved-images-v5-white"
const FILL_URL_KEY = "reloved-wall-fill-urls-v7-white"

function canUseCaches(): boolean {
  return typeof window !== "undefined" && typeof caches !== "undefined"
}

/** Warm the HTTP cache for a product image URL (no-op if already cached). */
export async function prefetchImage(url: string | null | undefined): Promise<void> {
  const src = String(url || "").trim()
  if (!src || src.startsWith("blob:") || src.startsWith("data:")) return
  if (!canUseCaches()) return
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(src)
    if (hit) return
    const res = await fetch(src, { mode: "cors", credentials: "omit", cache: "force-cache" })
    if (res.ok) await cache.put(src, res.clone())
  } catch {
    // Cross-origin without CORS / offline — browser HTTP cache still helps when headers allow.
  }
}

export function readPersistedFillUrl(src: string): string | undefined {
  if (typeof sessionStorage === "undefined") return undefined
  try {
    const raw = sessionStorage.getItem(FILL_URL_KEY)
    if (!raw) return undefined
    const map = JSON.parse(raw) as Record<string, string>
    return map[src] || undefined
  } catch {
    return undefined
  }
}

export function persistFillUrl(src: string, displayUrl: string): void {
  if (typeof sessionStorage === "undefined") return
  if (!src || !displayUrl || displayUrl.startsWith("blob:")) return
  try {
    const raw = sessionStorage.getItem(FILL_URL_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    map[src] = displayUrl
    // Cap entries so sessionStorage stays small.
    const keys = Object.keys(map)
    if (keys.length > 80) {
      for (const k of keys.slice(0, keys.length - 80)) delete map[k]
    }
    sessionStorage.setItem(FILL_URL_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode */
  }
}
