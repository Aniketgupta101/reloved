/**
 * Reprocess Wall of Kindness item images with AI cutout (Gemini / remove.bg).
 *
 * Usage (from functions/):
 *   set GOOGLE_APPLICATION_CREDENTIALS=...
 *   set RELOVED_PHOTO_BG_REMOVE=1
 *   node lib/scripts/reprocessWallAi.js [--dry-run] [--limit=20] [--force]
 *
 * Marks items with aiProcessedAt so re-runs skip them unless --force.
 */
import { FieldValue } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { collections, getDb } from "../lib/firestore"
import { ensureFirebaseApp, getStorageBucketName } from "../lib/firebaseApp"
import { analyzePhotosViaLightsail } from "../lib/photoAnalyze"
import type { UploadedFile } from "../lib/multipart"

function argFlag(name: string): boolean {
  return process.argv.includes(name)
}

function argValue(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`))
  if (!hit) return fallback
  const n = Number(hit.split("=")[1])
  return Number.isFinite(n) ? n : fallback
}

async function downloadImage(storagePathOrUrl: string): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
  const raw = String(storagePathOrUrl || "").trim()
  if (!raw) return null

  // Full HTTPS URL
  if (/^https?:\/\//i.test(raw)) {
    const res = await fetch(raw)
    if (!res.ok) throw new Error(`download ${res.status} ${raw.slice(0, 80)}`)
    const mimeType = res.headers.get("content-type") || "image/jpeg"
    const buffer = Buffer.from(await res.arrayBuffer())
    const filename = raw.split("/").pop()?.split("?")[0] || "photo.jpg"
    return { buffer, mimeType, filename }
  }

  // gs:// or object path in bucket
  ensureFirebaseApp()
  const bucket = getStorage().bucket(getStorageBucketName())
  let objectPath = raw
  if (raw.startsWith("gs://")) {
    objectPath = raw.replace(/^gs:\/\/[^/]+\//, "")
  } else if (raw.includes("storage.googleapis.com/")) {
    const m = raw.match(/storage\.googleapis\.com\/[^/]+\/(.+?)(?:\?|$)/)
    objectPath = m ? decodeURIComponent(m[1]) : raw
  }
  const [buffer] = await bucket.file(objectPath).download()
  const [meta] = await bucket.file(objectPath).getMetadata().catch(() => [null])
  const mimeType = (meta as { contentType?: string } | null)?.contentType || "image/jpeg"
  return { buffer, mimeType, filename: objectPath.split("/").pop() || "photo.jpg" }
}

async function main() {
  const dryRun = argFlag("--dry-run")
  const force = argFlag("--force")
  const limit = argValue("--limit", 50)

  // Force AI cutout on for this job
  process.env.RELOVED_PHOTO_BG_REMOVE = "1"

  ensureFirebaseApp()
  const db = getDb()

  const snap = await db.collection(collections.items).where("publicVisibility", "==", true).get()
  const candidates = snap.docs.filter((d) => {
    const data = d.data()
    const status = String(data.publicStatus || "")
    if (!["available", "being_matched", "claimed"].includes(status) && status !== "reloved") {
      // still process available/being_matched primarily; include claimed/reloved for consistency
    }
    if (!force && data.aiProcessedAt) return false
    const images = Array.isArray(data.images) ? data.images : []
    return images.some((img: { storagePath?: string }) => Boolean(img?.storagePath))
  })

  const slice = candidates.slice(0, limit)
  console.log(
    JSON.stringify(
      {
        wallVisible: snap.size,
        needProcess: candidates.length,
        willProcess: slice.length,
        dryRun,
        force,
      },
      null,
      2,
    ),
  )

  let ok = 0
  let fail = 0
  let skip = 0

  for (const doc of slice) {
    const data = doc.data()
    const title = String(data.title || doc.id)
    const images = Array.isArray(data.images) ? [...data.images] : []
    console.log(`\n→ ${doc.id} · ${title.slice(0, 50)} · ${images.length} image(s)`)

    if (dryRun) {
      skip++
      continue
    }

    try {
      const files: UploadedFile[] = []
      const indexMap: number[] = []
      for (let i = 0; i < images.length; i++) {
        const path = String(images[i]?.storagePath || "")
        if (!path) continue
        try {
          const dl = await downloadImage(path)
          if (!dl?.buffer?.length) continue
          files.push({
            fieldname: "photos",
            filename: `wall-${doc.id}-${i}-${dl.filename}`,
            mimeType: dl.mimeType,
            buffer: dl.buffer,
          })
          indexMap.push(i)
        } catch (err: any) {
          console.warn(`  download fail img[${i}]:`, err?.message || err)
        }
      }

      if (files.length === 0) {
        console.warn("  no downloadable images — skip")
        fail++
        continue
      }

      const analyzed = await analyzePhotosViaLightsail(files)
      let changed = false
      analyzed.results.forEach((r, j) => {
        if (!r.ok || !("storagePath" in r) || !r.storagePath) {
          console.warn(`  analyze fail img[${indexMap[j]}]:`, !r.ok ? r.error : "no url")
          return
        }
        const idx = indexMap[j]
        images[idx] = {
          ...images[idx],
          storagePath: r.storagePath,
          imageType: images[idx].imageType || "primary",
          sortOrder: images[idx].sortOrder ?? idx,
        }
        changed = true
        console.log(`  img[${idx}] → ${r.bgRemoved ? "AI cutout" : "kept"} ${String(r.storagePath).slice(0, 70)}`)
      })

      if (!changed) {
        fail++
        continue
      }

      await doc.ref.set(
        {
          images,
          aiProcessedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      ok++
      console.log("  saved")
    } catch (err: any) {
      fail++
      console.error("  ERROR", err?.message || err)
    }
  }

  console.log("\nDone:", { ok, fail, dryRunSkipped: skip })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
