import { GoogleAuth } from "google-auth-library"

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] })
const client = await auth.getClient()
const token = (await client.getAccessToken()).token
const projectId = "reloved-digital"
const location = "us-central1"

// Tiny valid JPEG
const jpegB64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z"

const models = [
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image-preview",
]

const prompt =
  "Place this clothing item on a pure white studio background. Keep the item unchanged. Return only the edited photo."

for (const model of models) {
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/jpeg", data: jpegB64 } },
        ],
      },
    ],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  }
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 45000)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    const hasImg = /"mimeType"\s*:\s*"image\//.test(text) || /"data"\s*:\s*"[A-Za-z0-9+/=]{80,}/.test(text)
    console.log(model, res.status, hasImg ? "HAS_IMAGE" : "no-image", text.slice(0, 220).replace(/\s+/g, " "))
  } catch (e) {
    console.log(model, "ERR", e.message)
  } finally {
    clearTimeout(t)
  }
}
