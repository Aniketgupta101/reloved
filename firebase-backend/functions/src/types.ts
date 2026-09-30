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
 *   [0] modelled AI (main Wall card)
 *   [1..] every donor original (BG-removed preferred)
 * Never mixes other product rows or duplicate AI shots.
 */
export function normalizePublicImages(
  images: ItemImageDoc[] | undefined | null,
  donorOriginalPaths?: string[],
  fallbackOriginal?: string | null,
  fallbackModelled?: string | null,
) {
  const mapped = [...(images || [])]
    .map((img, i) => ({
      storagePath: String(img.storagePath || "").trim(),
      imageType: (img.imageType || (img.bgRemoved ? "modelled" : "original")) as "modelled" | "original" | "product",
      sortOrder: img.sortOrder ?? i,
      bgRemoved: Boolean((img as ItemImageDoc).bgRemoved),
    }))
    .filter((img) => Boolean(img.storagePath))

  // Include donor originals if missing from mapped images
  const existingPaths = new Set(mapped.map((m) => m.storagePath))
  if (Array.isArray(donorOriginalPaths)) {
    donorOriginalPaths.forEach((path, idx) => {
      const p = String(path || "").trim()
      if (p && !existingPaths.has(p)) {
        mapped.push({
          storagePath: p,
          imageType: "original",
          sortOrder: 100 + idx,
          bgRemoved: false,
        })
        existingPaths.add(p)
      }
    })
  }

  // Include fallback original if still missing
  const trimmedFallbackOrig = String(fallbackOriginal || "").trim()
  if (trimmedFallbackOrig && !existingPaths.has(trimmedFallbackOrig)) {
    mapped.push({
      storagePath: trimmedFallbackOrig,
      imageType: "original",
      sortOrder: 200,
      bgRemoved: false,
    })
    existingPaths.add(trimmedFallbackOrig)
  }

  // Include fallback modelled if missing
  const trimmedFallbackModelled = String(fallbackModelled || "").trim()
  if (trimmedFallbackModelled && !existingPaths.has(trimmedFallbackModelled)) {
    mapped.unshift({
      storagePath: trimmedFallbackModelled,
      imageType: "modelled",
      sortOrder: -1,
      bgRemoved: true,
    })
    existingPaths.add(trimmedFallbackModelled)
  }

  if (mapped.length === 0) return []

  // Extract distinct enhanced / modelled photos
  const modelledList = mapped.filter(
    (img) => img.imageType === "modelled" || (img.bgRemoved && img.imageType !== "original"),
  )

  // Extract distinct raw original photos
  const originalList = mapped.filter(
    (img) => img.imageType === "original" || (!img.bgRemoved && img.imageType !== "modelled"),
  )

  // Interleave each Enhanced photo with its corresponding Original photo:
  // [Image 1 Enhanced, Image 1 Original, Image 2 Enhanced, Image 2 Original, ...]
  const out: typeof mapped = []
  const seenInOutput = new Set<string>()
  const maxLen = Math.max(modelledList.length, originalList.length)

  for (let i = 0; i < maxLen; i++) {
    const m = modelledList[i]
    if (m && !seenInOutput.has(m.storagePath)) {
      out.push({ ...m, imageType: "modelled", sortOrder: out.length })
      seenInOutput.add(m.storagePath)
    }
    const o = originalList[i]
    if (o && !seenInOutput.has(o.storagePath)) {
      out.push({ ...o, imageType: "original", sortOrder: out.length })
      seenInOutput.add(o.storagePath)
    }
  }

  if (out.length > 0) return out
  return [{ ...mapped[0], sortOrder: 0 }]
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
  originalStoragePath?: string | null
  enhancedStoragePath?: string | null
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

  const normalizedImages = normalizePublicImages(
    doc.images,
    doc.donorOriginalPaths,
    doc.originalImage,
    doc.enhancedImage,
  )
  const rawOriginal =
    doc.originalImage ||
    doc.donorOriginalPaths?.[0] ||
    normalizedImages.find((img) => img.imageType === "original")?.storagePath ||
    (normalizedImages.length > 1 ? normalizedImages[1]?.storagePath : null) ||
    normalizedImages[0]?.storagePath ||
    null
  const modelled =
    doc.enhancedImage ||
    normalizedImages.find((img) => img.imageType === "modelled")?.storagePath ||
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
    originalImage: rawOriginal,
    enhancedImage: modelled,
    images: normalizedImages,
    createdAt: doc.createdAt,
  }
}
