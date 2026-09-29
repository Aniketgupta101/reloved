import { resolveImageUrl } from "@/lib/api"
import { persistentPreviewUrl } from "@/lib/givePhotoDraft"
import { normalizeItemGender, normalizeLaunchCategory, type GiverLogistics } from "@shared/taxonomy"

export const PICKUP_LOCALITY_MAX = 500
export const BULK_PHOTO_LIMIT = 30
/** One donor photo per item — server adds a single AI modelled version. */
export const SINGLE_PHOTO_LIMIT = 1
export const DATE_RANGE_PRESETS = ["24 hr", "48 hr", "1 week", "Flexible"]
export const TIME_WINDOW_PRESETS = ["Mornings", "Afternoons", "Evenings", "Weekends only"]

export interface ItemSuggestion {
  category: string
  title: string
  description: string
  condition: string
  brand: string | null
  gender: string
  size?: string | null
  sensitiveDetected?: boolean
  sensitiveReason?: string | null
}

export interface PhotoItem {
  photoId: string
  /** Present while this page is open. Not restored from a draft. */
  file?: File
  previewUrl: string
  status: "pending" | "analyzing" | "done" | "error"
  storagePath?: string
  /** Donor upload (kept when AI modelled path is also present). */
  originalStoragePath?: string
  /** AI studio cutout path. */
  modelledStoragePath?: string
  groupId: number
  suggestion?: ItemSuggestion
  bgRemoved?: boolean
  sensitiveDetected?: boolean
  sensitiveReason?: string | null
}

export type ItemDraft = {
  itemTitle: string
  category: string
  gender: string
  description: string
  condition: string
  size: string
  brand: string
  age: string
  defect: string
  quantity: number
}

export type GiveForm = {
  itemTitle: string
  category: string
  gender: string
  description: string
  condition: string
  size: string
  quantity: number
  brand: string
  age: string
  defect: string
  firstName: string
  lastName: string
  phone: string
  email: string
  contactMethod: string
  recognitionPreference: string
  aliasName: string
  city: string
  pincode: string
  pickupLocality: string
  dateRange: string
  timeWindow: string
  notes: string
  declaration: boolean
  acceptedTerms: boolean
  giverLogistics: GiverLogistics
  deliveryAddress: string
  porterPaidBy: "" | "receiver" | "giver"
  latitude: number | null
  longitude: number | null
}

export function emptyItemDraft(): ItemDraft {
  return {
    itemTitle: "",
    category: "Tops",
    gender: "unisex",
    description: "",
    condition: "Good",
    size: "",
    brand: "",
    age: "",
    defect: "",
    quantity: 1,
  }
}

export function draftFromSuggestion(sug?: ItemSuggestion | null): ItemDraft {
  const base = emptyItemDraft()
  if (!sug) return base
  const gender = normalizeItemGender(sug.gender) || base.gender
  const kids = gender === "girls" || gender === "boys"
  const sizeRaw = String(sug.size || "").trim()
  return {
    ...base,
    itemTitle: sug.title || "",
    category: normalizeLaunchCategory(sug.category),
    gender,
    description: sug.description || "",
    condition: sug.condition || "Good",
    brand: sug.brand || "",
    size: sizeRaw,
    age: kids ? sizeRaw : "",
  }
}

export async function hydratePhotoFile(p: PhotoItem): Promise<PhotoItem> {
  const stored = persistentPreviewUrl(p.storagePath, resolveImageUrl)
  if (stored) return { ...p, previewUrl: stored, status: "done" }
  if (p.file && p.file.size > 0) return p
  return p
}
