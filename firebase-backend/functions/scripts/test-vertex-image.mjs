import { GoogleAuth } from "google-auth-library"
import { readFileSync } from "fs"

const imgPath = process.argv[2]
const buf = readFileSync(imgPath)
const b64 = buf.toString("base64")
const mime = imgPath.endsWith(".png") ? "image/png" : "image/jpeg"

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
          text: 'Return ONLY JSON: {"title":"t","category":"Tops","gender":"unisex","description":"d","condition":"Good","brand":null}',
        },
        { inlineData: { mimeType: mime, data: b64 } },
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
console.log((await res.text()).slice(0, 1000))
