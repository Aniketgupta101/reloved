import imageCompression from "browser-image-compression"

export type CompressImageOptions = {
  /** Max longest edge in px (default 1600 - enough for wall catalog + AI). */
  maxWidthOrHeight?: number
  /** Target max size in MB (default 0.45). */
  maxSizeMB?: number
}

/**
 * Compress a donor/admin photo in the browser before upload.
 * Keeps JPEG/WebP output small so analyze + submit stay fast on mobile.
 */
export async function compressImageFile(
  file: File,
  opts: CompressImageOptions = {},
): Promise<File> {
  const nameLower = (file.name || "").toLowerCase()
  const looksLikeImage =
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|heic|heif|bmp|avif)$/i.test(nameLower) ||
    !file.type // iOS often sends empty MIME for camera roll picks

  if (!looksLikeImage) return file
  // Skip tiny already-compressed files (but still convert HEIC / empty-type).
  const needsForceJpeg =
    !file.type ||
    /heic|heif/i.test(file.type) ||
    /\.(heic|heif)$/i.test(nameLower)
  if (!needsForceJpeg && file.size > 0 && file.size < 180_000) return file

  try {
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: opts.maxWidthOrHeight ?? 1600,
      maxSizeMB: opts.maxSizeMB ?? 0.45,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.82,
    })
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg"
    return new File([compressed], name, {
      type: "image/jpeg",
      lastModified: Date.now(),
    })
  } catch (err) {
    console.warn("Image compression failed - uploading original", err)
    // Last resort: if browser can decode, canvas → JPEG (helps HEIC on some Safari builds).
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement("canvas")
      const maxEdge = opts.maxWidthOrHeight ?? 1600
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const ctx = canvas.getContext("2d")
      if (!ctx) return file
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
      )
      if (!blob) return file
      const name = file.name.replace(/\.[^.]+$/, "") + ".jpg"
      return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() })
    } catch {
      return file
    }
  }
}

export async function compressImageFiles(
  files: File[],
  opts?: CompressImageOptions,
): Promise<File[]> {
  return Promise.all(files.map((f) => compressImageFile(f, opts)))
}
