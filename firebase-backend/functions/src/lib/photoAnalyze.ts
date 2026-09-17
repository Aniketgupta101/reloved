/**
 * Native Firebase photo analysis: Gemini item suggestions + bg removal.
 *
 * Pipeline per photo:
 *  1) If REMOVE_BG_API_KEY set → remove.bg with white background (JPEG)
 *  2) Else Gemini image edit (gemini-2.5-flash-image) → white studio background
 *  3) Else keep original bytes (AI fill still works)
 *  4) Gemini text model suggests title/category/gender/description/condition/brand
 *  5) Upload processed image to Firebase Storage
 */
import { GoogleAuth } from "google-auth-library"
import type { UploadedFile } from "./multipart"
import { uploadImage } from "./storage"

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
  filename: string
  storagePath: string
  url: string
  suggestion: AnalyzeSuggestion
}

export type AnalyzeFail = {
  ok: false
  originalName: string
  filename: string
  error: string
}

export type AnalyzeResponse = {
  results: Array<AnalyzeOk | AnalyzeFail>
  firstSuggestion: AnalyzeSuggestion | null
  categories: string[]
  conditions: string[]
  genders: string[]
}

const CATEGORIES = ["Outerwear", "Tops", "Bottoms", "Kicks", "Bags", "Accessories"]
const CONDITIONS = ["Excellent", "Good", "Fair but fully usable"]
const GENDERS = ["men", "women", "girls", "boys", "unisex"]

const PRIMARY_MODEL = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim()
// Cap fallbacks — each attempt has a 55s abort; too many stacked = CF timeout (180s).
const FALLBACK_MODELS = [
  PRIMARY_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
].filter((m, i, arr) => m && arr.indexOf(m) === i)

/** Image-edit model for white-bg cutouts when remove.bg is not configured. */
const IMAGE_MODEL = (process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image").trim()

const BG_REMOVE_PROMPT = `Edit this product photo for an online catalog.
Remove the entire background (wall, floor, hanger hardware spill, clutter).
Place the clothing/item centered on a pure flat white (#FFFFFF) studio background.
Keep the garment exactly as photographed — same shape, colour, logos, fabric, wrinkles, and proportions.
Do not invent a new product. Do not add shadows, props, text, or borders.
Return only the edited photo.`

const GEMINI_PROMPT = `You are cataloguing a preloved clothing/lifestyle item for Reloved (Mumbai Wall of Kindness).
Look at the photo and return ONLY valid JSON (no markdown) with:
{
  "title": "short product title, brand + item if clear",
  "category": one of ${JSON.stringify(CATEGORIES)},
  "gender": one of ${JSON.stringify(GENDERS)},
  "description": "1-2 friendly sentences about the item, condition cues, fabric/colour",
  "condition": one of ${JSON.stringify(CONDITIONS)},
  "brand": "brand name or null if unknown"
}
Prefer accurate category. Kicks = footwear/sneakers. Outerwear = jackets/coats/hoodies.`

function normalizeMime(mimeType?: string, filename?: string): string {
  const raw = (mimeType || "").toLowerCase().trim()
  const name = (filename || "").toLowerCase()

  if (raw === "image/jpg") return "image/jpeg"
  if (raw.startsWith("image/") && !/heic|heif/.test(raw)) return raw

  if (/\.jpe?g$/i.test(name) || raw.includes("jpeg") || raw.includes("jpg")) return "image/jpeg"
  if (/\.png$/i.test(name) || raw.includes("png")) return "image/png"
  if (/\.webp$/i.test(name) || raw.includes("webp")) return "image/webp"
  if (/\.gif$/i.test(name) || raw.includes("gif")) return "image/gif"

  // HEIC / empty / octet-stream from mobile: label as JPEG so Gemini accepts the request.
  // Clients should convert HEIC→JPEG before upload; this is a safety net.
  return "image/jpeg"
}

function parseSuggestion(raw: string): AnalyzeSuggestion {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  let parsed: Partial<AnalyzeSuggestion> = {}
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch {
        parsed = {}
      }
    }
  }
  const category = CATEGORIES.includes(String(parsed.category)) ? String(parsed.category) : "Tops"
  const gender = GENDERS.includes(String(parsed.gender)) ? String(parsed.gender) : "unisex"
  const condition = CONDITIONS.includes(String(parsed.condition)) ? String(parsed.condition) : "Good"
  return {
    title: String(parsed.title || "Preloved item").slice(0, 120),
    category,
    gender,
    description: String(parsed.description || "Preloved item ready to Relove.").slice(0, 600),
    condition,
    brand: parsed.brand ? String(parsed.brand).slice(0, 80) : null,
  }
}

