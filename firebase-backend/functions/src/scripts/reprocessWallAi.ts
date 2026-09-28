/**
 * Reprocess Wall of Kindness item images with ghost-mannequin studio polish.
 *
 * Usage (from functions/):
 *   # Local (needs ADC + GEMINI / Vertex):
 *   node lib/scripts/reprocessWallAi.js --force [--limit=50] [--match=canali] [--dry-run]
 *
 *   # Via live API (uses deployed Functions + admin login — preferred after deploy):
 *   node lib/scripts/reprocessWallAi.js --via-api --force [--limit=50] [--match=canali] [--dry-run]
 *
 * Marks items with aiProcessedAt so re-runs skip them unless --force.
 * --match= filters titles/slugs (comma-separated substrings, case-insensitive).
 */
import fs from "node:fs"
import path from "node:path"
import { FieldValue } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { collections, getDb } from "../lib/firestore"
import { ensureFirebaseApp, getStorageBucketName } from "../lib/firebaseApp"
import { analyzePhotosViaLightsail } from "../lib/photoAnalyze"
import type { UploadedFile } from "../lib/multipart"

function loadEnvFile(filePath: string) {
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

loadEnvFile(path.join(__dirname, "../../.env.reloved-digital"))
loadEnvFile(path.join(__dirname, "../../.env"))

function argFlag(name: string): boolean {
  return process.argv.includes(name)
}

function argValue(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`))
  if (!hit) return fallback
  const n = Number(hit.split("=")[1])
  return Number.isFinite(n) ? n : fallback
}

function argString(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`))
  if (!hit) return fallback
  return hit.slice(name.length + 1) || fallback
}

function matchNeedles(): string[] {
  return argString("--match", "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function titleMatches(title: string, slug: string, needles: string[]): boolean {
  if (!needles.length) return true
  const hay = `${title} ${slug}`.toLowerCase()
  return needles.some((n) => hay.includes(n))
}

async function downloadImage(
  storagePathOrUrl: string,
): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
  const raw = String(storagePathOrUrl || "").trim()
  if (!raw) return null

  if (/^https?:\/\//i.test(raw)) {
    const res = await fetch(raw)
    if (!res.ok) throw new Error(`download ${res.status} ${raw.slice(0, 80)}`)
    const mimeType = res.headers.get("content-type") || "image/jpeg"
    const buffer = Buffer.from(await res.arrayBuffer())
    const filename = raw.split("/").pop()?.split("?")[0] || "photo.jpg"
    return { buffer, mimeType, filename }
  }

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

async function runViaApi(opts: { dryRun: boolean; force: boolean; limit: number; needles: string[] }) {
  const apiBase = (
    argString("--api", "") ||
    process.env.PUBLIC_API_URL ||
    "https://api-wsyflslyaq-el.a.run.app"
  )
    .trim()
    .replace(/\/$/, "")

  const email = (process.env.ADMIN_EMAIL || "").trim()
  const password = (process.env.ADMIN_PASSWORD || "").trim()
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD required in .env.reloved-digital for --via-api")
  }

  console.log(`Logging in as admin against ${apiBase} …`)
  const loginRes = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const loginBody = (await loginRes.json().catch(() => ({}))) as {
    token?: string
    error?: unknown
  }
  if (!loginRes.ok || !loginBody.token) {
    throw new Error(`Admin login failed (${loginRes.status}): ${JSON.stringify(loginBody).slice(0, 240)}`)
  }
  const token = loginBody.token

  const itemsRes = await fetch(`${apiBase}/api/items?status=wall&limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const itemsBody = (await itemsRes.json().catch(() => ({}))) as {
    items?: Array<{
      id: string
      title?: string
      slug?: string
      images?: Array<{ bgRemoved?: boolean; storagePath?: string }>
    }>
    error?: unknown
  }
  if (!itemsRes.ok) {
    throw new Error(`List wall failed (${itemsRes.status}): ${JSON.stringify(itemsBody).slice(0, 240)}`)
  }

  const all = itemsBody.items || []
  const candidates = all.filter((it) => {
    if (!titleMatches(String(it.title || ""), String(it.slug || ""), opts.needles)) return false
    const images = Array.isArray(it.images) ? it.images : []
    if (!images.some((img) => Boolean(img?.storagePath))) return false
    if (opts.force) {
      // Explicit --match + --force: re-polish even if previously marked bgRemoved
      // (e.g. mannequin stand left behind on a "successful" cutout).
      if (opts.needles.length || argFlag("--all")) return true
      return images.some((img) => img && img.bgRemoved !== true)
    }
    return images.some((img) => img && img.bgRemoved !== true)
  })
  const slice = candidates.slice(0, opts.limit)

  console.log(
    JSON.stringify(
      {
        mode: "via-api",
        apiBase,
        wallListed: all.length,
        match: opts.needles,
        needProcess: candidates.length,
        willProcess: slice.length,
        dryRun: opts.dryRun,
        force: opts.force,
      },
      null,
      2,
    ),
  )

  let ok = 0
  let fail = 0
  let skip = 0

  for (const item of slice) {
    const title = String(item.title || item.id)
    console.log(`\n→ ${item.id} · ${title.slice(0, 50)}`)
    if (opts.dryRun) {
      skip++
      continue
    }
    try {
      const polishRes = await fetch(`${apiBase}/api/donations/polish-item-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ itemId: item.id, force: true }),
      })
      const polishBody = (await polishRes.json().catch(() => ({}))) as Record<string, unknown>
      if (!polishRes.ok) {
        fail++
        console.error(`  FAIL ${polishRes.status}`, JSON.stringify(polishBody).slice(0, 200))
        continue
      }
      ok++
      console.log(
        `  ok cutouts=${polishBody.cutouts}/${polishBody.imageCount} allReady=${polishBody.allReady}`,
      )
    } catch (err: any) {
      fail++
      console.error("  ERROR", err?.message || err)
    }
  }

  console.log("\nDone:", { ok, fail, dryRunSkipped: skip })
}

