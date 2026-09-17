import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { getDb, collections } from "../lib/firestore"
import {
  verifyBorzoWebhookSignature,
  parseBorzoOrderSummary,
  mapBorzoToRelovedDeliveryStatus,
} from "../lib/borzo"
import { advanceDeliveryStageAndNotify } from "./admin"

export const borzoWebhookRouter = Router()

/**
 * Borzo Webhook callback handler.
 * Configure in Borzo Business cabinet (Integration -> Webhooks):
 * URL: https://reloved-digital.web.app/api/borzo/webhook
 */
borzoWebhookRouter.post("/webhook", async (req, res) => {
  try {
    const sig = req.headers["x-dv-signature"] as string | undefined
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body)

    if (!verifyBorzoWebhookSignature(rawBody, sig)) {
      console.warn("Borzo webhook signature mismatch")
      res.status(401).json({ error: "Invalid signature" })
      return
    }

    const { event_type, order: rawOrder } = req.body || {}
    if (!rawOrder || !rawOrder.order_id) {
      res.status(200).json({ ok: true, ignored: "missing order" })
      return
    }

    const order = parseBorzoOrderSummary(rawOrder)
    const db = getDb()

    // Find claim request matching borzoOrderId
    let claimDoc: FirebaseFirestore.DocumentSnapshot | null = null
    const snap = await db
      .collection(collections.itemRequests)
      .where("borzoOrderId", "==", order.orderId)
      .limit(1)
      .get()

    if (!snap.empty) {
      claimDoc = snap.docs[0]
    } else {
      // Fallback: search by client_order_id in points
      for (const pt of order.points || []) {
        if (pt.client_order_id && typeof pt.client_order_id === "string") {
          const reqId = pt.client_order_id.replace(/^claim_/, "")
          const directSnap = await db.collection(collections.itemRequests).doc(reqId).get()
          if (directSnap.exists) {
            claimDoc = directSnap
            break
          }
        }
      }
    }

    if (!claimDoc || !claimDoc.exists) {
      console.log(`Borzo webhook: no matching item request found for order ${order.orderId}`)
      res.status(200).json({ ok: true, matched: false })
      return
    }

    const claimData = claimDoc.data()!
    const extraDocUpdates: Record<string, any> = {
      borzoOrderId: order.orderId,
      borzoOrderName: order.orderName || claimData.borzoOrderName || null,
      borzoStatus: order.status,
      borzoDeliveryStatus: order.deliveryStatus || null,
      borzoTrackingUrl: order.trackingUrl || claimData.borzoTrackingUrl || null,
      borzoDeliveryFee: order.paymentAmount || order.deliveryFeeAmount || claimData.borzoDeliveryFee || null,
      borzoCourier: order.courier || claimData.borzoCourier || null,
      borzoUpdatedAt: FieldValue.serverTimestamp(),
    }

    const relovedStage = mapBorzoToRelovedDeliveryStatus(order.status, order.deliveryStatus)
    const currentStage = claimData.deliveryStatus || "awaiting_pickup"

    const stageRank: Record<string, number> = {
      awaiting_pickup: 0,
      rider_dispatched: 1,
      picked_up: 2,
      delivered: 3,
      failed: 99,
    }

    if (relovedStage === "failed" && !claimData.borzoSubsidyReleased) {
      const { releaseBorzoSubsidy } = await import("../lib/borzoSubsidy")
      const released = await releaseBorzoSubsidy(db, {
        paidBy: claimData.borzoPaidBy,
        alreadyReleased: Boolean(claimData.borzoSubsidyReleased),
      })
      if (released) extraDocUpdates.borzoSubsidyReleased = true
    }

    if (
      relovedStage &&
      relovedStage !== currentStage &&
      (stageRank[relovedStage] > (stageRank[currentStage] ?? -1) || relovedStage === "failed")
    ) {
      await advanceDeliveryStageAndNotify(db, claimDoc.id, relovedStage, {
        extraDocUpdates,
        reason: relovedStage === "failed" ? "Order canceled on Borzo" : undefined,
      })
    } else {
      await claimDoc.ref.set(extraDocUpdates, { merge: true })
    }

    res.status(200).json({ ok: true, orderId: order.orderId, eventType: event_type })
  } catch (err) {
    console.error("Borzo webhook processing error:", err)
    // Borzo expects HTTP 2xx or will retry for 24h
    res.status(500).json({ error: "Webhook processing failed" })
  }
})
