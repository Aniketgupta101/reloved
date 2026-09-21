/**
 * Native Firebase photo analysis: Gemini item suggestions + bg removal.
 *
 * Pipeline per photo:
 *  1) Gemini image edit (gemini-2.5-flash-image) → item only on white (people removed)
 *  2) Else if REMOVE_BG_API_KEY set → remove.bg white background (flat lays; may keep a model)
 *  3) Else keep original bytes (AI fill still works)
 *  4) Gemini text model suggests title/category/gender/description/condition/brand
 *     (runs AFTER cutout so text+image don't fight for Vertex quota)
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
  sensitiveDetected?: boolean
  sensitiveReason?: string | null
}

export type AnalyzeOk = {
  ok: true
  originalName: string
  filename: string
  storagePath: string
  url: string
  suggestion: AnalyzeSuggestion
  bgRemoved: boolean
  sensitiveDetected: boolean
  sensitiveReason: string | null
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
// Keep this short — stacked image-edit retries were burning the whole Cloud Function
// budget (180s+) so catalog autofill never ran on multi-photo Give.
const IMAGE_FALLBACK_MODELS = [IMAGE_MODEL, "gemini-2.5-flash-image"].filter(
  (m, i, arr) => m && arr.indexOf(m) === i,
)
/** Per image-edit HTTP attempt. Fail fast so catalog + upload still finish. */
const IMAGE_EDIT_TIMEOUT_MS = 40_000


const BG_REMOVE_PROMPT = `Edit this product photo for Reloved (online catalog of free preloved items).

GOAL: show ONLY the clothing, shoes, or bag — never a person.

- Remove every human: face, head, hair, skin, hands, arms, legs, body, model pose.
- If someone is wearing the item, extract just the item (shirt, jacket, dress, shoes, bag, etc.) as if laid flat or on an invisible form — no mannequin head, no neck, no limbs.
- Remove the entire background (wall, floor, hanger spill, clutter, selfie backdrop).
- Place the item alone, centered, on a pure flat white (#FFFFFF) studio background.
- Keep the item true to the photo: same shape, colour, logos, fabric, wrinkles, and proportions.
- Do not invent a new product. Do not add shadows, props, text, watermarks, or borders.
- Return only the edited photo.`

const GEMINI_PROMPT = `You are cataloguing a preloved clothing/lifestyle item for Reloved (Mumbai Wall of Kindness).
Look at the photo and return ONLY valid JSON (no markdown) with:
{
  "title": "short product title, brand + item if clear",
  "category": one of ${JSON.stringify(CATEGORIES)},
  "gender": one of ${JSON.stringify(GENDERS)},
  "description": "1-2 friendly sentences about the item, condition cues, fabric/colour",
  "condition": one of ${JSON.stringify(CONDITIONS)},
  "brand": "brand name or null if unknown",
  "sensitiveDetected": true if the photo clearly shows a human face, government ID/Aadhaar/PAN/passport, readable personal document, or readable flat/name plate — otherwise false,
  "sensitiveReason": one of "face","id_document","readable_address","other" if sensitiveDetected else null
}
Prefer accurate category. Kicks = footwear/sneakers. Outerwear = jackets/coats/hoodies. Bags and shoes are items too.
Still catalogue the item even if sensitiveDetected is true.`

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
  const sensitiveDetected = Boolean((parsed as { sensitiveDetected?: boolean }).sensitiveDetected)
  const reasonRaw = String((parsed as { sensitiveReason?: string | null }).sensitiveReason || "")
  const sensitiveReason = sensitiveDetected
    ? ["face", "id_document", "readable_address", "other"].includes(reasonRaw)
      ? reasonRaw
      : "other"
    : null
  return {
    title: String(parsed.title || "Preloved item").slice(0, 120),
    category,
    gender,
    description: String(parsed.description || "Preloved item ready to Relove.").slice(0, 600),
    condition,
    brand: parsed.brand ? String(parsed.brand).slice(0, 80) : null,
    sensitiveDetected,
    sensitiveReason,
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

function isRetryableGeminiError(status: number, body: string): boolean {
  if ([429, 500, 503, 504].includes(status)) return true
  const lower = body.toLowerCase()
  return (
    lower.includes("resource_exhausted") ||
    lower.includes("unavailable") ||
    lower.includes("internal") ||
    lower.includes("timed out") ||
    lower.includes("deadline")
  )
}

/** One Gemini image-edit attempt. Throws on transport / HTTP failure; returns null if no image part. */
async function removeBgViaGeminiOnce(
  input: Buffer,
  mimeType: string,
  model: string,
  modalities: string[],
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const mime = normalizeMime(mimeType)
  const b64 = input.toString("base64")
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || ""
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "reloved-digital"
  const location = process.env.VERTEX_LOCATION || "us-central1"

  const body = {
    contents: [
      {
        role: "user",
        // Image first — image-edit models attend more reliably this way.
        parts: [
          { inlineData: { mimeType: mime, data: b64 } },
          { text: BG_REMOVE_PROMPT },
        ],
      },
    ],
    generationConfig: {
      responseModalities: modalities,
      temperature: 0.2,
    },
  }

  const controller = new AbortController()
  // Fail fast — long aborts used to eat the whole analyze request before catalog ran.
  const timeout = setTimeout(() => controller.abort(), IMAGE_EDIT_TIMEOUT_MS)


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
        const err = new Error(`Gemini image bg-remove API ${res.status}: ${text.slice(0, 240)}`)
        ;(err as Error & { retryable?: boolean }).retryable = isRetryableGeminiError(res.status, text)
        throw err
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
        const err = new Error(`Vertex Gemini image bg-remove ${res.status}: ${text.slice(0, 240)}`)
        ;(err as Error & { retryable?: boolean }).retryable = isRetryableGeminiError(res.status, text)
        throw err
      }
      payload = JSON.parse(text)
    }

    const image = extractGeminiImage(payload)
    if (!image?.buffer?.length) {
      const finish =
        (payload as { candidates?: Array<{ finishReason?: string; finish_reason?: string }> })
          ?.candidates?.[0]?.finishReason ||
        (payload as { candidates?: Array<{ finishReason?: string; finish_reason?: string }> })
          ?.candidates?.[0]?.finish_reason ||
        "unknown"
      const textPart = extractGeminiText(payload).slice(0, 120)
      console.warn(
        `Gemini image bg-remove returned no image part (model=${model}, finish=${finish}${textPart ? `, text=${textPart}` : ""})`,
      )
      return null
    }
    return image
  } finally {
    clearTimeout(timeout)
  }
}

