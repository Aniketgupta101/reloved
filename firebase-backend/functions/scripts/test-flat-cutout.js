/**
 * Diagnose flat cutout on one Wall item's dirty original.
 *   node scripts/test-flat-cutout.js --item=1WxRhkw7r89jYaOHUPl7
 */
const fs = require("fs")
const path = require("path")

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = val
  }
}

loadEnv(path.join(__dirname, "../.env.reloved-digital"))

async function main() {
  const itemArg = process.argv.find((a) => a.startsWith("--item="))
  const itemId = itemArg ? itemArg.split("=")[1] : "1WxRhkw7r89jYaOHUPl7"
  const apiBase = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(
    /\/$/,
    "",
  )
  const loginRes = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  })
  const { token } = await loginRes.json()
  const adminRes = await fetch(`${apiBase}/api/admin/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const items = (await adminRes.json()).items || []
  const item = items.find((i) => i.id === itemId)
  if (!item) throw new Error("item not found")
  const dirty = (item.images || []).find(
    (img) => img.imageType === "original" && img.bgRemoved !== true && img.storagePath,
  )
  if (!dirty) {
    console.log("no dirty original", item.images)
    return
  }
  console.log("fetching", dirty.storagePath.slice(0, 80))
  const imgRes = await fetch(dirty.storagePath)
  if (!imgRes.ok) throw new Error(`fetch ${imgRes.status}`)
  const buf = Buffer.from(await imgRes.arrayBuffer())
  const mime = imgRes.headers.get("content-type") || "image/jpeg"
  console.log("bytes", buf.length, mime)

  const keys = String(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
    .split(/[,;]+/)
    .map((k) => k.trim())
    .filter(Boolean)
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image"
  const prompt = `Create a clean product cutout of the EXACT item in this photo for Reloved.
Remove EVERYTHING behind the item (marble walls, rooms, furniture, people).
Place the item alone on pure flat white (#FFFFFF). Keep the garment exactly as photographed.
Return only the edited photo.`

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    console.log(`\ntry key …${key.slice(-6)} model=${model}`)
    const started = Date.now()
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mime, data: buf.toString("base64") } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature: 0.2 },
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      const secs = Math.round((Date.now() - started) / 1000)
      console.log(`status ${res.status} ${secs}s len=${text.length}`)
      if (!res.ok) {
        console.log(text.slice(0, 300))
        continue
      }
      const payload = JSON.parse(text)
      const parts = payload?.candidates?.[0]?.content?.parts || []
      const finish = payload?.candidates?.[0]?.finishReason
      console.log("finish", finish, "parts", parts.map((p) => Object.keys(p).join("/")))
      const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data)
      if (imgPart) {
        const b64 = imgPart.inlineData?.data || imgPart.inline_data?.data
        console.log("GOT IMAGE", Math.round((b64.length * 3) / 4 / 1024), "KB")
        fs.writeFileSync(
          path.join(__dirname, `_test-flat-${itemId}.jpg`),
          Buffer.from(b64, "base64"),
        )
        console.log("wrote scripts/_test-flat-*.jpg")
        return
      }
      const t = parts.find((p) => p.text)?.text
      if (t) console.log("text only:", String(t).slice(0, 200))
    } catch (err) {
      console.error("err", err?.message || err)
    }
  }
  console.log("ALL KEYS FAILED")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
