import { GoogleAuth } from "google-auth-library"
import { readFileSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// Minimal valid JPEG (320x240 solid blue) generated as base64
const jpegB64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQDxAQDw8PDw8PDw8PDw8PFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAAAQID/8QAFhEBAQEAAAAAAAAAAAAAAAAAAAER/9oADAMBAAIQAxAAAAGcf//EABYQAQEBAAAAAAAAAAAAAAAAAAABEf/aAAgBAQABBQLTf//EABYRAQEBAAAAAAAAAAAAAAAAAAABEf/aAAgBAwEBPwFz/8QAFhEBAQEAAAAAAAAAAAAAAAAAAAER/9oACAECAQE/AWv/xAAUEAEAAAAAAAAAAAAAAAAAAAAg/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAg/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEPP/xAAUEQEAAAAAAAAAAAAAAAAAAAAg/9oACAEDAQE/EF//xAAUEQEAAAAAAAAAAAAAAAAAAAAg/9oACAECAQE/EF//xAAUEAEAAAAAAAAAAAAAAAAAAAAg/9oACAEBAAE/EF//2Q=="

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
})
const token = (await (await auth.getClient()).getAccessToken()).token
const projectId = "reloved-digital"
const model = "gemini-2.5-flash"
const loc = "us-central1"
const url = `https://${loc}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${loc}/publishers/google/models/${model}:generateContent`
const body = {
  contents: [
    {
      role: "user",
      parts: [
        {
          text: 'Return ONLY JSON: {"title":"Blue test item","category":"Tops","gender":"unisex","description":"Test","condition":"Good","brand":null}',
        },
        { inlineData: { mimeType: "image/jpeg", data: jpegB64 } },
      ],
    },
  ],
  generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
}
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
})
console.log("status", res.status)
console.log((await res.text()).slice(0, 800))

// Also grant Cloud Functions runtime SA Vertex AI User
const sa = "serviceAccount:697648556509-compute@developer.gserviceaccount.com"
const policyUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`
const policyRes = await fetch(policyUrl, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: "{}",
})
const policy = await policyRes.json()
const role = "roles/aiplatform.user"
let binding = (policy.bindings || []).find((b) => b.role === role)
if (!binding) {
  binding = { role, members: [] }
  policy.bindings = [...(policy.bindings || []), binding]
}
if (!binding.members.includes(sa)) {
  binding.members.push(sa)
  const setUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`
  const setRes = await fetch(setUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ policy }),
  })
  console.log("IAM grant", setRes.status, (await setRes.text()).slice(0, 200))
} else {
  console.log("IAM already has aiplatform.user on compute SA")
}
