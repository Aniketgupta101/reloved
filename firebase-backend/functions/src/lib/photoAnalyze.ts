/**
 * Native Firebase photo analysis: Gemini catalog suggestions + studio product polish.
 *
 * Pipeline per photo (when RELOVED_PHOTO_BG_REMOVE=1):
 *  1) Gemini image edit → premium ghost-mannequin product shot on white
 *     (person + original background removed; clothing kept exact)
 *  2) Else if REMOVE_BG_API_KEY set → remove.bg white bg, then one Gemini polish pass
 *     for ghost-mannequin volume (if polish fails, still ship the white cutout)
 *  3) If studio polish + remove.bg both fail → hard error when required (do NOT upload original)
 *  4) Gemini text model suggests title/category/… on the polished image
 *  5) Upload processed image to Firebase Storage (replaces the upload on the Wall)
 *
 * When RELOVED_PHOTO_BG_REMOVE≠1: catalog on original, upload original (no studio polish).
 */
import { GoogleAuth } from "google-auth-library"
import {
  getGeminiApiKeys,
  getGroqApiKeys,
  isKeyFailureError,
  withApiKeyRotation,
} from "./aiKeys"
import type { UploadedFile } from "./multipart"
import { uploadImage } from "./storage"
import { mapPool } from "./concurrency"
import { logTiming } from "./perfMetrics"

