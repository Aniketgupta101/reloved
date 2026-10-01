/**
 * Drop-photo identity and per-item submit keys.
 * A browser File does not survive leaving /give. Drafts keep storagePath only.
 */

export const PHOTO_NOT_STORED_MESSAGE =
  "We couldn’t save your photo before sign-in. Stay on this page and try again. Your other details are still here."

export function newPhotoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `give-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Same group keeps its key across a retry. A different group never shares it. */
export function idempotencyKeyForGroup(
  store: Map<number, string>,
  groupId: number,
  make: () => string = newIdempotencyKey,
): string {
  const existing = store.get(groupId)
  if (existing) return existing
  const key = make()
  store.set(groupId, key)
  return key
}

export type DonationPostResult = {
  reference?: string
  itemId?: string
  idempotentReplay?: boolean
}

/**
 * A replay is the same item for the key we sent.
 * The same itemId coming back for a different key is another photo, not a success.
 */
export function acceptDonationResult(
  itemOwner: Map<string, string>,
  sentKey: string,
  result: DonationPostResult,
): boolean {
  if (!result.itemId && !result.reference) return false
  if (!result.itemId) return true
  const owner = itemOwner.get(result.itemId)
  if (owner && owner !== sentKey) return false
  itemOwner.set(result.itemId, sentKey)
  return true
}

export function uploadNameForPhoto(photoId: string, ext: string): string {
  const safeId = photoId.replace(/[^a-zA-Z0-9_-]/g, "") || "photo"
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg"
  return `give-${safeId}.${safeExt}`
}

export function withUniquePhotoName(file: File, photoId: string): File {
  const rawExt = file.name.includes(".") ? file.name.split(".").pop() || "jpg" : "jpg"
  return new File([file], uploadNameForPhoto(photoId, rawExt), {
    type: file.type || "image/jpeg",
    lastModified: file.lastModified || Date.now(),
  })
}

type NamedResult = { originalName?: string; filename?: string }

/** Match analyze results by photo id, then by index. Never by the user's filename. */
export function assignChunkResults<T extends NamedResult>(
  photos: { photoId: string }[],
  chunkResults: T[],
): (T | { ok: false; error: string })[] {
  return photos.map((photo, index) => {
    const byId = chunkResults.find((result) => {
      const name = result.originalName || result.filename || ""
      return name.includes(photo.photoId)
    })
    if (byId) return byId
    const byIndex = chunkResults[index]
    if (!byIndex) return { ok: false, error: "no result" }
    const name = byIndex.originalName || byIndex.filename || ""
    const namesAnother = photos.some(
      (other) => other.photoId !== photo.photoId && name.includes(other.photoId),
    )
    if (namesAnother) return { ok: false, error: "no result" }
    return byIndex
  })
}

export interface PhotoDraftItem {
  photoId: string
  file?: File
  storagePath?: string
  originalStoragePath?: string
  modelledStoragePath?: string
  cutoutStoragePath?: string
  previewUrl?: string
  [key: string]: any
}

export function mergePhotosById<
  T extends { photoId: string; [key: string]: any },
  U extends { photoId: string; [key: string]: any } = T,
>(prev: T[], next: U[]): (T & U)[] {
  return prev.map((photo) => {
    const updated = next.find((item) => item.photoId && item.photoId === photo.photoId)
    if (!updated) return photo as T & U
    const nextFile = (updated as any).file && (updated as any).file.size > 0 ? (updated as any).file : (photo as any).file
    return {
      ...photo,
      ...updated,
      photoId: photo.photoId,
      file: nextFile,
      storagePath: updated.storagePath || (photo as any).storagePath,
      originalStoragePath: updated.originalStoragePath || (photo as any).originalStoragePath,
      modelledStoragePath: updated.modelledStoragePath || (photo as any).modelledStoragePath,
      cutoutStoragePath: updated.cutoutStoragePath || (photo as any).cutoutStoragePath,
      previewUrl: updated.previewUrl || (photo as any).previewUrl,
    } as T & U
  })
}

/** Draft preview after navigation. Blob and data URLs are not persistent. */
export function persistentPreviewUrl(
  storagePath: string | undefined,
  resolve: (path: string) => string,
): string | null {
  if (!storagePath) return null
  const url = resolve(storagePath)
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return null
  return url
}

/** Null means every selected photo already has a storage path. */
export function canLeaveForLogin(photos: { storagePath?: string }[]): string | null {
  if (photos.every((photo) => Boolean(photo.storagePath))) return null
  return PHOTO_NOT_STORED_MESSAGE
}
