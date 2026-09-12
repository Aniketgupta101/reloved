import type { UploadedFile } from "./multipart"
import { uploadImage } from "./storage"

const LIGHTSAIL_ANALYZE_URL =
  process.env.PHOTO_ANALYZE_RELAY_URL ||
  "https://3-110-214-193.sslip.io/api/donations/analyze-photos"
const LIGHTSAIL_ORIGIN = process.env.PHOTO_ANALYZE_ORIGIN || "https://3-110-214-193.sslip.io"

export type AnalyzeSuggestion = {
  title: string
  category: string
  gender: string
  description: string
  condition: string
  brand: string | null
}

export type AnalyzeOk = {
  ok: true
  originalName: string
  storagePath: string
  url: string
  suggestion: AnalyzeSuggestion
}

export type AnalyzeFail = {
  ok: false
  originalName: string
  error: string
}

export type AnalyzeResponse = {
  results: Array<AnalyzeOk | AnalyzeFail>
  categories: string[]
  conditions: string[]
  genders: string[]
}

function absoluteMediaUrl(pathOrUrl: string | undefined | null): string {
  if (!pathOrUrl) return ""
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl
  if (pathOrUrl.startsWith("/")) return `${LIGHTSAIL_ORIGIN}${pathOrUrl}`
  return `${LIGHTSAIL_ORIGIN}/uploads/${pathOrUrl}`
}

export function buildPhotosMultipart(files: UploadedFile[]) {
  const boundary = `----RelovedBoundary${Date.now()}`
  const chunks: Buffer[] = []
  for (const file of files) {
    const safeName = (file.filename || "photo.jpg").replace(/"/g, "")
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${safeName}"\r\nContent-Type: ${
          file.mimeType || "image/jpeg"
        }\r\n\r\n`
      )
    )
    chunks.push(file.buffer)
    chunks.push(Buffer.from("\r\n"))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

async function rehostProcessedImage(url: string): Promise<string> {
  try {
    const res = await fetch(url)
    if (!res.ok) return url
    const buf = Buffer.from(await res.arrayBuffer())
    const ctype = res.headers.get("content-type") || "image/png"
    const saved = await uploadImage(buf, "donations", ctype)
    return saved.url
  } catch (err) {
    console.warn("Could not rehost processed photo to Firebase Storage, using Lightsail URL:", err)
    return url
  }
}

/**
 * Runs Lightsail Give/bulk pipeline: background → white + Gemini suggestions.
 * Used by both /api/donations/analyze-photos and /api/admin/bulk-upload/analyze.
 */
export async function analyzePhotosViaLightsail(files: UploadedFile[]): Promise<AnalyzeResponse> {
  if (files.length === 0) {
    throw Object.assign(new Error("No photos uploaded"), { status: 400 })
  }

  const { body, contentType } = buildPhotosMultipart(files)
  const relayRes = await fetch(LIGHTSAIL_ANALYZE_URL, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  })
  const relayText = await relayRes.text()
  if (!relayRes.ok) {
    console.error("Lightsail analyze-photos failed:", relayRes.status, relayText.slice(0, 400))
    throw Object.assign(new Error("Couldn't analyze that photo right now. Please try again."), {
      status: 502,
    })
  }

  const payload = JSON.parse(relayText) as {
    results?: Array<
      | {
          ok: true
          originalName: string
          storagePath: string
          url?: string
          suggestion: AnalyzeSuggestion
        }
      | { ok: false; originalName: string; error: string }
    >
    categories?: string[]
    conditions?: string[]
    genders?: string[]
  }

  const results: Array<AnalyzeOk | AnalyzeFail> = []
  for (const r of payload.results || []) {
    if (!r.ok) {
      results.push(r)
      continue
    }
    const absolute = absoluteMediaUrl(r.url || r.storagePath)
    const hosted = await rehostProcessedImage(absolute)
    results.push({
      ok: true,
      originalName: r.originalName,
      storagePath: hosted,
      url: hosted,
      suggestion: r.suggestion,
    })
  }

  return {
    results,
    categories: payload.categories || ["Clothing", "Footwear", "Bags"],
    conditions: payload.conditions || ["Excellent", "Good", "Fair but fully usable"],
    genders: payload.genders || ["men", "women", "unisex", "kids"],
  }
}