export type AnalyzeSuggestion = {
  title: string
  category: string
  gender: string
  description: string
  condition: string
  brand: string | null
  /** Letter size or kids age band when visible / guessable from the photo. */
  size?: string | null
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

/** Image-edit model for ghost-mannequin studio polish when remove.bg is not enough. */
const IMAGE_MODEL = (process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image").trim()
const IMAGE_FALLBACK_MODELS = [
  IMAGE_MODEL,
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image",
].filter((m, i, arr) => m && arr.indexOf(m) === i)
/** Per image-edit HTTP attempt — studio polish is allowed to take time. */
const IMAGE_EDIT_TIMEOUT_MS = 90_000
/** Full studio campaign: models × modalities × rounds with backoff. Configurable via env. */
const IMAGE_EDIT_MAX_ROUNDS = Math.max(1, Math.min(3, Number(process.env.IMAGE_EDIT_MAX_ROUNDS) || 2))
const IMAGE_EDIT_MODALITIES: string[][] = [["IMAGE"], ["IMAGE", "TEXT"]]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Ghost-mannequin / invisible-form ecommerce presentation for the Wall of Kindness.
 * Target look: premium fashion catalogue card — clothing appears naturally filled out
 * with depth and soft folds on pure white; no person or mannequin visible.
 */
const STUDIO_PRODUCT_PROMPT = `Edit this product photo for Reloved's Wall of Kindness — a curated fashion / preloved catalogue.

GOAL — premium ecommerce product showcase (INVISIBLE / GHOST form only):
The clothing, shoes, or bag must look like a professional fashion-marketplace listing: naturally worn shape, filled volume, and clean studio presentation — NOT a flat background-removed sticker, crumpled cutout, or photo of a dress form.

REMOVE completely — nothing of these may remain visible anywhere in the frame:
- Every person: face, head, hair, skin, hands, arms, legs, body, pose, selfie.
- ANY mannequin or dress form: head, neck stub, torso, chest plate, shoulders under the fabric, waist, hips, crotch, legs, feet, stands, base, seams, plastic/foam surface showing through neckline, cuffs, hem, or gaps.
- Featureless white/grey/beige mannequin HEADS and NECK STUBS sticking out of kids costumes, capes, hoodies, or collars — erase them fully into pure white studio (do not leave a bald oval above the garment).
- Solid black/grey neck plugs or foam discs filling a collar opening — replace with empty collar interior only.
- Grey/white mannequin body peeking from the collar, hem, side slits, sleeve openings, or through sheer/mesh/linen fabric — paint those areas as empty garment interior / soft shadow only, never plastic skin.
- Dark interior mannequin limbs visible inside costume arm/leg holes; ankles/feet sticking from pant hems; wrists sticking from cuffs.
- Do NOT invent human hands, skin, or feet at sleeve/leg openings — openings must be empty fabric only.
- Hanger hardware, clips, pins, tags-on-hangers, props.
- The entire original background (grey paper, studio sweep, wall, floor, rug, room, outdoor scene, clutter). Replace with pure white.

PRESENT the product:
- Keep ONLY the real uploaded product. Preserve exact colour, pattern, print, texture, fabric, stitching, buttons, zips, logos, labels, wear marks, and proportions. Do NOT redesign, restyle, recolour, or invent new details.
- Shape the garment as if on an INVISIBLE form: natural drape, gentle 3D volume through the body/chest/sleeves/legs, realistic soft folds — so it does not look paper-flat — but the form itself must be completely invisible.
- For bags and shoes: upright, catalogue-ready angle with subtle depth; still no props or people.
- Centre the product; keep it upright and axis-aligned (shoulders/hems level). Straighten mild skew from the source photo.
- Use consistent catalogue framing: product fills most of the frame with modest even margins (roughly 8–15% padding). Do not crop important edges.
- Place on a pure flat white (#FFFFFF) studio background only — never grey, beige, or patterned.
- Allowed: soft, natural contact shadow under/near the item and subtle fabric shading for depth — keep them restrained and realistic.
- Forbidden: hard drop-shadow graphics, coloured or grey backdrops, gradients, borders, frames, text, watermarks, logos, badges, sparkles, or decorative elements.
- Forbidden: distorting the product, swapping the item, adding sleeves/pockets/patterns that are not in the photo, or changing brand marks.
- Forbidden: leaving any mannequin head, hip, torso, neck, or limb visible.

Return only the edited photo.`

/** Aggressive second pass when QA still sees mannequin / person remnants. */
const MANNEQUIN_CLEANUP_PROMPT = `This ecommerce product photo still shows a mannequin, dress form, person parts, or fake limbs. Fix it NOW for Reloved's Wall of Kindness.

CRITICAL — paint out completely until ZERO remain:
- Featureless white/grey/beige mannequin HEAD and NECK stub above collars / costumes / capes — erase into pure white #FFFFFF background. Do not leave a bald oval or foam stub.
- Black/grey circular neck plugs, foam discs, or solid fills inside the collar — replace with a natural empty collar opening (soft interior fabric shadow only), never a solid black oval.
- Mannequin torso, chest plate, shoulders, waist, hips, crotch, legs, feet, ankles, stand, or base sticking out of hems or cuffs.
- Mannequin surface showing through sheer, mesh, lace, linen, or open necklines — replace with natural empty garment interior (soft fabric shadow only), never plastic/foam skin.
- Dark mannequin limbs inside costume sleeve/leg openings.
- ANY human face, skin, hair, hands, fingers, wrists, or feet — including skin-tone hands that were invented at sleeve ends. Sleeve openings must end as empty fabric cuffs only (no hands).

Keep the REAL garment/costume EXACTLY as photographed (colours, prints, cape, logos, embroidery, wear). Do not redesign, invent hands/body parts, or add accessories.
Result: invisible ghost-mannequin catalogue shot on pure flat white #FFFFFF only — clothing appears worn but no body is visible.
Return only the edited photo.`

/** Vision QA — true if any mannequin/person remnant is still visible. */
const MANNEQUIN_QA_PROMPT = `Inspect this product photo for Reloved catalogue QA. Reply ONLY valid JSON (no markdown):
{"mannequinVisible":true|false,"personVisible":true|false,"detail":"short reason"}
Set mannequinVisible=true if ANY of these are visible: mannequin head, bald foam head, neck stub, solid black/grey neck plug inside a collar, plastic/foam torso, chest plate, hips, legs, feet, ankles sticking from hems, stand, base, dress-form surface through neckline/sleeves/hem/sheer fabric, or dark form inside arm/leg holes.
Set personVisible=true if any human face, skin, hair, hands, fingers, or feet remain (including realistic skin-tone hands at sleeve ends).
If the garment alone sits on white with empty openings and no form/body visible, both flags must be false.`

const GEMINI_PROMPT = `You are cataloguing a preloved clothing/lifestyle item for Reloved (Mumbai Wall of Kindness).
Look at the photo and return ONLY valid JSON (no markdown) with:
{
  "title": "short product title, brand + item if clear",
  "category": one of ${JSON.stringify(CATEGORIES)},
  "gender": one of ${JSON.stringify(GENDERS)},
  "description": "1-2 friendly sentences about the item, condition cues, fabric/colour",
  "condition": one of ${JSON.stringify(CONDITIONS)},
  "brand": "brand name or null if unknown",
  "size": "best guess letter size XS|S|M|L|XL|XXL/2XL|3XL, or kids age band like 7-8 years, or null if unknown",
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
    size: parsed.size ? String(parsed.size).slice(0, 40) : null,
    sensitiveDetected,
    sensitiveReason,
  }
}

let cachedGoogleToken: { token: string; expiresAt: number } | null = null
let googleAuthInstance: GoogleAuth | null = null

async function getGoogleAccessToken(): Promise<string | null> {
  const now = Date.now()
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > now + 60_000) {
    return cachedGoogleToken.token
  }
  try {
    if (!googleAuthInstance) {
      googleAuthInstance = new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      })
    }
    const client = await googleAuthInstance.getClient()
    const token = await client.getAccessToken()
    if (token.token) {
      cachedGoogleToken = {
        token: token.token,
        expiresAt: now + 50 * 60_000,
      }
      return token.token
    }
    return null
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

async function callGeminiOnceWithKey(
  image: Buffer,
  mimeType: string,
  model: string,
  apiKey: string,
): Promise<AnalyzeSuggestion> {
  const b64 = image.toString("base64")
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
  const timeout = setTimeout(() => controller.abort(), 28_000)

  try {
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
  } finally {
    clearTimeout(timeout)
  }
}

async function callGeminiViaVertex(
  image: Buffer,
  mimeType: string,
  model: string,
): Promise<AnalyzeSuggestion> {
  const b64 = image.toString("base64")
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
  const timeout = setTimeout(() => controller.abort(), 28_000)
  try {
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

/** Groq vision catalog fallback when every Gemini key fails (titles/details only — no image edit). */
async function callGroqCatalogOnce(
  image: Buffer,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<AnalyzeSuggestion> {
  const mime = normalizeMime(mimeType)
  const dataUrl = `data:${mime};base64,${image.toString("base64")}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: GEMINI_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`Groq API ${res.status}: ${text.slice(0, 240)}`)
    }
    const payload = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content || ""
    const suggestion = parseSuggestion(content)
    if (!suggestion.title) throw new Error("Empty Groq response")
    return suggestion
  } finally {
    clearTimeout(timeout)
  }
}

