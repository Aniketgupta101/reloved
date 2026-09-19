/**
 * One-off: re-run AI BG removal on two Wall items that kept raw backgrounds.
 * node scripts/reprocess-two-wall-cutouts.mjs
 */
import { writeFile, unlink } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"

const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"

const TARGETS = [
  { id: "fHVPJGzFg0DYsQL1RZwR", title: "Strapless top" },
  { id: "edzHPFnOpQtBnhqr9NPC", title: "Mango Crop top Forever young" },
]

async function adminToken() {
  const login = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.json())
  if (!login.token) throw new Error(`Admin login failed: ${JSON.stringify(login)}`)
  return login.token
}

async function getItem(token, id) {
  const wall = await fetch(`${API_BASE}/api/items?status=wall`).then((r) => r.json())
  const fromWall = (wall.items || []).find((it) => it.id === id)
  if (fromWall) return fromWall
  const admin = await fetch(`${API_BASE}/api/admin/items`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  return (admin.items || []).find((it) => it.id === id)
}

async function analyzePhoto(token, buf, filename) {
  const form = new FormData()
  form.append("photos", new File([buf], filename, { type: "image/jpeg" }))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180_000)
  try {
    const res = await fetch(`${API_BASE}/api/admin/bulk-upload/analyze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `Analyze failed (${res.status})`)
    return body
  } finally {
    clearTimeout(timer)
  }
}

async function patchImages(token, id, storagePath, prev) {
  const res = await fetch(`${API_BASE}/api/admin/items/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      images: [
        {
          ...(prev || {}),
          storagePath,
          imageType: "product",
          sortOrder: 0,
        },
      ],
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(JSON.stringify(body) || `PATCH failed (${res.status})`)
  return body
}

async function main() {
  const token = await adminToken()
  console.log("Admin OK")

  for (const t of TARGETS) {
    console.log("\n---", t.title, t.id)
    const item = await getItem(token, t.id)
    if (!item) {
      console.error("NOT FOUND")
      continue
    }
    const oldPath = String(item.images?.[0]?.storagePath || "").split("?")[0]
    if (!oldPath) {
      console.error("No image")
      continue
    }
    console.log("Downloading", oldPath)
    const imgRes = await fetch(oldPath)
    if (!imgRes.ok) throw new Error(`Download failed ${imgRes.status}`)
    const buf = Buffer.from(await imgRes.arrayBuffer())
    console.log(`Bytes ${buf.length}, analyzing…`)

    const analyzed = await analyzePhoto(token, buf, `${t.id}.jpg`)
    const result = analyzed.results?.[0]
    if (!result?.ok) {
      console.error("Analyze failed:", result || analyzed)
      continue
    }
    const newUrl = result.storagePath || result.url
    console.log("bgRemoved:", result.bgRemoved, "new:", newUrl)
    if (!newUrl) {
      console.error("No new URL")
      continue
    }
    if (result.bgRemoved === false) {
      console.warn("WARNING: bg still not removed — updating URL anyway only if different")
    }
    if (newUrl.split("?")[0] === oldPath) {
      console.warn("Same URL as before — cutout may have failed; skipping PATCH")
      continue
    }
    await patchImages(token, t.id, `${newUrl}?v=recut1`, item.images?.[0])
    console.log("UPDATED", t.title)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