async function getGoogleAccessToken(): Promise<string | null> {
  try {
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    })
    const client = await auth.getClient()
    const token = await client.getAccessToken()
    return token.token || null
  } catch (err) {
    console.warn("Google ADC token unavailable:", err)
    return null
  }
}

function extractGeminiText(payload: unknown): string {
  const json = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || ""
}

function extractGeminiImage(payload: unknown): { buffer: Buffer; mimeType: string } | null {
  const json = payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string }
          inline_data?: { mime_type?: string; data?: string }
        }>
      }
    }>
  }
  const parts = json.candidates?.[0]?.content?.parts || []
  for (const part of parts) {
    const camel = part.inlineData
    const snake = part.inline_data
    const data = camel?.data || snake?.data
    if (!data) continue
    return {
      buffer: Buffer.from(data, "base64"),
      mimeType: camel?.mimeType || snake?.mime_type || "image/png",
    }
  }
  return null
}

async function callGeminiOnce(image: Buffer, mimeType: string, model: string): Promise<AnalyzeSuggestion> {
  const b64 = image.toString("base64")
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || ""
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "reloved-digital"
  const location = process.env.VERTEX_LOCATION || "us-central1"
  const mime = normalizeMime(mimeType)

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: GEMINI_PROMPT },
          { inlineData: { mimeType: mime, data: b64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 55_000)

  try {
    if (apiKey) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const text = await res.text()
      if (!res.ok) {
        throw new Error(`Gemini API ${res.status}: ${text.slice(0, 240)}`)
      }
      const suggestion = parseSuggestion(extractGeminiText(JSON.parse(text)))
      if (!suggestion.title) throw new Error("Empty Gemini response")
      return suggestion
    }

    const token = await getGoogleAccessToken()
    if (!token) {
      throw new Error("No GEMINI_API_KEY and Vertex ADC unavailable")
    }
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`Vertex Gemini ${res.status}: ${text.slice(0, 240)}`)
    }
    const suggestion = parseSuggestion(extractGeminiText(JSON.parse(text)))
    if (!suggestion.title) throw new Error("Empty Gemini response")
    return suggestion
  } finally {
    clearTimeout(timeout)
  }
}

async function callGemini(image: Buffer, mimeType: string): Promise<AnalyzeSuggestion> {
  let lastError: Error | null = null
  for (const model of FALLBACK_MODELS) {
    try {
      return await callGeminiOnce(image, mimeType, model)
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err?.message || err))
      const msg = (lastError.message || "").toLowerCase()
      const retryable =
        msg.includes("not found") ||
        msg.includes("not supported") ||
        msg.includes("unavailable") ||
        msg.includes("resource_exhausted") ||
        msg.includes("429") ||
        msg.includes("503") ||
        msg.includes("500") ||
        msg.includes("timed out") ||
        msg.includes("aborted") ||
        msg.includes("internal")
      console.warn(`Gemini model ${model} failed:`, lastError.message)
      if (!retryable) break
    }
  }
  throw lastError || new Error("Gemini analysis failed")
}

