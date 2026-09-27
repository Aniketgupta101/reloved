/**
 * Force studio cutout for one Wall item (by id).
 *
 *   node scripts/polish-item.js eyu6IDa7BNDBhP8v2Za9
 *
 * Uses live API + RELOVED_POLISH_SECRET from .env.reloved-digital (after deploy),
 * or falls back to local Admin SDK + polishItemImages when --local is passed.
 */
const path = require("path")
const fs = require("fs")

const envPath = path.join(__dirname, "../.env.reloved-digital")
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue
  const i = line.indexOf("=")
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  let v = line.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1)
  }
  if (!(k in process.env)) process.env[k] = v
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"))
const itemId = args[0] || ""
const local = process.argv.includes("--local")
const apiBase =
  process.env.PUBLIC_API_URL ||
  "https://asia-south1-reloved-digital.cloudfunctions.net/api"

async function viaApi() {
  const secret = process.env.RELOVED_POLISH_SECRET || process.env.ADMIN_SESSION_SECRET || ""
  if (!secret) throw new Error("RELOVED_POLISH_SECRET missing")
  const res = await fetch(`${apiBase}/api/donations/polish-item-images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-reloved-polish-secret": secret,
    },
    body: JSON.stringify({ itemId, force: true }),
  })
  const text = await res.text()
  console.log("status", res.status, text)
  if (!res.ok) process.exit(1)
}

async function viaLocal() {
  process.env.RELOVED_PHOTO_BG_REMOVE = "1"
  // Use compiled lib
  const { polishItemImages } = require("../lib/lib/photoAnalyze")
  const { getDb, collections } = require("../lib/lib/firestore")
  const { ensureFirebaseApp } = require("../lib/lib/firebaseApp")
  const { FieldValue } = require("firebase-admin/firestore")
  ensureFirebaseApp()
  const db = getDb()
  const ref = db.collection(collections.items).doc(itemId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error("item not found")
  const data = snap.data() || {}
  const images = Array.isArray(data.images) ? data.images : []
  console.log("polishing", itemId, images.length, "images")
  const polished = await polishItemImages(
    images.map((img, i) => ({
      storagePath: String(img.storagePath || ""),
      imageType: String(img.imageType || "product"),
      sortOrder: typeof img.sortOrder === "number" ? img.sortOrder : i,
      bgRemoved: false,
    })),
  )
  await ref.update({
    images: polished.images,
    imageProcessingStatus: "ready",
    publicVisibility: true,
    updatedAt: FieldValue.serverTimestamp(),
  })
  console.log(
    JSON.stringify(
      {
        allReady: polished.allReady,
        images: polished.images.map((img) => ({
          bgRemoved: img.bgRemoved,
          url: String(img.storagePath || "").slice(0, 90),
        })),
      },
      null,
      2,
    ),
  )
}

;(async () => {
  if (!itemId || itemId.endsWith(".js")) {
    console.error("Usage: node scripts/polish-item.js <itemId> [--local]")
    process.exit(1)
  }
  if (local) await viaLocal()
  else await viaApi()
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
