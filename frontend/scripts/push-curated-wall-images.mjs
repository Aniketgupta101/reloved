/**
 * Push curated main t-shirt + pants photos to Wall of Kindness via admin bulk-upload.
 *
 * Skips:
 *   - shirts #14 (tag-only close-up)
 *   - pants #05 (duplicate of #06)
 *
 *   node scripts/push-curated-wall-images.mjs
 */
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"

const TSHIRTS_DIR = process.env.TSHIRTS_DIR || "c:\\Users\\PC 3\\Downloads\\main_tshirts_images"
const PANTS_DIR = process.env.PANTS_DIR || "c:\\Users\\PC 3\\Downloads\\main_pants_images"

const SKIP_TSHIRT = new Set(["14_canali_blackedition_stripe_shirt_TAGONLY.jpg"])
const SKIP_PANTS = new Set(["05_navy_dress_pants.jpg"])

function titleFromFilename(name) {
  const base = name.replace(/\.[^.]+$/, "").replace(/^\d+_/, "")
  return base
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .replace(/\bBoss\b/g, "BOSS")
    .replace(/\bCanali\b/g, "Canali")
    .replace(/\bBrooksbrothers\b/g, "Brooks Brothers")
    .replace(/\bScotchsoda\b/g, "Scotch & Soda")
    .replace(/\bGiordano\b/g, "Giordano")
    .replace(/\bArmani\b/g, "Armani")
    .replace(/\bHugo\b/g, "HUGO")
    .replace(/\bTagonly\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function brandFromFilename(name) {
  const lower = name.toLowerCase()
  if (lower.includes("boss") || lower.includes("hugo")) return "BOSS / HUGO"
  if (lower.includes("canali")) return "Canali"
  if (lower.includes("brooksbrothers")) return "Brooks Brothers"
  if (lower.includes("scotchsoda")) return "Scotch & Soda"
  if (lower.includes("giordano")) return "Giordano"
  if (lower.includes("armani")) return "Armani"
  if (lower.includes("blauwrecords")) return "Blauw Records"
  return null
}

async function listImages(dir, skip) {
  const files = await readdir(dir)
  return files
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .filter((f) => !skip.has(f))
    .sort()
    .map((f) => ({ dir, file: f, full: path.join(dir, f) }))
}

async function adminToken() {
  const login = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.json())
  if (!login.token) throw new Error(`Admin login failed: ${JSON.stringify(login)}`)
  return login.token
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function analyzeBatch(token, entries) {
  const form = new FormData()
  for (const e of entries) {
    const buf = await readFile(e.full)
    // Node 20+: File works more reliably than Blob for multipart filename
    const file = new File([buf], e.file, { type: "image/jpeg" })
    form.append("photos", file)
  }
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
  } catch (err) {
    const cause = err?.cause ? ` cause=${err.cause}` : ""
    throw new Error(`Analyze fetch failed: ${err.message}${cause}`)
  } finally {
    clearTimeout(timer)
  }
}

async function commitBatch(token, items) {
  const res = await fetch(`${API_BASE}/api/admin/bulk-upload/commit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(JSON.stringify(body.error || body) || `Commit failed (${res.status})`)
  return body
}

function buildCommitItem(entry, analyzed, kind) {
  const suggestion = analyzed?.ok ? analyzed.suggestion : null
  const title = titleFromFilename(entry.file)
  const brand = brandFromFilename(entry.file) || suggestion?.brand || null
  const category = kind === "pants" ? "Bottoms" : "Tops"
  const description =
    suggestion?.description?.trim() ||
    (kind === "pants"
      ? `Men's preloved ${title}. Clean and ready to rehome via Reloved Wall of Kindness.`
      : `Men's preloved ${title}. Clean and ready to rehome via Reloved Wall of Kindness.`)

  if (!analyzed?.ok || !analyzed.storagePath) {
    throw new Error(`Analyze failed for ${entry.file}: ${analyzed?.error || "no storagePath"}`)
  }

  return {
    storagePath: analyzed.storagePath,
    title: title.slice(0, 120),
    category,
    gender: "men",
    description: description.slice(0, 2000),
    condition: suggestion?.condition || "Good",
    brand,
    size: null,
    quantity: 1,
    locality: "Juhu",
  }
}

async function main() {
  const shirts = (await listImages(TSHIRTS_DIR, SKIP_TSHIRT)).map((e) => ({ ...e, kind: "shirts" }))
  const pants = (await listImages(PANTS_DIR, SKIP_PANTS)).map((e) => ({ ...e, kind: "pants" }))
  const all = [...shirts, ...pants]

  console.log(`Shirts to upload: ${shirts.length} (skipped ${[...SKIP_TSHIRT].join(", ")})`)
  console.log(`Pants to upload:  ${pants.length} (skipped ${[...SKIP_PANTS].join(", ")})`)
  console.log(`Total: ${all.length}`)

  const token = await adminToken()
  console.log("Admin login OK")

  // Deploy note: commit schema must allow Tops/Bottoms on live API.
  // If commit 400s on category, deploy functions first.
  let created = 0
  for (const batch of chunk(all, 3)) {
    console.log(`\nAnalyzing batch of ${batch.length}...`)
    const analyzed = await analyzeBatch(token, batch)
    const results = analyzed.results || []
    if (results.length !== batch.length) {
      console.warn(`Expected ${batch.length} results, got ${results.length}`)
    }

    const items = batch.map((entry, i) => buildCommitItem(entry, results[i], entry.kind))
    console.log("Committing:", items.map((it) => it.title).join(" | "))
    const saved = await commitBatch(token, items)
    created += (saved.items || []).length
    console.log(`Saved ${saved.items?.length || 0} (running total ${created})`)
  }

  console.log(`\nDone. ${created} items live on Wall of Kindness (available).`)
  console.log("Check: https://reloved-digital.web.app/drop")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
