import { sortByGenderMatch } from "./genderMatch.ts"

export const WALL_PAGE_SIZE = 24

export type WallListItem = {
  id: string
  slug: string
  title: string
  category: string
  condition: string
  locality: string
  size?: string | null
  gender?: string | null
  public_status: string
  imageProcessingStatus?: string | null
  publicVisibility?: boolean
  item_images: { storage_path: string }[]
}

type ApiWallItem = {
  id?: string
  slug?: string
  title?: string
  category?: string
  condition?: string
  locality?: string
  size?: string | null
  gender?: string | null
  publicStatus?: string
  imageProcessingStatus?: string | null
  publicVisibility?: boolean
  images?: { storagePath?: string }[]
}

type MapOpts = {
  sortByGender?: boolean
  /** Defaults to identity; pass resolveImageUrl from the app. */
  resolveUrl?: (storagePath: string | null | undefined) => string
}

/** Same live-wall filters the home Wall section already used. */
export function mapApiItemsToWall(
  data: ApiWallItem[],
  preferGender?: string | null,
  opts?: MapOpts,
): WallListItem[] {
  const resolve = opts?.resolveUrl || ((path: string | null | undefined) => String(path || ""))
  const live = (data || []).filter(
    (item) =>
      ["available", "being_matched", "claimed"].includes(String(item.publicStatus || "")) &&
      (item.images || []).some(
        (img) =>
          Boolean(img.storagePath) && !String(img.storagePath).includes("unsplash.com"),
      ),
  )
  const mapped: WallListItem[] = live.map((item) => ({
    id: String(item.id || ""),
    slug: String(item.slug || ""),
    title: String(item.title || ""),
    category: String(item.category || ""),
    condition: String(item.condition || ""),
    locality: String(item.locality || ""),
    size: item.size,
    gender: item.gender,
    public_status: String(item.publicStatus || ""),
    imageProcessingStatus: item.imageProcessingStatus,
    publicVisibility: item.publicVisibility,
    item_images: (item.images || []).map((img) => ({
      storage_path: resolve(img.storagePath),
    })),
  }))
  if (opts?.sortByGender === false) return mapped.filter((item) => item.id)
  return sortByGenderMatch(
    mapped.filter((item) => item.id),
    preferGender,
  )
}

export function appendWallItems(existing: WallListItem[], incoming: WallListItem[]): WallListItem[] {
  if (!incoming.length) return existing
  const seen = new Set(existing.map((item) => item.id))
  const add = incoming.filter((item) => item.id && !seen.has(item.id))
  if (!add.length) return existing
  return [...existing, ...add]
}

export function wallItemsQuery(cursor?: string | null, limit = WALL_PAGE_SIZE): string {
  const params = new URLSearchParams()
  params.set("status", "wall")
  params.set("limit", String(limit))
  if (cursor) params.set("cursor", cursor)
  return `/api/items?${params.toString()}`
}