async function callGroqCatalog(image: Buffer, mimeType: string): Promise<AnalyzeSuggestion> {
  const keys = getGroqApiKeys()
  if (!keys.length) throw new Error("No GROQ_API_KEY configured")
  const models = [
    (process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct").trim(),
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "llama-3.2-11b-vision-preview",
  ].filter((m, i, arr) => m && arr.indexOf(m) === i)

  let lastError: Error | null = null
  for (const model of models) {
    try {
      return await withApiKeyRotation("groq", keys, (apiKey) =>
        callGroqCatalogOnce(image, mimeType, apiKey, model),
      )
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err?.message || err))
      console.warn(`Groq catalog model ${model} failed:`, lastError.message)
    }
  }
  throw lastError || new Error("Groq catalog failed")
}

async function callGemini(image: Buffer, mimeType: string): Promise<AnalyzeSuggestion> {
  const geminiKeys = getGeminiApiKeys()
  let lastError: Error | null = null

  for (const model of FALLBACK_MODELS) {
    try {
      if (geminiKeys.length) {
        try {
          return await withApiKeyRotation("gemini", geminiKeys, (apiKey) =>
            callGeminiOnceWithKey(image, mimeType, model, apiKey),
          )
        } catch (keyErr: any) {
          console.warn(
            `Gemini key pool failed for catalog (${model}) — trying Vertex ADC:`,
            keyErr?.message || keyErr,
          )
          return await callGeminiViaVertex(image, mimeType, model)
        }
      }
      return await callGeminiViaVertex(image, mimeType, model)
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err?.message || err))
      const msg = (lastError.message || "").toLowerCase()
      const retryable =
        isKeyFailureError(lastError) ||
        msg.includes("not found") ||
        msg.includes("not supported") ||
        msg.includes("unavailable") ||
        msg.includes("503") ||
        msg.includes("500") ||
        msg.includes("timed out") ||
        msg.includes("aborted") ||
        msg.includes("internal")
      console.warn(`Gemini model ${model} failed:`, lastError.message)
      if (!retryable) break
    }
  }

  // Catalog must not block Give — fall through to Groq vision.
  if (getGroqApiKeys().length) {
    try {
      console.warn("Gemini catalog exhausted — falling back to Groq vision")
      return await callGroqCatalog(image, mimeType)
    } catch (groqErr: any) {
      console.warn("Groq catalog fallback failed:", groqErr?.message || groqErr)
      lastError =
        groqErr instanceof Error ? groqErr : new Error(String(groqErr?.message || groqErr))
    }
  }

  throw lastError || new Error("Gemini analysis failed")
}

function isRetryableGeminiError(status: number, body: string): boolean {
  if ([401, 403, 429, 500, 503, 504].includes(status)) return true
  const lower = body.toLowerCase()
  return (
    lower.includes("resource_exhausted") ||
    lower.includes("unavailable") ||
    lower.includes("internal") ||
    lower.includes("timed out") ||
    lower.includes("deadline") ||
    lower.includes("quota") ||
    lower.includes("api key")
  )
}

