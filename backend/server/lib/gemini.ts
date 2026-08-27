import { GoogleGenAI, Type } from "@google/genai"
import sharp from "sharp"
import { LAUNCH_CATEGORIES } from "../../../shared/schemas.js"

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"
const isConfigured = Boolean(GEMINI_API_KEY)

const client = isConfigured ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null

// Re-exported so callers (bulk-upload route, frontend) have one source of
// truth for the launch taxonomy instead of duplicating the list.
export const CATEGORIES = LAUNCH_CATEGORIES
export const CONDITIONS = ["Excellent", "Good", "Fair but fully usable"] as const
export const GENDERS = ["men", "women", "unisex", "kids"] as const

export interface ItemSuggestion {
  category: (typeof CATEGORIES)[number]
  title: string
  description: string
  condition: (typeof CONDITIONS)[number]
  brand: string | null
  gender: (typeof GENDERS)[number]
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING, enum: [...CATEGORIES] },
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    condition: { type: Type.STRING, enum: [...CONDITIONS] },
    brand: { type: Type.STRING, nullable: true },
    gender: { type: Type.STRING, enum: [...GENDERS] },
  },
  required: ["category", "title", "description", "condition", "gender"],
}

const PROMPT = `You are cataloguing a donated secondhand item for reloved, a Wall of Kindness platform. Look at this product photo (already background-removed onto white) and suggest:
- category: the single best fit from the allowed list
- title: a short, appealing item title (e.g. "Vintage Levi's Denim Jacket"), max 8 words
- description: 1-2 honest sentences describing the item, its style and apparent use, written for someone browsing to receive it for free — no price language, no "donate" language
- condition: your best visual guess of wear level
- brand: the visible brand name if legible in the photo, otherwise null
- gender: who the item is styled/cut for — "men", "women", "kids" if it's a children's size, or "unisex" if genuinely not gendered (e.g. many bags, some footwear)

Respond only with the structured fields requested.`

/** Fallback used when Gemini isn't configured or the call fails after retries. */
function stubSuggestion(reason = "unavailable"): ItemSuggestion {
  return {
    category: "Clothing",
    title: "Untitled item — edit before saving",
    description:
      reason === "missing-key"
        ? "AI description unavailable (no GEMINI_API_KEY set). Edit this before publishing."
        : "AI couldn't fill this automatically right now. Please edit the details before publishing.",
    condition: "Good",
    brand: null,
    gender: "unisex",
  }
}

// Gemini's vision tokenization scales with pixel count, not file size — the
// caller's buffer is already display-resolution (1600px), which is far more
// detail than category/title/condition guessing needs. Shrinking further
// here cuts tokens (and latency) on every analysis call without touching
// what actually gets saved/shown.
async function compressForAnalysis(imageBuffer: Buffer): Promise<{ data: string; mimeType: string }> {
  const resized = await sharp(imageBuffer)
    .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer()
  return { data: resized.toString("base64"), mimeType: "image/jpeg" }
}

// Gemini occasionally returns a transient 503 ("model is currently
// experiencing high demand") that clears up within a second or two —
// confirmed in production logs. Retrying a couple of times before giving
// up on the stub avoids surfacing Google's momentary overload as "the AI
// doesn't work". Non-transient errors (bad key, malformed request) fail
// on the first attempt as before.
function isTransientGeminiError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /"code":503|"code":429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|Quota exceeded|rate.limit/i.test(message)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function suggestItemDetails(imageBuffer: Buffer): Promise<ItemSuggestion> {
  if (!isConfigured || !client) {
    console.log("[dev] Gemini not configured — returning stub item suggestion")
    return stubSuggestion("missing-key")
  }

  const { data, mimeType } = await compressForAnalysis(imageBuffer)
  const maxAttempts = 3

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType, data } },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema,
        },
      })

      const text = response.text
      if (!text) throw new Error("Empty response from Gemini")

      const parsed = JSON.parse(text)
      return {
        category: CATEGORIES.includes(parsed.category) ? parsed.category : "Clothing",
        title: String(parsed.title || "Untitled item"),
        description: String(parsed.description || ""),
        condition: CONDITIONS.includes(parsed.condition) ? parsed.condition : "Good",
        brand: parsed.brand ? String(parsed.brand) : null,
        gender: GENDERS.includes(parsed.gender) ? parsed.gender : "unisex",
      }
    } catch (err) {
      const canRetry = attempt < maxAttempts && isTransientGeminiError(err)
      console.error(`Gemini suggestion attempt ${attempt}/${maxAttempts} failed${canRetry ? ", retrying" : ""}:`, err)
      if (!canRetry) return stubSuggestion()
      // 429 free-tier needs longer backoff than a brief 503 blip
      const message = err instanceof Error ? err.message : String(err)
      const base = /"code":429|RESOURCE_EXHAUSTED|Quota exceeded|rate.limit/i.test(message)
        ? 12_000
        : 800
      await sleep(attempt * base)
    }
  }

  return stubSuggestion()
}
