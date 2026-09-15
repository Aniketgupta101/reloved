import { GoogleAuth } from "google-auth-library"
import { writeFileSync } from "fs"

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
})
const client = await auth.getClient()
const token = (await client.getAccessToken()).token
const projectId = "reloved-digital"

for (const api of ["aiplatform.googleapis.com", "generativelanguage.googleapis.com"]) {
  const url = `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api}:enable`
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  })
  console.log("enable", api, res.status, (await res.text()).slice(0, 200))
}

// Create a Google AI Studio API key via API keys API if possible is complex;
// instead wait and test Vertex.
const b64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Cf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Cf//Z"

const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.0-flash-001:generateContent`
const body = {
  contents: [
    {
      role: "user",
      parts: [
        { text: 'Return JSON {"title":"test"}' },
        { inlineData: { mimeType: "image/jpeg", data: b64 } },
      ],
    },
  ],
  generationConfig: { responseMimeType: "application/json" },
}
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
})
const text = await res.text()
console.log("vertex", res.status, text.slice(0, 600))
writeFileSync("/tmp/vertex-test.json", text)
