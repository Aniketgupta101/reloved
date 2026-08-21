import { GoogleGenAI, Type } from "@google/genai"

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"
const isConfigured = Boolean(GEMINI_API_KEY)

const client = isConfigured ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null

export const CATEGORIES = ["Clothing", "Footwear", "Accessories", "Books & Learning", "Home", "Art & Hobby"] as const
export const CONDITIONS = ["Excellent", "Good", "Fair but fully usable"] as const

export interface ItemSuggestion {
  category: (typeof CATEGORIES)[number]
  title: string
  description: string
  condition: (typeof CONDITIONS)[number]
  brand: string | null
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING, enum: [...CATEGORIES] },
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    condition: { type: Type.STRING, enum: [...CONDITIONS] },
    brand: { type: Type.STRING, nullable: true },
  },
  required: ["category", "title", "description", "condition"],
}

const PROMPT = `You are cataloguing a donated secondhand item for reloved, a Wall of Kindness platform. Look at this product photo (already background-removed onto white) and suggest:
- category: the single best fit from the allowed list
- title: a short, appealing item title (e.g. "Vintage Levi's Denim Jacket"), max 8 words
- description: 1-2 honest sentences describing the item, its style and apparent use, written for someone browsing to receive it for free — no price language, no "donate" language
- condition: your best visual guess of wear level
- brand: the visible brand name if legible in the photo, otherwise null

Respond only with the structured fields requested.`

/** Dev fallback used when GEMINI_API_KEY isn't set, so the bulk-upload flow is testable end to end locally without a real key. */
function stubSuggestion(): ItemSuggestion {
  return {
    category: "Clothing",
    title: "Untitled item — edit before saving",
    description: "AI description unavailable in dev mode (no GEMINI_API_KEY set). Edit this before publishing.",
    condition: "Good",
    brand: null,
  }
}

export async function suggestItemDetails(imageBuffer: Buffer, mimeType = "image/png"): Promise<ItemSuggestion> {
  if (!isConfigured || !client) {
    console.log("[dev] Gemini not configured — returning stub item suggestion")
    return stubSuggestion()
  }

  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType, data: imageBuffer.toString("base64") } },
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
    }
  } catch (err) {
    console.error("Gemini suggestion failed, falling back to stub:", err)
    return stubSuggestion()
  }
}
