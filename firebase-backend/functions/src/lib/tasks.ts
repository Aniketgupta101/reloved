import { CloudTasksClient } from "@google-cloud/tasks"
import type { ItemImageForPolish } from "./photoAnalyze"
import { logTiming } from "./perfMetrics"

let tasksClient: CloudTasksClient | null = null

function getTasksClient(): CloudTasksClient {
  if (!tasksClient) {
    tasksClient = new CloudTasksClient()
  }
  return tasksClient
}

/**
 * Resilient fallback worker when Cloud Tasks queue is not yet provisioned,
 * running in local emulator, or offline. Ensures drops are never dropped.
 */
function dispatchBackgroundWorker(itemId: string, images: ItemImageForPolish[]): void {
  setImmediate(async () => {
    try {
      const { polishItemImages } = await import("./photoAnalyze")
      const { getDb, collections } = await import("./firestore")
      const { FieldValue } = await import("firebase-admin/firestore")
      const { invalidateWallCache } = await import("../routes/items")
      const db = getDb()
      const itemRef = db.collection(collections.items).doc(itemId)
      const snap = await itemRef.get()
      if (!snap.exists) return
      const data = snap.data() || {}
      if (
        data.imageProcessingStatus === "ready" &&
        data.publicVisibility === true &&
        Array.isArray(data.images) &&
        data.images.some((i: any) => i?.imageType === "modelled") &&
        data.images.every(
          (i: any) =>
            i?.imageType === "modelled" ||
            (i?.imageType === "original" && i?.bgRemoved === true),
        ) &&
        data.images[0]?.imageType === "modelled"
      ) {
        return // Idempotent exit — AI first + clean originals
      }

      // Prefer live doc images + donor paths so we never polish a stale payload.
      const liveImages: ItemImageForPolish[] = Array.isArray(data.images)
        ? data.images
            .filter((img: any) => img?.storagePath)
            .map((img: any, i: number) => ({
              storagePath: String(img.storagePath),
              imageType: String(img.imageType || (img.bgRemoved ? "modelled" : "original")),
              sortOrder: typeof img.sortOrder === "number" ? img.sortOrder : i,
              bgRemoved: Boolean(img.bgRemoved),
            }))
        : images

      const donors: string[] = Array.isArray(data.donorOriginalPaths)
        ? data.donorOriginalPaths.map((p: unknown) => String(p || "").trim()).filter(Boolean)
        : []
      const keptAi = liveImages.filter((img) => img.imageType === "modelled").slice(0, 1)
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
          : liveImages

      const polished = await polishItemImages(rebuildInput, { force: true })
      if (!polished.images.some((img) => img.imageType === "modelled")) {
        console.error("Background polish produced no modelled image — leaving processing", itemId)
        await itemRef.update({
          imageProcessingStatus: "processing",
          updatedAt: FieldValue.serverTimestamp(),
        })
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
      logTiming("task_execute", 0, { id: itemId, status: "ok" })
    } catch (workerErr: any) {
      console.error("Resilient background polish worker failed:", itemId, workerErr)
      // Do NOT mark ready with unpolished gallery — leave processing so a retry can fix it.
      try {
        const { getDb, collections } = await import("./firestore")
        const { FieldValue } = await import("firebase-admin/firestore")
        await getDb().collection(collections.items).doc(itemId).update({
          imageProcessingStatus: "processing",
          updatedAt: FieldValue.serverTimestamp(),
        })
      } catch {
        // Best effort
      }
    }
  })
}

/**
 * Enqueue a background studio-polish job for an item's images.
 * Moves expensive AI image-edit work completely out of the HTTP donation response cycle.
 */
export async function enqueuePolishTask(
  itemId: string,
  images: ItemImageForPolish[],
): Promise<void> {
  const startMs = Date.now()
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "reloved-digital"
  const location = process.env.TASKS_LOCATION || process.env.VERTEX_LOCATION || "asia-south1"
  const queue = process.env.POLISH_TASK_QUEUE || "polish-item-queue"
  const secret =
    process.env.RELOVED_POLISH_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.JWT_SECRET ||
    ""

  // If explicitly disabled or running in local dev without cloud tasks
  if (process.env.DISABLE_CLOUD_TASKS === "1" || !process.env.POLISH_TASK_QUEUE) {
    logTiming("task_enqueue", 0, { id: itemId, status: "ok" })
    dispatchBackgroundWorker(itemId, images)
    return
  }

  const host =
    process.env.FUNCTIONS_HOST ||
    (process.env.K_SERVICE
      ? `https://${location}-${project}.cloudfunctions.net/api`
      : `https://${project}.web.app/api`)

  const url = `${host.replace(/\/+$/, "")}/tasks/polish-item-images`

  try {
    const client = getTasksClient()
    const parent = client.queuePath(project, location, queue)
    const payload = JSON.stringify({ itemId, images })

    const task = {
      httpRequest: {
        httpMethod: "POST" as const,
        url,
        headers: {
          "Content-Type": "application/json",
          "x-reloved-task-secret": secret,
        },
        body: Buffer.from(payload).toString("base64"),
      },
    }

    await client.createTask({ parent, task })
    logTiming("task_enqueue", Date.now() - startMs, { id: itemId, status: "ok" })
  } catch (err: any) {
    logTiming("task_enqueue", Date.now() - startMs, {
      id: itemId,
      status: "failed",
      error: String(err?.message || err).slice(0, 100),
    })

    console.warn(
      `Cloud Tasks enqueue fallback (${err?.message || err}). Running resilient background worker for ${itemId}.`,
    )
    dispatchBackgroundWorker(itemId, images)
  }
}
