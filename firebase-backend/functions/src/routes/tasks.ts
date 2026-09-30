import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { getDb, collections } from "../lib/firestore"
import { polishItemImages, type ItemImageForPolish } from "../lib/photoAnalyze"
import { invalidateWallCache } from "./items"
import { logTiming } from "../lib/perfMetrics"

export const tasksRouter = Router()

/**
 * Background worker endpoint for studio polish.
 * Called by Google Cloud Tasks (or internal background runner).
 * Protected by shared task secret or internal service authorization.
 */
tasksRouter.post("/polish-item-images", async (req, res) => {
  const startMs = Date.now()
  try {
    const secret = req.headers["x-reloved-task-secret"]
    const expected = (
      process.env.RELOVED_POLISH_SECRET ||
      process.env.ADMIN_SESSION_SECRET ||
      process.env.JWT_SECRET ||
      ""
    ).trim()

    // Must match configured secret (never allow access with empty configured secret)
    if (!expected || secret !== expected) {
      console.warn("Unauthorized tasks/polish-item-images access attempt")
      res.status(403).json({ error: "Unauthorized" })
      return
    }

    const { itemId, images } = req.body as {
      itemId?: string
      images?: ItemImageForPolish[]
    }

    if (!itemId || !Array.isArray(images) || images.length === 0) {
      res.status(400).json({ error: "Missing itemId or images array" })
      return
    }

    const db = getDb()
    const itemRef = db.collection(collections.items).doc(itemId)
    const snap = await itemRef.get()

    if (!snap.exists) {
      res.status(404).json({ error: "Item document not found" })
      return
    }

    const data = snap.data() || {}

    // Already correct: AI first + every original BG-removed on white plate.
    const imgs = Array.isArray(data.images) ? data.images : []
    const alreadyDone =
      data.imageProcessingStatus === "ready" &&
      data.publicVisibility === true &&
      imgs.length > 0 &&
      imgs[0]?.imageType === "modelled" &&
      imgs.some((img: any) => img?.imageType === "modelled") &&
      imgs.every(
        (img: any) =>
          img?.imageType === "modelled" ||
          (img?.imageType === "original" && img?.bgRemoved === true),
      )

    if (alreadyDone) {
      logTiming("task_execute", Date.now() - startMs, { id: itemId, status: "cached" })
      res.status(200).json({ ok: true, alreadyReady: true })
      return
    }

    // Durable distributed lock:
    // If another worker started polishing this item within the last 60 seconds, exit safely
    const now = Date.now()
    const polishStartedAt = data.polishStartedAt?.toMillis
      ? data.polishStartedAt.toMillis()
      : typeof data.polishStartedAt === "number"
        ? data.polishStartedAt
        : 0
    if (polishStartedAt && now - polishStartedAt < 60_000 && data.imageProcessingStatus === "in_polish") {
      logTiming("task_execute", Date.now() - startMs, { id: itemId, status: "cached" })
      res.status(200).json({ ok: true, inProgress: true })
      return
    }

    // Claim the lock
    await itemRef.update({
      imageProcessingStatus: "in_polish",
      polishStartedAt: FieldValue.serverTimestamp(),
    })

    // Rebuild from authoritative donor originals so dirty floors get re-cut,
    // then force polish (AI first + white square plate).
    const liveImages: ItemImageForPolish[] = imgs
      .filter((img: any) => img?.storagePath)
      .map((img: any, i: number) => ({
        storagePath: String(img.storagePath),
        imageType: String(img.imageType || (img.bgRemoved ? "modelled" : "original")),
        sortOrder: typeof img.sortOrder === "number" ? img.sortOrder : i,
        bgRemoved: Boolean(img.bgRemoved),
      }))
    const inputImages = liveImages.length > 0 ? liveImages : images
    const donors: string[] = Array.isArray(data.donorOriginalPaths)
      ? data.donorOriginalPaths.map((p: unknown) => String(p || "").trim()).filter(Boolean)
      : []
    const keptAi = inputImages.filter((img) => img.imageType === "modelled").slice(0, 1)
    const rebuildInput: ItemImageForPolish[] =
      donors.length > 0
        ? [
            ...keptAi.map((img) => ({ ...img, imageType: "modelled" as const, bgRemoved: true })),
            ...donors.map((p, i) => ({
              storagePath: p,
              imageType: "original" as const,
              sortOrder: keptAi.length + i,
              bgRemoved: false,
            })),
          ]
        : inputImages

    const polished = await polishItemImages(rebuildInput, { force: true })
    if (!polished.images.some((img) => img.imageType === "modelled")) {
      await itemRef.update({
        imageProcessingStatus: "processing",
        updatedAt: FieldValue.serverTimestamp(),
      })
      res.status(500).json({ error: "Polish produced no modelled image — retryable" })
      return
    }

    await itemRef.update({
      images: polished.images,
      imageProcessingStatus: "ready",
      publicVisibility: true,
      missingOriginalImage: polished.missingOriginal,
      updatedAt: FieldValue.serverTimestamp(),
    })

    invalidateWallCache()

    logTiming("task_execute", Date.now() - startMs, {
      id: itemId,
      count: polished.images.length,
      status: "ok",
    })

    res.status(200).json({
      ok: true,
      itemId,
      allReady: polished.allReady,
      cutouts: polished.images.filter((img) => img.bgRemoved === true).length,
    })
  } catch (err: any) {
    const errMsg = String(err?.message || err)
    console.error("Task polish-item-images execution failed:", errMsg)
    logTiming("task_execute", Date.now() - startMs, { status: "failed", error: errMsg.slice(0, 100) })

    // Return 500 so Cloud Tasks knows to retry with exponential backoff
    res.status(500).json({ error: "Polish execution failed, retryable by Cloud Tasks" })
  }
})
