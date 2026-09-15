import { GoogleAuth } from "google-auth-library"

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
})
const token = (await (await auth.getClient()).getAccessToken()).token
const projectId = "reloved-digital"
const b64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6aAAAAAElFTkSuQmCC"

const models = [
  ["us-central1", "gemini-2.0-flash-001"],
  ["us-central1", "gemini-2.0-flash"],
  ["us-central1", "gemini-1.5-flash"],
  ["us-central1", "gemini-1.5-flash-002"],
  ["us-central1", "gemini-2.5-flash"],
  ["global", "gemini-2.0-flash-001"],
  ["global", "gemini-2.0-flash"],
  ["asia-south1", "gemini-2.0-flash-001"],
]

const body = JSON.stringify({
  contents: [
    {
      role: "user",
      parts: [
        { text: 'Reply with JSON {"ok":true}' },
        { inlineData: { mimeType: "image/png", data: b64 } },
      ],
    },
  ],
  generationConfig: { responseMimeType: "application/json" },
})

for (const [loc, model] of models) {
  const host = loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`
  const url = `https://${host}/v1/projects/${projectId}/locations/${loc}/publishers/google/models/${model}:generateContent`
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  })
  const t = await res.text()
  console.log(loc, model, res.status, t.slice(0, 180).replace(/\n/g, " "))
}