/** One Gemini image-edit attempt with a specific API key (or Vertex ADC when apiKey is empty). */
async function removeBgViaGeminiOnce(
  input: Buffer,
  mimeType: string,
  model: string,
  modalities: string[],
  apiKey: string,
  prompt: string = STUDIO_PRODUCT_PROMPT,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const mime = normalizeMime(mimeType)
  const b64 = input.toString("base64")
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "reloved-digital"
  const location = process.env.VERTEX_LOCATION || "us-central1"

  const body = {
    contents: [
      {
        role: "user",
        // Image first — image-edit models attend more reliably this way.
        parts: [
          { inlineData: { mimeType: mime, data: b64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseModalities: modalities,
      // Low enough to preserve product fidelity; high enough for natural volume/folds.
      temperature: 0.35,
    },
  }

  const controller = new AbortController()
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
        const err = new Error(`Gemini studio polish API ${res.status}: ${text.slice(0, 240)}`)
        ;(err as Error & { retryable?: boolean }).retryable = isRetryableGeminiError(res.status, text)
        throw err
      }
      payload = JSON.parse(text)
    } else {
      const token = await getGoogleAccessToken()
      if (!token) {
        console.warn("Gemini studio polish skipped: no API key / ADC")
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
        const err = new Error(`Vertex Gemini studio polish ${res.status}: ${text.slice(0, 240)}`)
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
        `Gemini studio polish returned no image part (model=${model}, finish=${finish}${textPart ? `, text=${textPart}` : ""})`,
      )
      return null
    }
    return image
  } finally {
    clearTimeout(timeout)
  }
}

/** Try studio polish across Gemini keys (auto-rotate on quota/auth), then Vertex ADC. */
async function removeBgViaGeminiOnceRotating(
  input: Buffer,
  mimeType: string,
  model: string,
  modalities: string[],
  prompt: string = STUDIO_PRODUCT_PROMPT,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const keys = getGeminiApiKeys()
  if (keys.length) {
    try {
      return await withApiKeyRotation("gemini-image", keys, async (apiKey) => {
        const image = await removeBgViaGeminiOnce(input, mimeType, model, modalities, apiKey, prompt)
        if (!image) {
          const err = new Error("Gemini studio polish returned no image part") as Error & {
            retryable?: boolean
            noImagePart?: boolean
            skipKeyRotation?: boolean
          }
          err.retryable = true
          err.noImagePart = true
          err.skipKeyRotation = true
          throw err
        }
        return image
      })
    } catch (err: any) {
      if (err?.noImagePart) return null
      console.warn(
        `Gemini API key pool failed for studio polish (${model}) — trying Vertex ADC:`,
        err instanceof Error ? err.message.slice(0, 160) : String(err),
      )
    }
  }

  // Vertex / ADC on the Cloud Function service account (no AI Studio quota).
  try {
    return await removeBgViaGeminiOnce(input, mimeType, model, modalities, "", prompt)
  } catch (err: any) {
    console.warn(
      `Vertex studio polish failed (${model}):`,
      err instanceof Error ? err.message.slice(0, 180) : String(err),
    )
    throw err
  }
}

/** Gemini image-edit → ghost-mannequin studio product shot. Retries with backoff. */
async function removeBgViaGemini(
  input: Buffer,
  mimeType: string,
  prompt: string = STUDIO_PRODUCT_PROMPT,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  let lastError: string | null = null

  for (let round = 0; round < IMAGE_EDIT_MAX_ROUNDS; round++) {
    for (const model of IMAGE_FALLBACK_MODELS) {
      for (const modalities of IMAGE_EDIT_MODALITIES) {
        try {
          const image = await removeBgViaGeminiOnceRotating(
            input,
            mimeType,
            model,
            modalities,
            prompt,
          )
          if (image) {
            if (round > 0) {
              console.info(
                `Gemini studio polish succeeded on retry (round=${round + 1}, model=${model})`,
              )
            }
            return image
          }
          lastError = `no image part (model=${model}, modalities=${modalities.join("+")})`
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err?.message || err)
          lastError = msg
          const retryable =
            Boolean((err as Error & { retryable?: boolean }).retryable) ||
            isKeyFailureError(err) ||
            /429|503|500|504|resource_exhausted|unavailable|aborted|timed out|deadline|internal/i.test(
              msg,
            )
          console.warn(
            `Gemini studio polish failed (round=${round + 1}, model=${model}, modalities=${modalities.join("+")}):`,
            msg,
          )
          if (!retryable) continue
        }
      }
    }
    if (round < IMAGE_EDIT_MAX_ROUNDS - 1) {
      // Exponential backoff with random jitter to avoid thundering herd on AI APIs
      const baseWaitMs = Math.min(2_000 * 2 ** round, 20_000)
      const jitterMs = Math.floor(Math.random() * 500)
      const waitMs = baseWaitMs + jitterMs
      console.warn(`Gemini studio polish backoff ${waitMs}ms before round ${round + 2}`)
      await sleep(waitMs)
    }
  }

  console.warn("Gemini studio polish exhausted retries:", lastError)
  return null
}

/**
 * One quick Gemini polish pass (used after remove.bg flat cutouts).
 * Does not run the full multi-round campaign — best-effort elevation only.
 */