/** Gemini image-edit → white studio background. Returns null on failure. */
async function removeBgViaGemini(
  input: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const mime = normalizeMime(mimeType)
  const b64 = input.toString("base64")
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || ""
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "reloved-digital"
  const location = process.env.VERTEX_LOCATION || "us-central1"
  const model = IMAGE_MODEL

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: BG_REMOVE_PROMPT },
          { inlineData: { mimeType: mime, data: b64 } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      temperature: 0.2,
    },
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 70_000)

  try {
    let payload: unknown
    if (apiKey) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const text = await res.text()
      if (!res.ok) {
        console.warn("Gemini image bg-remove API failed:", res.status, text.slice(0, 240))
        return null
      }
      payload = JSON.parse(text)
    } else {
      const token = await getGoogleAccessToken()
      if (!token) {
        console.warn("Gemini image bg-remove skipped: no API key / ADC")
        return null
      }
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const text = await res.text()
      if (!res.ok) {
        console.warn("Vertex Gemini image bg-remove failed:", res.status, text.slice(0, 240))
        return null
      }
      payload = JSON.parse(text)
    }

    const image = extractGeminiImage(payload)
    if (!image?.buffer?.length) {
      console.warn("Gemini image bg-remove returned no image part")
      return null
    }
    return image
  } catch (err) {
    console.warn("Gemini image bg-remove error:", err)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** White-background cutout: remove.bg → Gemini image edit → original. */
async function processPhoto(input: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const key = process.env.REMOVE_BG_API_KEY || ""
  const normalized = normalizeMime(mimeType)

  if (key) {
    try {
      const form = new FormData()
      form.append("size", "auto")
      form.append("format", "jpg")
      form.append("bg_color", "ffffff")
      form.append("image_file", new Blob([new Uint8Array(input)], { type: normalized }), "photo.jpg")

      const res = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": key },
        body: form,
      })
      if (res.ok) {
        return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: "image/jpeg" }
      }
      const errText = await res.text()
      console.warn("remove.bg failed, trying Gemini image edit:", res.status, errText.slice(0, 200))
    } catch (err) {
      console.warn("remove.bg error, trying Gemini image edit:", err)
    }
  }

  const viaGemini = await removeBgViaGemini(input, normalized)
  if (viaGemini) return viaGemini

  console.warn("BG removal unavailable — keeping original photo")
  return { buffer: input, mimeType: normalized }
}

async function analyzeOne(file: UploadedFile): Promise<AnalyzeOk | AnalyzeFail> {
  const originalName = file.filename || "photo.jpg"
  try {
    if (!file.buffer?.length) {
      return { ok: false, originalName, filename: originalName, error: "Empty image file" }
    }
    const mime = normalizeMime(file.mimeType, file.filename)
    const processed = await processPhoto(file.buffer, mime)
    const suggestion = await callGemini(processed.buffer, processed.mimeType)
    try {
      const saved = await uploadImage(processed.buffer, "donations", processed.mimeType)
      return {
        ok: true,
        originalName,
        filename: originalName,
        storagePath: saved.url,
        url: saved.url,
        suggestion,
      }
    } catch (uploadErr: any) {
      // AI succeeded — return suggestion without storage so Give can still prefill
      // and re-upload the local file on submit.
      console.error("analyzeOne upload failed (returning suggestion only):", originalName, uploadErr?.message || uploadErr)
      return {
        ok: true,
        originalName,
        filename: originalName,
        storagePath: "",
        url: "",
        suggestion,
      }
    }
  } catch (err: any) {
    console.error("analyzeOne failed:", originalName, err?.message || err)
    return {
      ok: false,
      originalName,
      filename: originalName,
      error: err?.message || "Photo analysis failed",
    }
  }
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i])
      }
    }),
  )
  return results
}

