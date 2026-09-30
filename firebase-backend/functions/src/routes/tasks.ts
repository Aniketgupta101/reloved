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

    // Duplicate-processing prevention:
    // If the item is already marked "ready" and all images are already polished, skip expensive AI
    const alreadyDone =
      data.imageProcessingStatus === "ready" &&
      data.publicVisibility === true &&
      Array.isArray(data.images) &&
      data.images.length > 0 &&
      data.images.every((img: any) => img.bgRemoved === true)

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

    // Run studio polish with controlled concurrency and deduplication
    const polished = await polishItemImages(images)

    await itemRef.update({
      images: polished.images,
      imageProcessingStatus: "ready",
      publicVisibility: true,
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