async function studioPolishOnce(
  input: Buffer,
  mimeType: string,
  prompt: string = STUDIO_PRODUCT_PROMPT,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  for (const model of IMAGE_FALLBACK_MODELS.slice(0, 2)) {
    for (const modalities of IMAGE_EDIT_MODALITIES) {
      try {
        const image = await removeBgViaGeminiOnceRotating(
          input,
          mimeType,
          model,
          modalities,
          prompt,
        )
        if (image) return image
      } catch (err: any) {
        console.warn(
          `Gemini studio polish-once failed (model=${model}):`,
          err instanceof Error ? err.message : String(err?.message || err),
        )
      }
    }
  }
  return null
}

/** Vision QA: true when mannequin or person remnants are still visible. */
async function detectMannequinRemnants(input: Buffer, mimeType: string): Promise<boolean> {
  const mime = normalizeMime(mimeType)
  const b64 = input.toString("base64")
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: mime, data: b64 } },
          { text: MANNEQUIN_QA_PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  }

  const parseFlags = (raw: string): boolean | null => {
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
      const parsed = JSON.parse(cleaned) as {
        mannequinVisible?: boolean
        personVisible?: boolean
      }
      return Boolean(parsed.mannequinVisible) || Boolean(parsed.personVisible)
    } catch {
      return null
    }
  }

  const keys = getGeminiApiKeys()
  for (const model of FALLBACK_MODELS.slice(0, 2)) {
    if (keys.length) {
      try {
        const flagged = await withApiKeyRotation("gemini", keys, async (apiKey) => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 20_000)
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: controller.signal,
            })
            const text = await res.text()
            if (!res.ok) {
              const err = new Error(`mannequin QA ${res.status}: ${text.slice(0, 160)}`)
              ;(err as Error & { retryable?: boolean }).retryable = isRetryableGeminiError(
                res.status,
                text,
              )
              throw err
            }
            const flags = parseFlags(extractGeminiText(JSON.parse(text)))
            if (flags === null) throw new Error("mannequin QA unparseable")
            return flags
          } finally {
            clearTimeout(timeout)
          }
        })
        return flagged
      } catch (err: any) {
        console.warn(
          `Mannequin QA failed (model=${model}):`,
          err instanceof Error ? err.message.slice(0, 160) : String(err),
        )
      }
    }

    try {
      const token = await getGoogleAccessToken()
      if (!token) continue
      const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "reloved-digital"
      const location = process.env.VERTEX_LOCATION || "us-central1"
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20_000)
      try {
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
        if (!res.ok) continue
        const flags = parseFlags(extractGeminiText(JSON.parse(text)))
        if (flags !== null) return flags
      } finally {
        clearTimeout(timeout)
      }
    } catch (err: any) {
      console.warn(
        `Mannequin QA Vertex failed (model=${model}):`,
        err instanceof Error ? err.message.slice(0, 160) : String(err),
      )
    }
  }

  // Fail-open: do not block shipping the cutout if QA is unavailable.
  return false
}

/**
 * If QA still sees a mannequin/person, run aggressive cleanup edits (up to 2).
 * Always returns a buffer (cleaned when possible, else the input cutout).
 */
async function ensureGhostMannequin(
  cutout: { buffer: Buffer; mimeType: string },
): Promise<{ buffer: Buffer; mimeType: string }> {
  let current = cutout
  for (let pass = 1; pass <= 2; pass++) {
    const dirty = await detectMannequinRemnants(current.buffer, current.mimeType)
    if (!dirty) {
      if (pass > 1) console.info(`Mannequin cleanup cleared remnants after pass ${pass - 1}`)
      return current
    }

    console.warn(`Mannequin/person remnant detected — cleanup pass ${pass}`)
    const cleaned = await studioPolishOnce(
      current.buffer,
      current.mimeType,
      MANNEQUIN_CLEANUP_PROMPT,
    )
    if (!cleaned) {
      console.warn(`Mannequin cleanup pass ${pass} failed — shipping prior cutout`)
      return current
    }
    current = cleaned
  }

  const stillDirty = await detectMannequinRemnants(current.buffer, current.mimeType)
  if (stillDirty) {
    console.warn("Mannequin remnant still visible after 2 cleanup passes — shipping best attempt")
  } else {
    console.info("Mannequin cleanup passes cleared remnants")
  }
  return current
}

