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
  if (!file.type.startsWith("image/")) return file
  // Skip tiny already-compressed files.
  if (file.size > 0 && file.size < 180_000) return file

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
    return file
  }
}

export async function compressImageFiles(
  files: File[],
  opts?: CompressImageOptions,
): Promise<File[]> {
  return Promise.all(files.map((f) => compressImageFile(f, opts)))
}
