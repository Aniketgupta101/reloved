import imageCompression from "browser-image-compression"

export type CompressImageOptions = {
  /** Max longest edge in px (default 1600 - enough for wall catalog + AI). */
  maxWidthOrHeight?: number
  /** Target max size in MB (default 0.45). */
  maxSizeMB?: number
}

function prefersNoWebWorker(): boolean {
  if (typeof navigator === "undefined") return true
  // Web Workers + camera/HEIC blobs hang or no-op on some Android WebViews / iOS Safari.
  const ua = navigator.userAgent || ""
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || !("Worker" in window)
}

async function canvasToJpeg(file: File, maxEdge: number): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement("canvas")
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bitmap.close()
      return null
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
    )
    if (!blob) return null
    const base = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo"
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() })
  } catch {
    return null
  }
}

/**
 * Compress a donor/admin photo in the browser before upload.
 * Keeps JPEG/WebP output small so analyze + submit stay fast on mobile.
 */
export async function compressImageFile(
  file: File,
  opts: CompressImageOptions = {},
): Promise<File> {
  if (!file || file.size === 0) return file

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

  const maxWidthOrHeight = opts.maxWidthOrHeight ?? 1600
  const maxSizeMB = opts.maxSizeMB ?? 0.45
  const useWebWorker = !prefersNoWebWorker()

  try {
    const compressed = await Promise.race([
      imageCompression(file, {
        maxWidthOrHeight,
        maxSizeMB,
        useWebWorker,
        fileType: "image/jpeg",
        initialQuality: 0.82,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("compress_timeout")), 20_000),
      ),
    ])
    const base = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo"
    return new File([compressed], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    })
  } catch (err) {
    console.warn("Image compression failed - trying canvas / original", err)
    const fromCanvas = await canvasToJpeg(file, maxWidthOrHeight)
    return fromCanvas || file
  }
}

export async function compressImageFiles(
  files: File[],
  opts?: CompressImageOptions,
): Promise<File[]> {
  const out: File[] = []
  for (const f of files) {
    // Sequential on mobile avoids OOM when several camera shots land at once.
    out.push(await compressImageFile(f, opts))
  }
  return out
}