/** Ghost-mannequin studio polish on white. When required=true, never returns the original. */
export async function processPhoto(
  input: Buffer,
  mimeType: string,
  opts?: { skipBg?: boolean; required?: boolean },
): Promise<{ buffer: Buffer; mimeType: string; bgRemoved: boolean }> {
  const normalized = normalizeMime(mimeType)
  if (opts?.skipBg) {
    return { buffer: input, mimeType: normalized, bgRemoved: false }
  }

  // Prefer Gemini so worn-on-body photos become ghost-mannequin catalogue shots
  // (remove.bg alone keeps the person or yields a flat sticker).
  const viaGemini = await removeBgViaGemini(input, normalized)
  if (viaGemini) {
    const cleaned = await ensureGhostMannequin(viaGemini)
    return { ...cleaned, bgRemoved: true }
  }

  const key = process.env.REMOVE_BG_API_KEY || ""
  if (key) {
    for (let attempt = 0; attempt < 3; attempt++) {
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
          const flat = {
            buffer: Buffer.from(await res.arrayBuffer()),
            mimeType: "image/jpeg",
          }
          // Prefer ghost-mannequin polish; if Gemini is down/quota'd, keep the white
          // remove.bg cutout — never fall through to the original room/selfie photo.
          const polished = await studioPolishOnce(flat.buffer, flat.mimeType)
          const candidate = polished || flat
          if (!polished) {
            console.warn(
              "remove.bg ok but Gemini polish failed — shipping white cutout after mannequin QA",
            )
          }
          const cleaned = await ensureGhostMannequin(candidate)
          return { ...cleaned, bgRemoved: true }
        }
        const errText = await res.text()
        console.warn("remove.bg failed after Gemini:", res.status, errText.slice(0, 200))
        if (res.status === 429 || res.status >= 500) {
          await sleep(Math.min(2_000 * 2 ** attempt, 12_000))
          continue
        }
        break
      } catch (err) {
        console.warn("remove.bg error after Gemini:", err)
        await sleep(Math.min(2_000 * 2 ** attempt, 12_000))
      }
    }
  }

  if (opts?.required) {
    throw new Error("Studio cutout failed after retries — not uploading original background")
  }

  console.warn("Studio polish unavailable — keeping original photo")
  return { buffer: input, mimeType: normalized, bgRemoved: false }
}

export type AnalyzeMode = "catalog" | "cutout" | "full" | "store"

async function uploadProcessed(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
): Promise<string | null> {
  try {
    const saved = await uploadImage(buffer, "donations", mimeType)
    return saved.url
  } catch (uploadErr: any) {
    console.error("analyzeOne upload failed, retrying once:", originalName, uploadErr?.message || uploadErr)
    try {
      const saved = await uploadImage(buffer, "donations", mimeType)
      return saved.url
    } catch (retryErr: any) {
      console.error("analyzeOne upload retry failed:", originalName, retryErr?.message || retryErr)
      return null
    }
  }
}

