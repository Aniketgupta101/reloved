/**
 * Native Firebase photo analysis: Gemini item suggestions + optional bg removal.
 * Replaces the Lightsail relay (currently unreachable).
 *
 * Pipeline per photo:
 *  1) If REMOVE_BG_API_KEY set → remove.bg with white background (JPEG)
 *  2) Else keep original bytes (AI fill still works)
 *  3) Gemini suggests title/category/gender/description/condition/brand
 *  4) Upload processed image to Firebase Storage
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

const CATEGORIES = ["Outerwear", "Tops", "Bottoms", "Kicks", "Bags", "Accessories"]
const CONDITIONS = ["Excellent", "Good", "Fair but fully usable"]
const GENDERS = ["men", "women", "girls", "boys", "unisex"]

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
  }
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || ""
}

async function callGemini(image: Buffer, mimeType: string): Promise<AnalyzeSuggestion> {
  const b64 = image.toString("base64")
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || ""
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "reloved-digital"
  const location = process.env.VERTEX_LOCATION || "us-central1"
  const vertexModel = process.env.GEMINI_MODEL || "gemini-2.5-flash"
  const studioModel = process.env.GEMINI_MODEL || "gemini-2.5-flash"

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: GEMINI_PROMPT },
          { inlineData: { mimeType: mimeType || "image/jpeg", data: b64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  }

  if (apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${studioModel}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    if (!res.ok) {
      console.error("Gemini API key path failed:", res.status, text.slice(0, 400))
      throw new Error("Gemini analysis failed")
    }
    return parseSuggestion(extractGeminiText(JSON.parse(text)))
  }

  const token = await getGoogleAccessToken()
  if (!token) {
    throw new Error("No GEMINI_API_KEY and Vertex ADC unavailable")
  }
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${vertexModel}:generateContent`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error("Vertex Gemini failed:", res.status, text.slice(0, 400))
    throw new Error("Gemini analysis failed")
  }
  return parseSuggestion(extractGeminiText(JSON.parse(text)))
}

/** White-background cutout via remove.bg, or original bytes if no key / failure. */
async function processPhoto(input: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const key = process.env.REMOVE_BG_API_KEY || ""
  if (!key) {
    return { buffer: input, mimeType: mimeType || "image/jpeg" }
  }

  try {
    const form = new FormData()
    form.append("size", "auto")
    form.append("format", "jpg")
    form.append("bg_color", "ffffff")
    form.append("image_file", new Blob([new Uint8Array(input)], { type: mimeType || "image/jpeg" }), "photo.jpg")

    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key },
      body: form,
    })
    if (!res.ok) {
      const errText = await res.text()
      console.warn("remove.bg failed, using original:", res.status, errText.slice(0, 200))
      return { buffer: input, mimeType: mimeType || "image/jpeg" }
    }
    return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: "image/jpeg" }
  } catch (err) {
    console.warn("remove.bg error, using original:", err)
    return { buffer: input, mimeType: mimeType || "image/jpeg" }
  }
}

async function analyzeOne(file: UploadedFile): Promise<AnalyzeOk | AnalyzeFail> {
  const originalName = file.filename || "photo.jpg"
  try {
    const mime = file.mimeType || "image/jpeg"
    const processed = await processPhoto(file.buffer, mime)
    const suggestion = await callGemini(processed.buffer, processed.mimeType)
    const saved = await uploadImage(processed.buffer, "donations", processed.mimeType)
    return {
      ok: true,
      originalName,
      storagePath: saved.url,
      url: saved.url,
      suggestion,
    }
  } catch (err: any) {
    console.error("analyzeOne failed:", originalName, err?.message || err)
    return {
      ok: false,
      originalName,
      error: err?.message || "Photo analysis failed",
    }
  }
}

function buildPhotosMultipart(files: UploadedFile[]) {
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
      results.push(r)
      continue
    }
    const absolute = absoluteMediaUrl(r.url || r.storagePath, origin)
    const hosted = await rehostProcessedImage(absolute)
    const sug = r.suggestion || ({} as AnalyzeSuggestion)
    results.push({
      ok: true,
      originalName: r.originalName,
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

  return {
    results,
    categories: payload.categories || CATEGORIES,
    conditions: payload.conditions || CONDITIONS,
    genders: payload.genders || GENDERS,
  }
}

/**
 * Give + admin bulk pipeline.
 * Temporary: prefer Lightsail (AlmaLinux-4) when PHOTO_ANALYZE_RELAY_URL is set
 * (bg-removal + Gemini). Falls back to Firebase-native Gemini if relay fails/unset.
 */
export async function analyzePhotosViaLightsail(files: UploadedFile[]): Promise<AnalyzeResponse> {
  if (files.length === 0) {
    throw Object.assign(new Error("No photos uploaded"), { status: 400 })
  }

  const relayUrl = (process.env.PHOTO_ANALYZE_RELAY_URL || "").trim()
  if (relayUrl) {
    try {
      const viaRelay = await analyzeViaLightsailRelay(files)
      if (viaRelay.results.some((r) => r.ok)) return viaRelay
    } catch (err) {
      console.warn("Lightsail relay failed, falling back to Firebase-native Gemini:", err)
    }
  }

  const results: Array<AnalyzeOk | AnalyzeFail> = []
  for (const file of files.slice(0, 5)) {
    results.push(await analyzeOne(file))
  }

  if (!results.some((r) => r.ok)) {
    throw Object.assign(new Error("Couldn't analyze that photo right now. Please try again."), {
      status: 502,
    })
  }

  return {
    results,
    categories: CATEGORIES,
    conditions: CONDITIONS,
    genders: GENDERS,
  }
}
