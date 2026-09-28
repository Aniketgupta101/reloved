/**
 * Opaque cursor for Wall item lists after the merged/filtered sort is built.
 * Multi-status wall queries cannot use a single Firestore startAfter; we paginate
 * the stable in-memory list by last seen item id.
 */

export type WallCursor = { id: string }

export function encodeWallCursor(cursor: WallCursor): string {
  const id = String(cursor.id || "").trim()
  if (!id) return ""
  return Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url")
}

export function decodeWallCursor(raw: unknown): WallCursor | null {
  const text = String(raw || "").trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(Buffer.from(text, "base64url").toString("utf8")) as { id?: unknown }
    const id = String(parsed?.id || "").trim()
    return id ? { id } : null
  } catch {
    return null
  }
}

export function parseWallLimit(raw: unknown, fallback = 24): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, 100)
}

export function sliceWallPage<T extends { id: string }>(
  items: T[],
  limit: number,
  cursor: WallCursor | null,
): { page: T[]; nextCursor: string | null; hasMore: boolean } {
  let start = 0
  if (cursor?.id) {
    const idx = items.findIndex((item) => item.id === cursor.id)
    start = idx >= 0 ? idx + 1 : 0
  }
  const page = items.slice(start, start + limit)
  const end = start + page.length
  const hasMore = end < items.length
  const last = page[page.length - 1]
  return {
    page,
    nextCursor: hasMore && last ? encodeWallCursor({ id: last.id }) : null,
    hasMore,
  }
}