/** Gemini image-edit → white studio background. Returns null on failure. */
async function removeBgViaGemini(
  input: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  // One modality, one attempt per model — retries were stacking past the CF timeout
  // and causing the whole Give analyze (including title autofill) to fail.
  const modalities = ["IMAGE"]

  for (const model of IMAGE_FALLBACK_MODELS) {
    try {
      const image = await removeBgViaGeminiOnce(input, mimeType, model, modalities)
      if (image) return image
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err?.message || err)
      console.warn(`Gemini image bg-remove failed (model=${model}, modalities=IMAGE):`, msg)
    }
  }
  return null
}

/** Item-only cutout on white: Gemini (people removed) → remove.bg → original. */
async function processPhoto(
  input: Buffer,
  mimeType: string,
  opts?: { skipBg?: boolean },
): Promise<{ buffer: Buffer; mimeType: string; bgRemoved: boolean }> {
  const normalized = normalizeMime(mimeType)
  if (opts?.skipBg) {
    return { buffer: input, mimeType: normalized, bgRemoved: false }
  }

  // Prefer Gemini so worn-on-body photos become item-only (remove.bg keeps the person).
  const viaGemini = await removeBgViaGemini(input, normalized)
  if (viaGemini) return { ...viaGemini, bgRemoved: true }

  const key = process.env.REMOVE_BG_API_KEY || ""
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
        return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: "image/jpeg", bgRemoved: true }
      }
      const errText = await res.text()
      console.warn("remove.bg failed after Gemini:", res.status, errText.slice(0, 200))
    } catch (err) {
      console.warn("remove.bg error after Gemini:", err)
    }
  }

  console.warn("BG removal unavailable — keeping original photo")
  return { buffer: input, mimeType: normalized, bgRemoved: false }
}

async function analyzeOne(file: UploadedFile): Promise<AnalyzeOk | AnalyzeFail> {
  const originalName = file.filename || "photo.jpg"
  try {
    if (!file.buffer?.length) {
      return { ok: false, originalName, filename: originalName, error: "Empty image file" }
    }
    const mime = normalizeMime(file.mimeType, file.filename)
    // Catalog FIRST on the original so title/category always fill even when cutout
    // times out or Vertex returns 429. Then best-effort white-studio BG.
    const skipBg = process.env.RELOVED_PHOTO_BG_REMOVE !== "1"
    const suggestion = await callGemini(file.buffer, mime)
    const processed = await processPhoto(file.buffer, mime, { skipBg })

    let savedUrl = ""
    try {
      const saved = await uploadImage(processed.buffer, "donations", processed.mimeType)
      savedUrl = saved.url
    } catch (uploadErr: any) {
      console.error("analyzeOne upload failed, retrying once:", originalName, uploadErr?.message || uploadErr)
      try {
        const saved = await uploadImage(processed.buffer, "donations", processed.mimeType)
        savedUrl = saved.url
      } catch (retryErr: any) {
        console.error("analyzeOne upload retry failed:", originalName, retryErr?.message || retryErr)
        return {
          ok: true,
          originalName,
          filename: originalName,
          storagePath: "",
          url: "",
          suggestion,
          bgRemoved: false,
          sensitiveDetected: Boolean(suggestion.sensitiveDetected),
          sensitiveReason: suggestion.sensitiveReason || null,
        }
      }
    }

    return {
      ok: true,
      originalName,
      filename: originalName,
      storagePath: savedUrl,
      url: savedUrl,
      suggestion,
      bgRemoved: processed.bgRemoved,
      sensitiveDetected: Boolean(suggestion.sensitiveDetected),
      sensitiveReason: suggestion.sensitiveReason || null,
    }
  } catch (err: any) {
    console.error("analyzeOne failed:", originalName, err?.message || err)
    return {
      ok: false,
      originalName,
      filename: originalName,
      error: "Photo analysis failed",
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
        sensitiveDetected: Boolean(sug.sensitiveDetected),
        sensitiveReason: sug.sensitiveReason || null,
      },
      bgRemoved: true,
      sensitiveDetected: Boolean(sug.sensitiveDetected),
      sensitiveReason: sug.sensitiveReason || null,
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

  // Concurrency 1: image-edit is quota-sensitive; parallel photos often 429 Vertex.
  const results = await mapPool(files.slice(0, 12), 1, analyzeOne)

  if (!results.some((r) => r.ok)) {
    throw Object.assign(new Error("Couldn't analyze that photo right now. Please try again."), {
      status: 502,
    })
  }

  return {
    results,
    firstSuggestion: results.find((r): r is AnalyzeOk => r.ok)?.suggestion || null,
    categories: CATEGORIES,
    conditions: CONDITIONS,
    genders: GENDERS,
  }
}
