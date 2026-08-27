import type { Timestamp } from "firebase-admin/firestore"

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
  imageType: string
  sortOrder: number
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
    locality: doc.locality,
    donorRecognition: doc.donorRecognition,
    status: doc.status,
    publicStatus: doc.publicStatus,
    publicVisibility: doc.publicVisibility,
    images: (doc.images || []).map((img, i) => ({
      storagePath: img.storagePath,
      imageType: img.imageType,
      sortOrder: img.sortOrder ?? i,
    })),
    createdAt: doc.createdAt,
  }
}