async function runLocal(opts: { dryRun: boolean; force: boolean; limit: number; needles: string[] }) {
  process.env.RELOVED_PHOTO_BG_REMOVE = "1"

  ensureFirebaseApp()
  const db = getDb()

  const snap = await db.collection(collections.items).where("publicVisibility", "==", true).get()
  const candidates = snap.docs.filter((d) => {
    const data = d.data()
    if (!titleMatches(String(data.title || ""), String(data.slug || ""), opts.needles)) return false
    const images = Array.isArray(data.images) ? data.images : []
    if (!images.some((img: { storagePath?: string }) => Boolean(img?.storagePath))) return false
    if (opts.force) {
      if (opts.needles.length || argFlag("--all")) return true
      return images.some((img: { bgRemoved?: boolean }) => img && img.bgRemoved !== true)
    }
    if (data.aiProcessedAt && images.every((img: { bgRemoved?: boolean }) => img?.bgRemoved === true)) {
      return false
    }
    return images.some((img: { bgRemoved?: boolean }) => img && img.bgRemoved !== true)
  })

  const slice = candidates.slice(0, opts.limit)
  console.log(
    JSON.stringify(
      {
        mode: "local",
        wallVisible: snap.size,
        match: opts.needles,
        needProcess: candidates.length,
        willProcess: slice.length,
        dryRun: opts.dryRun,
        force: opts.force,
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

    if (opts.dryRun) {
      skip++
      continue
    }

    try {
      const files: UploadedFile[] = []
      const indexMap: number[] = []
      for (let i = 0; i < images.length; i++) {
        const imgPath = String(images[i]?.storagePath || "")
        if (!imgPath) continue
        try {
          const dl = await downloadImage(imgPath)
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

      // cutout-only: ghost-mannequin polish without rewriting catalogue titles.
      const analyzed = await analyzePhotosViaLightsail(files, "cutout")
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
          bgRemoved: Boolean(r.bgRemoved),
        }
        changed = true
        console.log(
          `  img[${idx}] → ${r.bgRemoved ? "ghost-mannequin" : "kept"} ${String(r.storagePath).slice(0, 70)}`,
        )
      })

      if (!changed) {
        fail++
        continue
      }

      await doc.ref.set(
        {
          images,
          aiProcessedAt: FieldValue.serverTimestamp(),
          imageProcessingStatus: "ready",
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

async function main() {
  const dryRun = argFlag("--dry-run")
  const force = argFlag("--force")
  const viaApi = argFlag("--via-api")
  const limit = argValue("--limit", 50)
  const needles = matchNeedles()
  const opts = { dryRun, force, limit, needles }

  if (viaApi) {
    await runViaApi(opts)
    return
  }
  await runLocal(opts)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
