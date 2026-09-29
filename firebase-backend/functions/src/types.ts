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
export function normalizePublicImages(images: ItemImageDoc[] | undefined | null) {
  const mapped = [...(images || [])]
    .map((img, i) => ({
      storagePath: String(img.storagePath || "").trim(),
      imageType: img.imageType || "product",
      sortOrder: img.sortOrder ?? i,
      bgRemoved: Boolean((img as ItemImageDoc).bgRemoved),
    }))
    .filter((img) => Boolean(img.storagePath))

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

  const originals = unique
    .filter((img) => {
      if (modelled && img.storagePath === modelled.storagePath) return false
      if (img.imageType === "original") return true
      if (img.imageType === "modelled") return false
      // Untyped donor upload (room photo) only — never other polished product rows.
      return img.bgRemoved !== true
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const out: typeof mapped = []
  if (modelled) {
    out.push({ ...modelled, imageType: "modelled", sortOrder: 0 })
  }
  for (const orig of originals) {
    out.push({ ...orig, imageType: "original", sortOrder: out.length })
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
    images: normalizePublicImages(doc.images),
    createdAt: doc.createdAt,
  }
}
