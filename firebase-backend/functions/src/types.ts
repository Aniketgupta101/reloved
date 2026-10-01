import type { Timestamp } from "firebase-admin/firestore"
import { toPublicArea } from "./lib/geo"

/**
 * Firestore document shapes for the Reloved Firebase backend.
 * Parallel to backend/prisma/schema.prisma — does not touch Express/Postgres.
 */

export type PublicStatus =
  | "available"
  | "being_matched"
  | "claimed"
  | "reloved"

export type ItemGender = "men" | "women" | "unisex" | "kids"

export interface ItemImageDoc {
  storagePath: string
  /** "original" = donor photo; "modelled" = AI studio cutout; legacy may be "product". */
  imageType: string
  sortOrder: number
  bgRemoved?: boolean
}

/**
 * Public gallery (strict):
 *   [0] modelled AI (main Wall card — Gemini studio photoshoot)
 *   [1..] donor original (background-removed preferred, fallback to raw donor upload)
 * Never mixes other product rows or duplicate AI shots.
 */
export function normalizePublicImages(
  images: ItemImageDoc[] | undefined | null,
  donorOriginalPaths?: string[] | null,
) {
  const mapped = [...(images || [])]
    .map((img, i) => ({
      storagePath: String(img.storagePath || "").trim(),
      imageType: img.imageType || "product",
      sortOrder: img.sortOrder ?? i,
      bgRemoved: Boolean((img as ItemImageDoc).bgRemoved),
    }))
    .filter((img) => Boolean(img.storagePath))

  // If there's no original in mapped images, but donorOriginalPaths exists, recover it!
  const hasOriginal = mapped.some((img) => img.imageType === "original")
  if (!hasOriginal && Array.isArray(donorOriginalPaths) && donorOriginalPaths.length > 0) {
    for (let i = 0; i < donorOriginalPaths.length; i++) {
      const p = String(donorOriginalPaths[i] || "").trim()
      if (p && !mapped.some((img) => img.storagePath === p)) {
        mapped.push({
          storagePath: p,
          imageType: "original",
          sortOrder: mapped.length,
          bgRemoved: false,
        })
      }
    }
  }

  if (mapped.length === 0) return []

  const seen = new Set<string>()
  const unique = mapped.filter((img) => {
    if (seen.has(img.storagePath)) return false
    seen.add(img.storagePath)
    return true
  })

  const modelled =
    unique.find((img) => img.imageType === "modelled") ||
    // Legacy fallback: one polished product hero only when no typed modelled exists.
    unique.find((img) => img.bgRemoved && img.imageType !== "original") ||
    null

  const cleanOriginals = unique
    .filter((img) => {
      if (modelled && img.storagePath === modelled.storagePath) return false
      return img.imageType === "original" && img.bgRemoved === true
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // Prefer clean cutouts; if BG-removal ate the garment (ghost), fall back to raw donor
  // so swipe-2 is still a real photo instead of an invisible outline.
  const rawOriginals = unique
    .filter((img) => {
      if (modelled && img.storagePath === modelled.storagePath) return false
      return img.imageType === "original" && img.bgRemoved !== true
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const originals = cleanOriginals.length > 0 ? cleanOriginals : rawOriginals

  const out: typeof mapped = []
  if (modelled) {
    out.push({ ...modelled, imageType: "modelled", sortOrder: 0 })
  }
  for (const orig of originals) {
    out.push({ ...orig, imageType: "original", sortOrder: out.length })
  }

  // Guarantee 2 images on the Wall: If only 1 image (e.g. modelled only), append raw original
  if (out.length === 1 && rawOriginals.length > 0) {
    out.push({ ...rawOriginals[0], imageType: "original", sortOrder: 1 })
  } else if (out.length === 1 && Array.isArray(donorOriginalPaths) && donorOriginalPaths.length > 0) {
    const rawPath = String(donorOriginalPaths[0] || "").trim()
    if (rawPath && rawPath !== out[0].storagePath) {
      out.push({ storagePath: rawPath, imageType: "original", sortOrder: 1, bgRemoved: false })
    }
  }

  if (out.length > 0) return out
  return [{ ...unique[0], sortOrder: 0 }]
}

export interface ItemDoc {
  slug: string
  title: string
  category: string
  description: string
  quantity: number
  brand: string | null
  size: string | null
  condition: string
  gender: ItemGender | null
  locality: string
  donorRecognition: string | null
  status: string
  publicStatus: PublicStatus
  publicVisibility: boolean
  imageProcessingStatus?: "processing" | "ready" | string
  images: ItemImageDoc[]
  donorOriginalPaths?: string[]
  originalImage?: string | null
  enhancedImage?: string | null
  cutoutImage?: string | null
  createdAt: Timestamp | Date
  updatedAt: Timestamp | Date
}

export interface WaitlistSignupDoc {
  name: string
  email: string
  phone: string | null
  locality: string | null
  note: string | null
  createdAt: Timestamp | Date
}

/** API response shape matching the existing Express frontend contract. */
export function toPublicItem(id: string, doc: ItemDoc) {
  const storedPublic = String(
    (doc as ItemDoc & { publicArea?: string | null }).publicArea || "",
  ).trim()
  const fullLocality =
    (doc as ItemDoc & { pickupLocality?: string | null }).pickupLocality || doc.locality
  // Prefer stored publicArea (set from giver profile address on drop / backfill).
  // Recompute only when missing so one-off pickup text cannot override the account area.
  const publicLocality = storedPublic || toPublicArea(fullLocality)

  const donorOriginalPaths = (doc as any).donorOriginalPaths || []
  const rawOriginalUrl =
    (Array.isArray(donorOriginalPaths) && donorOriginalPaths[0]) ||
    (doc as any).originalImage ||
    (doc.images || []).find((img) => img.imageType === "original" && !img.bgRemoved)?.storagePath ||
    null
  const enhancedUrl =
    (doc as any).enhancedImage ||
    (doc.images || []).find((img) => img.imageType === "modelled")?.storagePath ||
    null
  const cutoutUrl =
    (doc as any).cutoutImage ||
    (doc.images || []).find((img) => img.imageType === "original" && img.bgRemoved === true)?.storagePath ||
    null

  return {
    id,
    slug: doc.slug,
    title: doc.title,
    category: doc.category,
    description: doc.description,
    quantity: doc.quantity,
    brand: doc.brand,
    size: doc.size,
    condition: doc.condition,
    gender: doc.gender,
    // Never expose exact building/flat/wing on public wall or item detail.
    locality: publicLocality,
    donorRecognition: doc.donorRecognition,
    status: doc.status,
    publicStatus: doc.publicStatus,
    publicVisibility: doc.publicVisibility,
    imageProcessingStatus:
      (doc as ItemDoc).imageProcessingStatus ||
      (doc.publicVisibility ? "ready" : "processing"),
    giverLogistics: (doc as ItemDoc & { giverLogistics?: string }).giverLogistics || null,
    matchRadiusKm: (doc as ItemDoc & { giverLogistics?: string }).giverLogistics === "giver_sends" ? 3 : null,
    images: normalizePublicImages(doc.images, donorOriginalPaths),
    originalImage: rawOriginalUrl,
    enhancedImage: enhancedUrl,
    cutoutImage: cutoutUrl,
    createdAt: doc.createdAt,
  }
}