function buildPhotosMultipart(files: UploadedFile[]) {
  const boundary = `----RelovedBoundary${Date.now()}`
  const chunks: Buffer[] = []
  for (const file of files) {
    const safeName = (file.filename || "photo.jpg").replace(/"/g, "")
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${safeName}"\r\nContent-Type: ${
          normalizeMime(file.mimeType, file.filename)
        }\r\n\r\n`,
      ),
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

function absoluteMediaUrl(pathOrUrl: string | undefined | null, origin: string): string {
  if (!pathOrUrl) return ""
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl
  if (pathOrUrl.startsWith("/")) return `${origin}${pathOrUrl}`
  return `${origin}/uploads/${pathOrUrl}`
}

async function rehostProcessedImage(url: string): Promise<string> {
  try {
    const res = await fetch(url)
    if (!res.ok) return url
    const buf = Buffer.from(await res.arrayBuffer())
    const ctype = res.headers.get("content-type") || "image/webp"
    const saved = await uploadImage(buf, "donations", ctype)
    return saved.url
  } catch (err) {
    console.warn("Could not rehost Lightsail photo to Firebase Storage:", err)
    return url
  }
}

/** Temporary: AlmaLinux Lightsail rembg + Gemini when PHOTO_ANALYZE_RELAY_URL is set. */
async function analyzeViaLightsailRelay(files: UploadedFile[]): Promise<AnalyzeResponse> {
  const relayUrl = process.env.PHOTO_ANALYZE_RELAY_URL || ""
  const origin =
    process.env.PHOTO_ANALYZE_ORIGIN ||
    relayUrl.replace(/\/api\/donations\/analyze-photos\/?$/, "") ||
    "http://13-235-8-13.sslip.io"

  const { body, contentType } = buildPhotosMultipart(files)
  const relayRes = await fetch(relayUrl, {
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
      results.push({
        ok: false,
        originalName: r.originalName,
        filename: r.originalName,
        error: r.error,
      })
      continue
    }
    const absolute = absoluteMediaUrl(r.url || r.storagePath, origin)
    const hosted = await rehostProcessedImage(absolute)
    const sug = r.suggestion || ({} as AnalyzeSuggestion)
    results.push({
      ok: true,
      originalName: r.originalName,
      filename: r.originalName,
      storagePath: hosted,
      url: hosted,
      suggestion: {
        title: sug.title || "Preloved item",
        category: sug.category || "Tops",
        gender: sug.gender || "unisex",
        description: sug.description || "Preloved item ready to Relove.",
        condition: sug.condition || "Good",
        brand: sug.brand ?? null,
      },
    })
  }

  const firstSuggestion = results.find((r): r is AnalyzeOk => r.ok)?.suggestion || null
  return {
    results,
    firstSuggestion,
    categories: payload.categories || CATEGORIES,
    conditions: payload.conditions || CONDITIONS,
    genders: payload.genders || GENDERS,
  }
}

/**
 * Give + admin bulk pipeline.
 * Prefer Lightsail when PHOTO_ANALYZE_RELAY_URL is set; otherwise Firebase-native Gemini.
 */
export async function analyzePhotosViaLightsail(files: UploadedFile[]): Promise<AnalyzeResponse> {
  if (files.length === 0) {
    throw Object.assign(new Error("No photos uploaded"), { status: 400 })
  }

  const relayUrl = (process.env.PHOTO_ANALYZE_RELAY_URL || "").trim()
  if (relayUrl) {
    try {
      const viaRelay = await analyzeViaLightsailRelay(files.slice(0, 12))
      if (viaRelay.results.some((r) => r.ok)) return viaRelay
    } catch (err) {
      console.warn("Lightsail relay failed, falling back to Firebase-native Gemini:", err)
    }
  }

  // Concurrency 2: fewer 429s from Gemini while still parallelizing multi-photo Give.
  const results = await mapPool(files.slice(0, 12), 2, analyzeOne)

  if (!results.some((r) => r.ok)) {
    const detail = results.find((r) => !r.ok)?.error
    throw Object.assign(
      new Error(detail || "Couldn't analyze that photo right now. Please try again."),
      { status: 502 },
    )
  }

  return {
    results,
    firstSuggestion: results.find((r): r is AnalyzeOk => r.ok)?.suggestion || null,
    categories: CATEGORIES,
    conditions: CONDITIONS,
    genders: GENDERS,
  }
}
