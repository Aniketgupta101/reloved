/**
 * Attach a manually booked Shadowfax AWB to a claim and fire rider/dispatched SMS+email.
 * Usage: node scripts/_tmp-attach-shadowfax-manual.js
 */
const fs = require("fs")
const path = require("path")

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const i = t.indexOf("=")
    if (i < 1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined || process.env[k] === "") process.env[k] = v
  }
}

loadEnv(path.join(__dirname, "../.env.reloved-digital"))
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "reloved-digital"
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "reloved-digital"

const CLAIM_ID = "LXyg0bBM3TW6L7axbP0v"
const AWB = "SF40777730564"
const ORDER_ID = "18860-9F03B8308E44"
const TRACKING_URL = `https://track.shadowfax.in/track?awb=${AWB}`

async function main() {
  const { getFirestore } = require("firebase-admin/firestore")
  const { FieldValue } = require("firebase-admin/firestore")
  require("../lib/lib/firebaseApp").ensureFirebaseApp()
  const { advanceDeliveryStageAndNotify } = require("../lib/routes/admin")
  const { collections } = require("../lib/lib/firestore")

  const db = getFirestore()
  const ref = db.collection(collections.itemRequests).doc(CLAIM_ID)
  const before = await ref.get()
  if (!before.exists) throw new Error(`Claim ${CLAIM_ID} not found`)
  const prev = before.data() || {}
  console.log("before", {
    title: prev.itemTitle,
    shadowfaxAwb: prev.shadowfaxAwb,
    shadowfaxStatus: prev.shadowfaxStatus,
    deliveryStatus: prev.deliveryStatus,
    claimerDispatchNotifiedAt: Boolean(prev.claimerDispatchNotifiedAt),
  })

  const extraDocUpdates = {
    shadowfaxOrderId: ORDER_ID,
    shadowfaxAwb: AWB,
    shadowfaxTrackingUrl: TRACKING_URL,
    shadowfaxStatus: "BOOKED",
    shadowfaxPaymentMethod: "Prepaid",
    courierBookedVia: "shadowfax_manual",
    shadowfaxBookedAt: FieldValue.serverTimestamp(),
    shadowfaxUpdatedAt: FieldValue.serverTimestamp(),
    shadowfaxCanceledAt: FieldValue.delete(),
    opsBookingStatus: "booked",
    opsBookedAt: FieldValue.serverTimestamp(),
    handoverStage: "awaiting_handover",
    claimerDispatchNotifiedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    opsNote: `Manual SF360 book AWB ${AWB} (address tweak). Prev canceled AWB SF40777731012.`,
  }

  // Notify both sides (giver rider-coming + claimer order-dispatched SMS/email)
  await advanceDeliveryStageAndNotify(db, CLAIM_ID, "rider_dispatched", {
    notifySides: "both",
    extraDocUpdates,
  })

  const after = await ref.get()
  const d = after.data() || {}
  console.log("after", {
    shadowfaxAwb: d.shadowfaxAwb,
    shadowfaxOrderId: d.shadowfaxOrderId,
    shadowfaxTrackingUrl: d.shadowfaxTrackingUrl,
    shadowfaxStatus: d.shadowfaxStatus,
    courierBookedVia: d.courierBookedVia,
    deliveryStatus: d.deliveryStatus,
    opsBookingStatus: d.opsBookingStatus,
    handoverStage: d.handoverStage,
  })
  console.log("OK — claim linked + notifications fired")
  console.log("Track:", TRACKING_URL)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