async function analyzeOne(
  file: UploadedFile,
  mode: AnalyzeMode = "full",
): Promise<AnalyzeOk | AnalyzeFail> {
  const originalName = file.filename || "photo.jpg"
  try {
    if (!file.buffer?.length) {
      return { ok: false, originalName, filename: originalName, error: "Empty image file" }
    }
    const mime = normalizeMime(file.mimeType, file.filename)
    const envSkipBg = process.env.RELOVED_PHOTO_BG_REMOVE !== "1"

    // store = upload only (submit rescue). catalog = upload first, then titles (AI optional).
    // cutout = studio only. full = legacy cutout→catalog.
    if (mode === "store") {
      const savedUrl = await uploadProcessed(file.buffer, mime, originalName)
      if (!savedUrl) {
        return { ok: false, originalName, filename: originalName, error: "Could not save photo" }
      }
      const stub: AnalyzeSuggestion = {
        title: "Preloved item",
        category: "Tops",
        gender: "unisex",
        description: "Preloved item ready to Relove.",
        condition: "Good",
        brand: null,
      }
      return {
        ok: true,
        originalName,
        filename: originalName,
        storagePath: savedUrl,
        url: savedUrl,
        suggestion: stub,
        bgRemoved: false,
        sensitiveDetected: false,
        sensitiveReason: null,
      }
    }

    if (mode === "catalog" || (mode === "full" && envSkipBg)) {
      // Save to Storage first so Drop submit never depends on Gemini being up.
      const savedUrl = await uploadProcessed(file.buffer, mime, originalName)
      if (!savedUrl) {
        return { ok: false, originalName, filename: originalName, error: "Could not save processed photo" }
      }
      let suggestion: AnalyzeSuggestion
      try {
        suggestion = await callGemini(file.buffer, mime)
      } catch (aiErr: any) {
        console.warn("catalog Gemini failed after upload; keeping photo:", originalName, aiErr?.message || aiErr)
        suggestion = {
          title: "Preloved item",
          category: "Tops",
          gender: "unisex",
          description: "Preloved item ready to Relove.",
          condition: "Good",
          brand: null,
        }
      }
      return {
        ok: true,
        originalName,
        filename: originalName,
        storagePath: savedUrl,
        url: savedUrl,
        suggestion,
        bgRemoved: false,
        sensitiveDetected: Boolean(suggestion.sensitiveDetected),
        sensitiveReason: suggestion.sensitiveReason || null,
      }
    }

    if (mode === "cutout") {
      const processed = await processPhoto(file.buffer, mime, {
        skipBg: envSkipBg,
        required: !envSkipBg,
      })
      const savedUrl = await uploadProcessed(processed.buffer, processed.mimeType, originalName)
      if (!savedUrl) {
        return { ok: false, originalName, filename: originalName, error: "Could not save processed photo" }
      }
      const stub: AnalyzeSuggestion = {
        title: "Preloved item",
        category: "Tops",
        gender: "unisex",
        description: "Preloved item ready to Relove.",
        condition: "Good",
        brand: null,
      }
      return {
        ok: true,
        originalName,
        filename: originalName,
        storagePath: savedUrl,
        url: savedUrl,
        suggestion: stub,
        bgRemoved: processed.bgRemoved,
        sensitiveDetected: false,
        sensitiveReason: null,
      }
    }

    // full: cutout first, then catalog on cutout (legacy).
    const processed = await processPhoto(file.buffer, mime, {
      skipBg: envSkipBg,
      required: !envSkipBg,
    })
    let suggestion: AnalyzeSuggestion
    try {
      suggestion = await callGemini(processed.buffer, processed.mimeType)
    } catch (aiErr: any) {
      console.warn("full-mode catalog AI failed after cutout; keeping photo:", originalName, aiErr?.message || aiErr)
      suggestion = {
        title: "Preloved item",
        category: "Tops",
        gender: "unisex",
        description: "Preloved item ready to Relove.",
        condition: "Good",
        brand: null,
      }
    }
    const savedUrl = await uploadProcessed(processed.buffer, processed.mimeType, originalName)
    if (!savedUrl) {
      return { ok: false, originalName, filename: originalName, error: "Could not save processed photo" }
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
      error: err?.message?.includes("Studio cutout")
        ? "Studio cutout failed — please try that photo again"
        : "Photo analysis failed",
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
  const controller = new AbortController()
  // Dead relay hosts used to hang ~20s+ before fallback — fail fast.
  const timeout = setTimeout(() => controller.abort(), 8_000)
  let relayRes: Response
  let relayText: string
  try {
    relayRes = await fetch(relayUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
      signal: controller.signal,
    })
    relayText = await relayRes.text()
  } finally {
    clearTimeout(timeout)
  }
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
 * mode=catalog → titles first (no cutout). mode=cutout → studio only. mode=full → legacy.
 */
export async function analyzePhotosViaLightsail(
  files: UploadedFile[],
  mode: AnalyzeMode = "full",
): Promise<AnalyzeResponse> {
  if (files.length === 0) {
    throw Object.assign(new Error("No photos uploaded"), { status: 400 })
  }

  // Lightsail relay is cutout-oriented — only use for full/cutout modes.
  const relayUrl = (process.env.PHOTO_ANALYZE_RELAY_URL || "").trim()
  if (relayUrl && mode !== "catalog" && mode !== "store") {
    try {
      const viaRelay = await analyzeViaLightsailRelay(files.slice(0, 30))
      if (viaRelay.results.some((r) => r.ok)) return viaRelay
    } catch (err) {
      console.warn("Lightsail relay failed, falling back to Firebase-native Gemini:", err)
    }
  }

  const envConcurrency = Number(process.env.PHOTO_ANALYZE_CONCURRENCY)
  const concurrency =
    Number.isFinite(envConcurrency) && envConcurrency > 0
      ? envConcurrency
      : mode === "catalog" || mode === "store"
        ? 4
        : mode === "cutout"
          ? 3
          : process.env.RELOVED_PHOTO_BG_REMOVE !== "1"
            ? 4
            : 3

  const startMs = Date.now()
  const results = await mapPool(files.slice(0, 30), concurrency, (f) => analyzeOne(f, mode))
  logTiming("photo_analyze", Date.now() - startMs, {
    count: files.length,
    status: results.some((r) => r.ok) ? "ok" : "failed",
  })

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

/** Maximum download buffer size: 15MB to prevent memory exhaustion / decompression bombs. */
const MAX_IMAGE_DOWNLOAD_BYTES = 15 * 1024 * 1024

function isAllowedImageUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    const hostname = u.hostname.toLowerCase()
    // Block AWS/GCP instance metadata IPs, loopback, and private internal networks (SSRF prevention)
    if (
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/** Download a Storage HTTPS URL (or any http image) safely with SSRF and size bounds. */
export async function fetchImageBuffer(
  pathOrUrl: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `https://storage.googleapis.com/${process.env.STORAGE_BUCKET || "reloved-digital-uploads"}/${pathOrUrl.replace(/^\//, "")}`

    if (!isAllowedImageUrl(url)) {
      console.warn("fetchImageBuffer rejected untrusted/SSRF URL:", pathOrUrl)
      return null
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)

    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return null
      const contentLength = Number(res.headers.get("content-length"))
      if (contentLength > MAX_IMAGE_DOWNLOAD_BYTES) {
        console.warn("fetchImageBuffer file exceeds size limit:", pathOrUrl, contentLength)
        return null
      }
      const mimeType = res.headers.get("content-type") || "image/jpeg"
      const arrayBuf = await res.arrayBuffer()
      if (arrayBuf.byteLength > MAX_IMAGE_DOWNLOAD_BYTES) {
        return null
      }
      return { buffer: Buffer.from(arrayBuf), mimeType }
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    console.warn("fetchImageBuffer failed:", pathOrUrl, err)
    return null
  }
}

export type ItemImageForPolish = {
  storagePath: string
  imageType: string
  sortOrder: number
  bgRemoved?: boolean
}

// Bounded deduplication cache (max 500 entries) with FIFO eviction to prevent memory leaks
const MAX_POLISHED_CACHE_ENTRIES = 500
const _polishedCache = new Map<string, string>() // original storagePath -> polished storagePath
const _activePolishes = new Map<string, Promise<ItemImageForPolish>>()

function setPolishedCache(key: string, value: string): void {
  if (_polishedCache.size >= MAX_POLISHED_CACHE_ENTRIES) {
    const iter = _polishedCache.keys()
    for (let i = 0; i < 50; i++) {
      const nextKey = iter.next().value
      if (nextKey) _polishedCache.delete(nextKey)
      else break
    }
  }
  _polishedCache.set(key, value)
}

/** Run ghost-mannequin studio polish on item images concurrently with deduplication. */
export async function polishItemImages(
  images: ItemImageForPolish[],
): Promise<{ images: ItemImageForPolish[]; allReady: boolean }> {
  const envSkipBg = process.env.RELOVED_PHOTO_BG_REMOVE !== "1"
  if (envSkipBg) {
    // Cutouts disabled in this deploy — leave flags alone so a later enable can retry.
    return { images, allReady: true }
  }

  const envConcurrency = Number(process.env.POLISH_CONCURRENCY)
  const polishConcurrency = Number.isFinite(envConcurrency) && envConcurrency > 0 ? envConcurrency : 3

  const startMs = Date.now()

  async function polishSingleImage(img: ItemImageForPolish): Promise<ItemImageForPolish> {
    if (img.bgRemoved === true) {
      return img
    }

    // Check duplicate/cache first
    if (_polishedCache.has(img.storagePath)) {
      return {
        ...img,
        storagePath: _polishedCache.get(img.storagePath)!,
        bgRemoved: true,
      }
    }

    // In-flight coalescing: if this exact image is already being polished, join that promise
    const inFlight = _activePolishes.get(img.storagePath)
    if (inFlight) {
      try {
        const res = await inFlight
        return { ...img, storagePath: res.storagePath, bgRemoved: res.bgRemoved }
      } catch {
        // Fall through to retry on our own
      }
    }

    const polishPromise = (async (): Promise<ItemImageForPolish> => {
      const fetched = await fetchImageBuffer(img.storagePath)
      if (!fetched?.buffer?.length) {
        return { ...img, bgRemoved: false }
      }
      try {
        const processed = await processPhoto(fetched.buffer, fetched.mimeType, {
          skipBg: false,
          required: false,
        })
        if (processed.bgRemoved) {
          const saved = await uploadImage(processed.buffer, "donations", processed.mimeType)
          setPolishedCache(img.storagePath, saved.url)
          return {
            ...img,
            storagePath: saved.url,
            bgRemoved: true,
          }
        }
        return { ...img, bgRemoved: false }
      } catch (err) {
        console.error("polishItemImages cutout failed:", img.storagePath, err)
        return { ...img, bgRemoved: false }
      } finally {
        _activePolishes.delete(img.storagePath)
      }
    })()

    _activePolishes.set(img.storagePath, polishPromise)
    return await polishPromise
  }

  const next = await mapPool(images, polishConcurrency, polishSingleImage)
  const allReady = next.length > 0 && next.every((img) => img.bgRemoved === true)

  logTiming("studio_polish", Date.now() - startMs, {
    count: images.length,
    status: allReady ? "ok" : "failed",
  })

  // Prefer polished cutouts first so Wall / cards never show a grey original
  // while a successful ghost-mannequin shot sits at index 1+.
  next.sort((a, b) => {
    const aOk = a.bgRemoved === true ? 0 : 1
    const bOk = b.bgRemoved === true ? 0 : 1
    if (aOk !== bOk) return aOk - bOk
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  })
  next.forEach((img, i) => {
    img.sortOrder = i
  })
  return { images: next, allReady }
}
