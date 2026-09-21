import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { z } from "zod"
import { collections, getDb } from "../lib/firestore"
import { isMultipart, parseMultipart } from "../lib/multipart"
import {
  sendClaimDecision,
  sendDeliveryDeliveredToClaimer,
  sendDeliveryDeliveredToGiver,
  sendDeliveryFailedNotice,
  sendDeliveryPickedUpToClaimer,
  sendDeliveryRiderDispatchedToGiver,
  sendDonationDecision,
  sendNewMessageDonorAlert,
  sendContactReplyToUser,
} from "../lib/notifications"
import { analyzePhotosViaLightsail } from "../lib/photoAnalyze"
import { findDonorProfileDoc } from "../lib/donorIdentity"
import { requireAdmin } from "../middleware/adminAuth"
import { getOrCreateThread, getOrCreatePeerThreadForAdmin, getOrCreateSupportThread, listMessages, postMessage, serializeThread } from "../lib/messageThreads"
import {
  callMaskingConfigured,
  callMaskingStatus,
  connectMaskedCall,
  relovedOpsDialPhone,
} from "../lib/callMasking"
import { pushUserNotification } from "../lib/userNotifications"
import { recordWallHideForDeclinedClaimer } from "../lib/wallHide"
import { acceptNextSteps, needsReceiverAddress } from "./matchFlow"

export const adminRouter = Router()
adminRouter.use(requireAdmin)

function serializeDoc(id: string, data: Record<string, unknown>) {
  const out: Record<string, unknown> = { id, ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === "object" && typeof (v as { toDate?: () => Date }).toDate === "function") {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString()
    }
  }
  return out
}

adminRouter.get("/metrics", async (_req, res) => {
  try {
    const db = getDb()
    const [subs, items, requests, partners, messages, threads] = await Promise.all([
      db.collection(collections.donationSubmissions).limit(500).get(),
      db.collection(collections.items).limit(500).get(),
      db.collection(collections.itemRequests).limit(500).get(),
      db.collection(collections.partnerApplications).limit(500).get(),
      db.collection(collections.contactMessages).limit(500).get(),
      db.collection(collections.messageThreads).limit(500).get(),
    ])

    const pendingSubmissions = subs.docs.filter((d) =>
      ["submitted", "pending_review", "pending", "under_review"].includes(String(d.data().status || ""))
    ).length
    const approvedInventory = items.docs.filter((d) => d.data().status === "approved").length
    const pendingClaims = requests.docs.filter((d) => d.data().status === "pending").length
    const pendingPartners = partners.docs.filter((d) =>
      ["pending", "submitted", "under_review"].includes(String(d.data().status || ""))
    ).length
    const openMessages = messages.docs.filter((d) =>
      ["new", "open", "unread"].includes(String(d.data().status || "new"))
    ).length
    const unreadChats = threads.docs.filter((d) => !!d.data().unreadForAdmin).length
    const unreadClaimChats = threads.docs.filter(
      (d) => !!d.data().unreadForAdmin && d.data().subjectType === "claim"
    ).length
    const unreadDonationChats = threads.docs.filter(
      (d) => !!d.data().unreadForAdmin && d.data().subjectType === "donation"
    ).length
    const unreadPeerChats = threads.docs.filter(
      (d) => !!d.data().unreadForAdmin && d.data().subjectType === "peer"
    ).length
    const peerChatCount = threads.docs.filter((d) => d.data().subjectType === "peer").length

    res.json({
      completedDonations: items.docs.filter((d) => d.data().publicStatus === "reloved").length,
      pendingSubmissions,
      approvedInventory,
      activePartners: partners.docs.filter((d) => d.data().status === "approved").length,
      activeAllocations: 0,
      pendingClaims,
      pendingPartners,
      openMessages,
      unreadChats,
      unreadClaimChats,
      unreadDonationChats,
      unreadPeerChats,
      peerChatCount,
      needsAttention:
        pendingSubmissions + pendingClaims + pendingPartners + openMessages + unreadChats,
    })
  } catch (err) {
    console.error("admin metrics", err)
    res.status(500).json({ error: "Failed to load metrics" })
  }
})

/** Borzo Business API readiness (token present + optional live ping). */
adminRouter.get("/borzo/status", async (_req, res) => {
  try {
    const { borzoConfigured, borzoApiBase, borzoOpsPhone, borzoGetClient } = await import("../lib/borzo")
    const { getBorzoSubsidySnapshot, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const configured = borzoConfigured()
    const base = borzoApiBase()
    const isProduction = !base.includes("robotapitest")
    const opsPhone = borzoOpsPhone()
    const subsidy = await getBorzoSubsidySnapshot(getDb())
    const subsidyCopy = subsidyUserCopy(subsidy)
    if (!configured) {
      res.json({
        configured: false,
        mode: "manual_open_borzo",
        apiBase: base,
        isProduction,
        opsPhone: opsPhone || null,
        subsidy,
        subsidyCopy,
        message: "No BORZO_AUTH_TOKEN configured. Set BORZO_AUTH_TOKEN in functions .env to enable 1-click booking.",
      })
      return
    }
    try {
      const client = await borzoGetClient()
      res.json({
        configured: true,
        mode: "api",
        apiBase: base,
        isProduction,
        opsPhone: opsPhone || null,
        subsidy,
        subsidyCopy,
        client,
      })
    } catch (err) {
      res.status(502).json({
        configured: true,
        mode: "api",
        apiBase: base,
        isProduction,
        opsPhone: opsPhone || null,
        subsidy,
        subsidyCopy,
        error: err instanceof Error ? err.message : "Borzo ping failed",
      })
    }
  } catch (err) {
    console.error("admin borzo status", err)
    res.status(500).json({ error: "Failed to check Borzo status" })
  }
})

adminRouter.get("/submissions", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const db = getDb()
    const snap = await db.collection(collections.donationSubmissions).limit(200).get()
    const submissions = []
    for (const doc of snap.docs) {
      const data = doc.data()
      const st = String(data.status || "")
      // Donor-removed listings — don't clutter admin Give queue.
      if (st === "withdrawn") continue
      // UI "submitted" covers pending_review / pending / submitted variants.
      if (status === "submitted") {
        if (!["submitted", "pending_review", "pending"].includes(st)) continue
      } else if (status && st !== status) {
        continue
      }
      const [itemsSnap, threadSnap] = await Promise.all([
        db.collection(collections.items).where("submissionId", "==", doc.id).limit(20).get(),
        db.collection(collections.messageThreads).doc(`donation_${doc.id}`).get(),
      ])
      submissions.push({
        ...serializeDoc(doc.id, data),
        unreadChat: !!(threadSnap.exists && threadSnap.data()?.unreadForAdmin),
        items: itemsSnap.docs.map((i) => serializeDoc(i.id, i.data())),
      })
    }
    submissions.sort((a: any, b: any) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")))
    res.json({ submissions })
  } catch (err) {
    console.error("admin submissions", err)
    res.status(500).json({ error: "Failed to load submissions" })
  }
})

adminRouter.patch("/submissions/:id", async (req, res) => {
  try {
    const { status, internalNotes } = req.body as { status?: string; internalNotes?: string }
    const db = getDb()
    const ref = db.collection(collections.donationSubmissions).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const beforeData = before.data()!
    await ref.set(
      {
        ...(status ? { status } : {}),
        ...(internalNotes !== undefined ? { internalNotes } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    const updated = await ref.get()

    // Wall of Kindness reads items with publicVisibility=true + publicStatus=available.
    // Donation create leaves visibility false until admin approves — publish here.
    if (status && ["approved", "rejected", "under_review"].includes(status)) {
      const itemsSnap = await db
        .collection(collections.items)
        .where("submissionId", "==", req.params.id)
        .limit(20)
        .get()
      const batch = db.batch()
      for (const itemDoc of itemsSnap.docs) {
        if (status === "approved") {
          batch.set(
            itemDoc.ref,
            {
              status: "approved",
              publicStatus: "available",
              publicVisibility: true,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        } else if (status === "rejected") {
          batch.set(
            itemDoc.ref,
            {
              status: "rejected",
              publicVisibility: false,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        } else {
          batch.set(
            itemDoc.ref,
            {
              status: "under_review",
              publicVisibility: false,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        }
      }
      if (!itemsSnap.empty) await batch.commit()
    }

    // Close the loop for the donor once a reviewer actually decides — only on
    // the transition into approved/rejected, not on unrelated re-saves.
    if (status && ["approved", "rejected"].includes(status) && beforeData.status !== status) {
      let donorEmail = String(beforeData.email || "")
        .trim()
        .toLowerCase()
      if (!donorEmail && beforeData.donorTarget) {
        const profileDoc = await findDonorProfileDoc(db, String(beforeData.donorTarget), beforeData.phone)
        donorEmail = String(profileDoc?.data()?.email || "")
          .trim()
          .toLowerCase()
      }
      if (donorEmail) {
        const itemsSnap = await db
          .collection(collections.items)
          .where("submissionId", "==", req.params.id)
          .limit(20)
          .get()
        const itemTitle = itemsSnap.docs[0]?.data()?.title || "your donation"
        await sendDonationDecision(donorEmail, {
          firstName: beforeData.donorFirstName || "there",
          itemTitle,
          approved: status === "approved",
        }).catch((err) => console.error("Failed to send donation decision email:", err))
      } else {
        console.warn("donation decision email skipped — no email on submission/profile", req.params.id)
      }
    }

    res.json({ submission: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch submission", err)
    res.status(500).json({ error: "Failed to update submission" })
  }
})
adminRouter.get("/items", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const snap = await getDb().collection(collections.items).limit(300).get()
    let items = snap.docs.map((d) => serializeDoc(d.id, d.data()))
    if (status) items = items.filter((i: any) => i.status === status)
    items.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ items })
  } catch (err) {
    console.error("admin items", err)
    res.status(500).json({ error: "Failed to load items" })
  }
})

adminRouter.patch("/items/:id", async (req, res) => {
  try {
    const allowed = [
      "status",
      "publicStatus",
      "publicVisibility",
      "approvedQuantity",
      "rejectionReason",
      "title",
      "description",
      "category",
      "condition",
      "size",
      "quantity",
      "images",
      "brand",
      "gender",
    ] as const
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key]
    }
    const ref = getDb().collection(collections.items).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    await ref.set(patch, { merge: true })
    const updated = await ref.get()
    res.json({ item: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch item", err)
    res.status(500).json({ error: "Failed to update item" })
  }
})

adminRouter.get("/item-requests", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const db = getDb()
    const snap = await db.collection(collections.itemRequests).limit(200).get()
    const threadIds = snap.docs.map((d) => `claim_${d.id}`)
    const unreadBySubject = new Map<string, boolean>()
    // Batch get in chunks of 10 (Firestore getAll limit courtesy)
    for (let i = 0; i < threadIds.length; i += 10) {
      const chunk = threadIds.slice(i, i + 10)
      const refs = chunk.map((id) => db.collection(collections.messageThreads).doc(id))
      const docs = await db.getAll(...refs)
      for (const t of docs) {
        if (t.exists && t.data()?.unreadForAdmin) unreadBySubject.set(t.id.replace(/^claim_/, ""), true)
      }
    }
    let requests = snap.docs.map((d) => {
      const data = d.data()
      return {
        ...serializeDoc(d.id, data),
        unreadChat: !!unreadBySubject.get(d.id),
        giverLogistics: data.giverLogistics || null,
        handoverStage: data.handoverStage || null,
        pickupLocality: data.pickupLocality || null,
        item: {
          id: data.itemId,
          slug: data.itemSlug,
          title: data.itemTitle,
          category: data.itemCategory || null,
          images: data.itemImages || [],
        },
      }
    })
    if (status) requests = requests.filter((r: any) => r.status === status)
    requests.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ requests })
  } catch (err) {
    console.error("admin item-requests", err)
    res.status(500).json({ error: "Failed to load item requests" })
  }
})

adminRouter.patch("/item-requests/:id", async (req, res) => {
  try {
    const { status } = req.body as { status: string }
    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "status must be approved or rejected" })
      return
    }
    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const data = before.data()!
    const accept = status === "approved"
    const logistics = String(data.giverLogistics || "")
    const handoverStage = accept
      ? needsReceiverAddress(logistics)
        ? "awaiting_delivery_address"
        : "awaiting_handover"
      : "pending_giver"

    await ref.set(
      {
        status,
        handoverStage,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        // Courier tracker — only meaningful for porter/Borzo; peer self-send uses handoverStage.
        ...(accept && logistics === "porter_arranged" ? { deliveryStatus: "awaiting_pickup" } : {}),
      },
      { merge: true }
    )
    await db
      .collection(collections.items)
      .doc(data.itemId)
      .set(
        {
          publicStatus: accept ? "claimed" : "available",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

    if (!accept) {
      await recordWallHideForDeclinedClaimer(db, {
        itemId: String(data.itemId || ""),
        itemSlug: data.itemSlug != null ? String(data.itemSlug) : null,
        itemTitle: String(data.itemTitle || ""),
        claimId: ref.id,
        claimerTarget: String(data.requesterTarget || ""),
        claimerPhone: data.requesterPhone != null ? String(data.requesterPhone) : null,
        claimerName: data.requesterName != null ? String(data.requesterName) : null,
        reason: "ops_decline",
      }).catch((err) => console.error("admin decline wall hide", err))
    }

    const updated = await ref.get()

    // requesterTarget is whatever identity they logged in with — resolve to
    // an email either directly or via their linked profile (see donor.ts).
    const requesterTarget = String(data.requesterTarget || "")
    let requesterEmail = requesterTarget.includes("@") ? requesterTarget : null
    if (!requesterEmail) {
      const profileDoc = await findDonorProfileDoc(db, requesterTarget)
      requesterEmail = (profileDoc?.data()?.email as string | undefined) || null
    }
    if (requesterEmail) {
      await sendClaimDecision(requesterEmail, {
        requesterName: data.requesterName,
        itemTitle: data.itemTitle,
        approved: accept,
        nextSteps: accept ? acceptNextSteps(logistics) : undefined,
        softDecline: !accept,
      }).catch((err) => console.error("Failed to send claim decision email:", err))
    }

    await pushUserNotification({
      donorTarget: requesterTarget,
      role: "claimer",
      type: accept ? "claim_accepted" : "claim_declined",
      title: accept ? "Yayyy! 🎉" : "Couldn't match this time",
      body: accept
        ? `You're matched for ${data.itemTitle}. Open the claim to share handover details.`
        : "We couldn't match you this time — distance or timing may not have worked. The item is back on the Wall if you'd like to browse nearby.",
      href: `/account/claims/${ref.id}`,
      itemTitle: String(data.itemTitle || ""),
      requestId: ref.id,
    }).catch((err) => console.error("admin claim decision in-app", err))

    res.json({ request: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch item-request", err)
    res.status(500).json({ error: "Failed to update item request" })
  }
})

async function resolveClaimerEmail(db: FirebaseFirestore.Firestore, requesterTarget: string) {
  if (requesterTarget.includes("@")) return requesterTarget
  const profileDoc = await findDonorProfileDoc(db, requesterTarget)
  return (profileDoc?.data()?.email as string | undefined) || null
}

async function resolveGiverEmailForItem(db: FirebaseFirestore.Firestore, itemId: string) {
  const itemSnap = await db.collection(collections.items).doc(itemId).get()
  const submissionId = String(itemSnap.data()?.submissionId || "")
  if (!submissionId) return { email: null, firstName: "there" }
  const subSnap = await db.collection(collections.donationSubmissions).doc(submissionId).get()
  const sub = subSnap.data()
  let email = String(sub?.email || "").trim().toLowerCase() || null
  let firstName = String(sub?.donorFirstName || "").trim() || "there"
  if (!email && sub?.donorTarget) {
    const profileDoc = await findDonorProfileDoc(db, String(sub.donorTarget))
    email = (profileDoc?.data()?.email as string | undefined) || null
    if (firstName === "there") firstName = String(profileDoc?.data()?.name || "").trim() || "there"
  }
  return { email, firstName }
}

export async function resolveAddressesForClaim(db: FirebaseFirestore.Firestore, claimData: any) {
  let pickupAddress = ""
  // Never send personal donor/claimer names or phones to Borzo (BUG-07 / BUG-20).
  const pickupName = "Reloved Ops (Pickup Gate)"
  let dropAddress = String(claimData.requesterAddress || claimData.note || "").trim()
  const dropName = "Reloved Ops (Drop Gate)"

  if (claimData.itemId) {
    const itemSnap = await db.collection(collections.items).doc(claimData.itemId).get()
    const item = itemSnap.data() || {}
    // Prefer private pickupLocality; never use publicArea-only for courier.
    const submissionId = String(item.submissionId || "")
    if (item.pickupLocality) {
      pickupAddress = String(item.pickupLocality).trim()
    }
    if (submissionId) {
      const subSnap = await db.collection(collections.donationSubmissions).doc(submissionId).get()
      if (subSnap.exists) {
        const sub = subSnap.data()!
        if (!pickupAddress) {
          pickupAddress = String(sub.pickupLocality || sub.locality || sub.deliveryAddress || "").trim()
        }
      }
    }
  }

  if (!pickupAddress) {
    pickupAddress = "Bandra Kurla Complex, Bandra East, Mumbai"
  }
  if (!dropAddress) {
    dropAddress = "Phoenix Palladium, Lower Parel, Mumbai"
  }

  // Append gate note for courier privacy (building gate only).
  const gateNote = "Collect from building main gate security. Do not call flat."
  if (!pickupAddress.toLowerCase().includes("gate")) {
    pickupAddress = `${pickupAddress} (${gateNote})`
  }
  if (!dropAddress.toLowerCase().includes("gate")) {
    dropAddress = `${dropAddress} (${gateNote})`
  }

  // Ensure addresses have city / locality context if brief so Borzo geocoder resolves reliably
  if (pickupAddress && !pickupAddress.toLowerCase().includes("mumbai") && !pickupAddress.toLowerCase().includes("maharashtra")) {
    pickupAddress = `${pickupAddress}, Mumbai`
  }
  if (dropAddress && !dropAddress.toLowerCase().includes("mumbai") && !dropAddress.toLowerCase().includes("maharashtra")) {
    dropAddress = `${dropAddress}, Mumbai`
  }

  // Empty phones → formatBorzoPhone falls back to BORZO_OPS_PHONE only.
  return {
    pickupAddress,
    pickupName,
    pickupPhone: "",
    dropAddress,
    dropName,
    dropPhone: "",
  }
}

export async function advanceDeliveryStageAndNotify(
  db: FirebaseFirestore.Firestore,
  requestId: string,
  deliveryStatus: "rider_dispatched" | "picked_up" | "delivered" | "failed",
  opts?: {
    audience?: "giver" | "claimer"
    reason?: string
    extraDocUpdates?: Record<string, any>
  }
) {
  const ref = db.collection(collections.itemRequests).doc(requestId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new Error("Item request not found")
  }
  const data = snap.data()!
  if (data.status !== "approved") {
    throw new Error("Claim must be approved before tracking delivery.")
  }

  await ref.set(
    {
      deliveryStatus,
      deliveryUpdatedAt: FieldValue.serverTimestamp(),
      ...(opts?.extraDocUpdates || {}),
    },
    { merge: true }
  )

  const requesterEmail = await resolveClaimerEmail(db, String(data.requesterTarget || ""))
  const { email: giverEmail, firstName: giverFirstName } = await resolveGiverEmailForItem(db, String(data.itemId || ""))

  if (deliveryStatus === "rider_dispatched" && giverEmail) {
    await sendDeliveryRiderDispatchedToGiver(giverEmail, {
      firstName: giverFirstName,
      itemTitle: data.itemTitle,
    }).catch((err) => console.error("Failed to send rider-dispatched (giver) email:", err))
  } else if (deliveryStatus === "picked_up" && requesterEmail) {
    await sendDeliveryPickedUpToClaimer(requesterEmail, {
      requesterName: data.requesterName,
      itemTitle: data.itemTitle,
    }).catch((err) => console.error("Failed to send picked-up email:", err))
  } else if (deliveryStatus === "delivered") {
    if (requesterEmail) {
      await sendDeliveryDeliveredToClaimer(requesterEmail, {
        requesterName: data.requesterName,
        itemTitle: data.itemTitle,
      }).catch((err) => console.error("Failed to send delivered (claimer) email:", err))
    }
    if (giverEmail) {
      await sendDeliveryDeliveredToGiver(giverEmail, {
        firstName: giverFirstName,
        itemTitle: data.itemTitle,
      }).catch((err) => console.error("Failed to send delivered (giver) email:", err))
    }
  } else if (deliveryStatus === "failed") {
    const audience = opts?.audience || "claimer"
    const email = audience === "giver" ? giverEmail : requesterEmail
    const name = audience === "giver" ? giverFirstName : data.requesterName
    if (email) {
      await sendDeliveryFailedNotice(email, {
        name,
        itemTitle: data.itemTitle,
        audience,
        reason: opts?.reason,
      }).catch((err) => console.error("Failed to send delivery-failed email:", err))
    }
  }

  return ref.get()
}

const deliveryStatusSchema = z.object({
  deliveryStatus: z.enum(["rider_dispatched", "picked_up", "delivered", "failed"]),
  audience: z.enum(["giver", "claimer"]).optional(),
  reason: z.string().max(300).optional(),
})

/**
 * Advances the Borzo/Porter delivery stage for an approved claim and emails
 * whoever's relevant.
 */
adminRouter.patch("/item-requests/:id/delivery", async (req, res) => {
  const parsed = deliveryStatusSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const db = getDb()
    const updated = await advanceDeliveryStageAndNotify(
      db,
      req.params.id,
      parsed.data.deliveryStatus,
      {
        audience: parsed.data.audience,
        reason: parsed.data.reason,
      }
    )
    res.json({ request: serializeDoc(updated.id, updated.data()!) })
  } catch (err: any) {
    console.error("admin patch item-request delivery", err)
    const status = err?.message?.includes("approved") ? 409 : err?.message?.includes("not found") ? 404 : 500
    res.status(status).json({ error: err?.message || "Failed to update delivery status" })
  }
})

/**
 * Calculates Borzo delivery price between pickup & drop buildings.
 */
adminRouter.post("/item-requests/:id/borzo/estimate", async (req, res) => {
  try {
    const { borzoConfigured, borzoCalculateOrder } = await import("../lib/borzo")
    if (!borzoConfigured()) {
      res.status(400).json({
        error: "BORZO_AUTH_TOKEN is not configured in server environment. Please set BORZO_AUTH_TOKEN in functions .env.",
      })
      return
    }

    const db = getDb()
    const snap = await db.collection(collections.itemRequests).doc(req.params.id).get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    const addrs = await resolveAddressesForClaim(db, claimData)
    if (!addrs.pickupAddress) {
      res.status(400).json({ error: "Donor pickup building/locality could not be found." })
      return
    }
    if (!addrs.dropAddress) {
      res.status(400).json({ error: "Claimer drop building/address is missing on this request." })
      return
    }

    const calculation = await borzoCalculateOrder({
      pickupAddress: addrs.pickupAddress,
      dropAddress: addrs.dropAddress,
      matter: `Reloved: ${claimData.itemTitle || "Preloved item"} (#${req.params.id.slice(0, 6)})`,
    })

    const { getBorzoSubsidySnapshot, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const subsidy = await getBorzoSubsidySnapshot(db)
    res.json({
      ok: true,
      pickupAddress: addrs.pickupAddress,
      dropAddress: addrs.dropAddress,
      paymentAmount: calculation.paymentAmount,
      deliveryFeeAmount: calculation.deliveryFeeAmount,
      currency: "INR",
      subsidy,
      subsidyCopy: subsidyUserCopy(subsidy),
      paidByPreview: subsidy.nextCoveredByReloved ? "reloved_subsidy" : "receiver",
    })
  } catch (err: any) {
    console.error("admin borzo estimate", err)
    res.status(500).json({ error: err?.message || "Failed to estimate Borzo delivery fee" })
  }
})

/**
 * Places live/test order on Borzo for this approved claim request.
 */
adminRouter.post("/item-requests/:id/borzo/book", async (req, res) => {
  try {
    const { borzoConfigured, borzoCreateOrder } = await import("../lib/borzo")
    if (!borzoConfigured()) {
      res.status(400).json({
        error: "BORZO_AUTH_TOKEN is not configured in server environment. Please set BORZO_AUTH_TOKEN in functions .env.",
      })
      return
    }

    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    if (claimData.status !== "approved") {
      res.status(400).json({ error: "Claim must be approved before booking Borzo delivery." })
      return
    }
    if (claimData.borzoOrderId && claimData.borzoStatus !== "canceled") {
      res.status(409).json({
        error: `Borzo order #${claimData.borzoOrderId} already exists for this claim. Sync or cancel it first.`,
      })
      return
    }

    const addrs = await resolveAddressesForClaim(db, claimData)
    if (!addrs.pickupAddress) {
      res.status(400).json({ error: "Donor pickup building/locality could not be found." })
      return
    }
    if (!addrs.dropAddress) {
      res.status(400).json({ error: "Claimer drop building/address is missing on this request." })
      return
    }

    const { reserveBorzoSubsidy, releaseBorzoSubsidy, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const reserved = await reserveBorzoSubsidy(db)

    let order
    try {
      order = await borzoCreateOrder({
        clientOrderId: `claim_${req.params.id}`,
        pickupAddress: addrs.pickupAddress,
        dropAddress: addrs.dropAddress,
        matter: `Reloved: ${claimData.itemTitle || "Preloved item"} (#${req.params.id.slice(0, 6)})`,
      })
    } catch (bookErr) {
      await releaseBorzoSubsidy(db, { paidBy: reserved.paidBy })
      throw bookErr
    }

    const extraDocUpdates: Record<string, any> = {
      borzoOrderId: order.orderId,
      borzoOrderName: order.orderName || null,
      borzoStatus: order.status,
      borzoDeliveryStatus: order.deliveryStatus || null,
      borzoTrackingUrl: order.trackingUrl || null,
      borzoDeliveryFee: order.paymentAmount || order.deliveryFeeAmount || null,
      borzoCourier: order.courier || null,
      borzoBookedAt: FieldValue.serverTimestamp(),
      borzoUpdatedAt: FieldValue.serverTimestamp(),
      borzoPickupAddress: addrs.pickupAddress,
      borzoDropAddress: addrs.dropAddress,
      borzoPaidBy: reserved.paidBy,
      borzoSubsidyIndex: reserved.subsidyIndex,
      borzoSubsidyReleased: false,
      porterPaidBy: reserved.paidBy === "reloved_subsidy" ? "reloved" : "receiver",
    }

    const currentDelivery = claimData.deliveryStatus || "awaiting_pickup"
    if (currentDelivery === "awaiting_pickup") {
      await advanceDeliveryStageAndNotify(db, req.params.id, "rider_dispatched", {
        extraDocUpdates,
      })
    } else {
      await ref.set(extraDocUpdates, { merge: true })
    }

    const updated = await ref.get()
    res.json({
      ok: true,
      order,
      request: serializeDoc(updated.id, updated.data()!),
      subsidy: reserved.snapshot,
      subsidyCopy: subsidyUserCopy(reserved.snapshot),
      borzoPaidBy: reserved.paidBy,
    })
  } catch (err: any) {
    console.error("admin borzo book", err)
    res.status(500).json({ error: err?.message || "Failed to book Borzo rider" })
  }
})

/**
 * Manual Borzo/Porter booking (while Business API waits): mark this ride as Reloved-paid
 * (first-500 counter) after ops books in the app with company prepaid — never COD.
 */
adminRouter.post("/item-requests/:id/courier/mark-reloved-paid", async (req, res) => {
  try {
    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    if (claimData.status !== "approved") {
      res.status(400).json({ error: "Claim must be approved first." })
      return
    }
    if (claimData.borzoPaidBy === "reloved_subsidy" && claimData.borzoSubsidyIndex) {
      res.json({
        ok: true,
        alreadyMarked: true,
        borzoPaidBy: "reloved_subsidy",
        borzoSubsidyIndex: claimData.borzoSubsidyIndex,
      })
      return
    }

    const carrier = String(req.body?.carrier || "manual").trim().toLowerCase()
    const { reserveBorzoSubsidy, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const reserved = await reserveBorzoSubsidy(db)

    await ref.set(
      {
        borzoPaidBy: reserved.paidBy,
        borzoSubsidyIndex: reserved.subsidyIndex,
        courierBookedVia: carrier === "porter" ? "porter_manual" : carrier === "borzo" ? "borzo_manual" : "manual",
        borzoStatus: claimData.borzoOrderId ? claimData.borzoStatus : "manual_booked",
        deliveryStatus: claimData.deliveryStatus || "rider_dispatched",
        deliveryUpdatedAt: FieldValue.serverTimestamp(),
        borzoUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    const updated = await ref.get()
    res.json({
      ok: true,
      request: serializeDoc(updated.id, updated.data()!),
      subsidy: reserved.snapshot,
      subsidyCopy: subsidyUserCopy(reserved.snapshot),
      borzoPaidBy: reserved.paidBy,
    })
  } catch (err: any) {
    console.error("mark-reloved-paid", err)
    res.status(500).json({ error: err?.message || "Couldn't mark Reloved-paid" })
  }
})

/**
 * Polls Borzo for latest order status, tracking URL, courier details.
 */
adminRouter.post("/item-requests/:id/borzo/sync", async (req, res) => {
  try {
    const { borzoConfigured, borzoGetOrder, mapBorzoToRelovedDeliveryStatus } = await import("../lib/borzo")
    if (!borzoConfigured()) {
      res.status(400).json({ error: "BORZO_AUTH_TOKEN is not configured on the server." })
      return
    }

    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }

    const claimData = snap.data()!
    if (!claimData.borzoOrderId) {
      res.status(400).json({ error: "No Borzo order booked on this claim yet." })
      return
    }

    const order = await borzoGetOrder(claimData.borzoOrderId)
    if (!order) {
      res.status(404).json({ error: `Order #${claimData.borzoOrderId} not found on Borzo` })
      return
    }

    const extraDocUpdates: Record<string, any> = {
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

    if (
      relovedStage &&
      relovedStage !== currentStage &&
      (stageRank[relovedStage] > (stageRank[currentStage] ?? -1) || relovedStage === "failed")
    ) {
      await advanceDeliveryStageAndNotify(db, req.params.id, relovedStage, {
        extraDocUpdates,
        reason: relovedStage === "failed" ? "Order canceled or failed on Borzo" : undefined,
      })
    } else {
      await ref.set(extraDocUpdates, { merge: true })
    }

    const updated = await ref.get()
    res.json({
      ok: true,
      order,
      request: serializeDoc(updated.id, updated.data()!),
    })
  } catch (err: any) {
    console.error("admin borzo sync", err)
    res.status(500).json({ error: err?.message || "Failed to sync Borzo order" })
  }
})

/**
 * Cancels an active or pending Borzo order.
 */
adminRouter.post("/item-requests/:id/borzo/cancel", async (req, res) => {
  try {
    const { borzoConfigured, borzoCancelOrder } = await import("../lib/borzo")
    if (!borzoConfigured()) {
      res.status(400).json({ error: "BORZO_AUTH_TOKEN is not configured on the server." })
      return
    }

    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }

    const claimData = snap.data()!
    if (!claimData.borzoOrderId) {
      res.status(400).json({ error: "No Borzo order booked on this request." })
      return
    }

    const order = await borzoCancelOrder(claimData.borzoOrderId)
    const { releaseBorzoSubsidy } = await import("../lib/borzoSubsidy")
    const releasedSnapshot = await releaseBorzoSubsidy(db, {
      paidBy: claimData.borzoPaidBy,
      alreadyReleased: Boolean(claimData.borzoSubsidyReleased),
    })
    await advanceDeliveryStageAndNotify(db, req.params.id, "failed", {
      reason: "Canceled by ops on Borzo",
      extraDocUpdates: {
        borzoStatus: "canceled",
        borzoUpdatedAt: FieldValue.serverTimestamp(),
        borzoSubsidyReleased: releasedSnapshot ? true : Boolean(claimData.borzoSubsidyReleased),
      },
    })

    const updated = await ref.get()
    res.json({
      ok: true,
      order,
      request: serializeDoc(updated.id, updated.data()!),
      subsidy: releasedSnapshot || undefined,
    })
  } catch (err: any) {
    console.error("admin borzo cancel", err)
    res.status(500).json({ error: err?.message || "Failed to cancel Borzo order" })
  }
})

adminRouter.get("/contact-messages", async (_req, res) => {
  try {
    const snap = await getDb().collection(collections.contactMessages).limit(200).get()
    const messages = snap.docs
      .map((d) => serializeDoc(d.id, d.data()))
      .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ messages })
  } catch (err) {
    console.error("admin contact-messages", err)
    res.status(500).json({ error: "Failed to load messages" })
  }
})

adminRouter.patch("/contact-messages/:id", async (req, res) => {
  try {
    const { status } = req.body as { status: string }
    const ref = getDb().collection(collections.contactMessages).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    await ref.set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    const updated = await ref.get()
    res.json({ message: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch contact", err)
    res.status(500).json({ error: "Failed to update message" })
  }
})

/** Reply to a contact-form sender by email and mark the message actioned. */
adminRouter.post("/contact-messages/:id/reply", async (req, res) => {
  try {
    const replyBody = String((req.body as { reply?: string })?.reply || "").trim()
    if (replyBody.length < 2) {
      res.status(400).json({ error: "Write a reply before sending." })
      return
    }
    const ref = getDb().collection(collections.contactMessages).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const data = before.data() || {}
    const to = String(data.email || "").trim()
    if (!to.includes("@")) {
      res.status(400).json({ error: "This submission has no email to reply to." })
      return
    }
    await sendContactReplyToUser(to, {
      name: String(data.name || "there"),
      subject: String(data.subject || "Your Reloved message"),
      originalMessage: String(data.message || ""),
      replyBody,
    })
    await ref.set(
      {
        status: "actioned",
        adminReply: replyBody,
        repliedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    const updated = await ref.get()
    res.json({ message: serializeDoc(updated.id, updated.data()!) })
  } catch (err: any) {
    console.error("admin contact reply", err)
    res.status(500).json({ error: err?.message || "Failed to send reply" })
  }
})

adminRouter.get("/partner-applications", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const snap = await getDb().collection(collections.partnerApplications).limit(200).get()
    let applications = snap.docs.map((d) => serializeDoc(d.id, d.data()))
    if (status) applications = applications.filter((a: any) => a.status === status)
    applications.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ applications })
  } catch (err) {
    console.error("admin partner-applications", err)
    res.status(500).json({ error: "Failed to load partner applications" })
  }
})

adminRouter.patch("/partner-applications/:id", async (req, res) => {
  try {
    const { status } = req.body as { status: string }
    const ref = getDb().collection(collections.partnerApplications).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    await ref.set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    const updated = await ref.get()
    res.json({ application: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch partner-application", err)
    res.status(500).json({ error: "Failed to update application" })
  }
})

/** Stubs so admin UI tabs that aren't fully ported yet don't 404. */
adminRouter.get("/partners", async (_req, res) => {
  res.json({ partners: [] })
})

adminRouter.get("/allocations", async (_req, res) => {
  res.json({ allocations: [] })
})

adminRouter.get("/partner-needs", async (_req, res) => {
  res.json({ needs: [] })
})

adminRouter.post("/partner-needs", async (_req, res) => {
  res.status(501).json({ error: "Partner needs aren't available on the Firebase backend yet." })
})

adminRouter.post("/allocations", async (_req, res) => {
  res.status(501).json({ error: "Partner allocations aren't available on the Firebase backend yet." })
})

adminRouter.patch("/allocations/:id", async (_req, res) => {
  res.status(501).json({ error: "Partner allocations aren't available on the Firebase backend yet." })
})

adminRouter.patch("/allocation-items/:id", async (_req, res) => {
  res.status(501).json({ error: "Partner allocations aren't available on the Firebase backend yet." })
})

const bulkCommitSchema = z.object({
  items: z
    .array(
      z.object({
        storagePath: z.string().min(1),
        title: z.string().min(2).max(120),
        // Launch taxonomy + legacy Clothing/Footwear for older clients
        category: z.enum([
          "Outerwear",
          "Tops",
          "Bottoms",
          "Kicks",
          "Bags",
          "Accessories",
          "Clothing",
          "Footwear",
        ]),
        gender: z.enum(["men", "women", "unisex", "kids", "girls", "boys"]).default("unisex"),
        description: z.string().min(1).max(2000),
        condition: z.string().min(1),
        brand: z.string().max(80).optional().nullable(),
        size: z.string().max(60).optional().nullable(),
        quantity: z.coerce.number().int().min(1).max(50).optional(),
        locality: z.string().min(2).max(120),
      })
    )
    .min(1)
    .max(20),
})

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
  return `${base || "item"}-${Date.now().toString(36)}`
}

adminRouter.post("/bulk-upload/analyze", async (req, res) => {
  try {
    if (!isMultipart(req)) {
      res.status(400).json({ error: "Expected multipart photo upload" })
      return
    }
    const { files } = await parseMultipart(req, { fileSize: 15 * 1024 * 1024, files: 20 })
    const photos = files.filter((f) => f.fieldname === "photos" || f.fieldname === "photo")
    const payload = await analyzePhotosViaLightsail(photos)
    res.json(payload)
  } catch (err: any) {
    console.error("bulk-upload analyze", err)
    res.status(err?.status || 500).json({ error: err?.message || "Failed to analyze photos" })
  }
})

adminRouter.post("/bulk-upload/commit", async (req, res) => {
  const parsed = bulkCommitSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  try {
    const db = getDb()
    const created = []
    for (const item of parsed.data.items) {
      const ref = await db.collection(collections.items).add({
        submissionId: null,
        slug: slugify(item.title),
        title: item.title,
        category: item.category,
        gender: item.gender || "unisex",
        description: item.description,
        condition: item.condition,
        brand: item.brand || null,
        size: item.size || null,
        quantity: item.quantity || 1,
        locality: item.locality,
        status: "approved",
        publicStatus: "available",
        publicVisibility: true,
        donorRecognition: "reloved team",
        images: [
          {
            storagePath: item.storagePath,
            imageType: "product",
            sortOrder: 0,
          },
        ],
        source: "admin-bulk-upload",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      const doc = await ref.get()
      created.push({ id: doc.id, ...doc.data() })
    }
    res.status(201).json({ items: created })
  } catch (err) {
    console.error("bulk-upload commit", err)
    res.status(500).json({ error: "Failed to save items" })
  }
})

const adminThreadOpenSchema = z.object({
  subjectType: z.enum(["donation", "claim", "peer", "support"]),
  subjectId: z.string().min(1),
})

/** Ops-side open — unlike the donor route, no approval gate: ops can start a thread early to sort out logistics.
 * Peer threads are opened read-only for giver↔claimer safety monitoring.
 * Support = Ask Reloved help popup (two-way with visitor).
 */
adminRouter.post("/threads/open", async (req, res) => {
  const parsed = adminThreadOpenSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const db = getDb()
    if (parsed.data.subjectType === "support") {
      const result = await getOrCreateSupportThread(db, parsed.data.subjectId)
      if ("error" in result) {
        res.status(403).json({ error: "Couldn't open support chat" })
        return
      }
      const messages = await listMessages(db, result.id)
      if (result.data.unreadForAdmin) {
        await db.collection(collections.messageThreads).doc(result.id).set({ unreadForAdmin: false }, { merge: true })
      }
      res.json({
        thread: serializeThread(result.id, { ...result.data, unreadForAdmin: false }),
        messages,
      })
      return
    }
    if (parsed.data.subjectType === "peer") {
      const result = await getOrCreatePeerThreadForAdmin(db, parsed.data.subjectId)
      if ("error" in result) {
        res
          .status(result.error === "NOT_FOUND" ? 404 : 400)
          .json({
            error:
              result.error === "NOT_APPROVED"
                ? "Peer chat only exists after the claim is matched (accepted)."
                : "Couldn't open peer chat",
          })
        return
      }
      const messages = await listMessages(db, result.id)
      if (result.data.unreadForAdmin) {
        await db.collection(collections.messageThreads).doc(result.id).set({ unreadForAdmin: false }, { merge: true })
      }
      res.json({ thread: serializeThread(result.id, { ...result.data, unreadForAdmin: false }), messages, readOnly: true })
      return
    }
    const result = await getOrCreateThread(db, parsed.data.subjectType, parsed.data.subjectId)
    if ("error" in result) {
      res.status(result.error === "NOT_FOUND" ? 404 : 500).json({ error: "Couldn't open chat" })
      return
    }
    const messages = await listMessages(db, result.id)
    res.json({ thread: serializeThread(result.id, result.data), messages })
  } catch (err) {
    console.error("admin threads open", err)
    res.status(500).json({ error: "Couldn't open chat" })
  }
})

/** Ask Reloved floating-help threads (visitor ↔ Reloved). */
adminRouter.get("/support-chats", async (_req, res) => {
  try {
    const db = getDb()
    const snap = await db.collection(collections.messageThreads).where("subjectType", "==", "support").limit(300).get()
    const threads = snap.docs.map((d) => {
      const data = d.data()
      return {
        ...serializeThread(d.id, data as any),
        ownerEmail: data.ownerEmail || null,
        ownerTarget: data.ownerTarget || null,
        hasMessages: !!String(data.lastMessagePreview || "").trim(),
      }
    })
    threads.sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")))
    res.setHeader("Cache-Control", "no-store, no-cache, max-age=0")
    res.json({ threads })
  } catch (err) {
    console.error("admin support-chats", err)
    res.status(500).json({ error: "Failed to load support chats" })
  }
})

async function listPeerChatsForAdmin(_req: import("express").Request, res: import("express").Response) {
  try {
    const db = getDb()
    const snap = await db.collection(collections.messageThreads).where("subjectType", "==", "peer").limit(300).get()
    const threads = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data()
        const claimId = String(data.subjectId || "")
        let claimStatus: string | null = null
        let handoverStage: string | null = null
        let claimerName = String(data.claimerName || data.ownerName || "Claimer")
        let giverName = String(data.giverName || "Giver")
        if (claimId) {
          const claimSnap = await db.collection(collections.itemRequests).doc(claimId).get()
          if (claimSnap.exists) {
            const c = claimSnap.data()!
            claimStatus = String(c.status || "")
            handoverStage = c.handoverStage != null ? String(c.handoverStage) : null
            if (c.requesterName) claimerName = String(c.requesterName)
          }
        }
        const msgSnap = await d.ref.collection("messages").limit(1).get()
        const hasMessages = !msgSnap.empty || !!String(data.lastMessagePreview || "").trim()
        return {
          ...serializeThread(d.id, data as any),
          claimStatus,
          handoverStage,
          claimerName,
          giverName,
          hasMessages,
        }
      })
    )
    threads.sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")))
    res.setHeader("Cache-Control", "no-store, no-cache, max-age=0")
    res.json({ threads })
  } catch (err) {
    console.error("admin peer-chats", err)
    res.status(500).json({ error: "Failed to load peer chats" })
  }
}

/** List all giver ↔ claimer (peer) threads for safety / abuse monitoring. */
adminRouter.get("/peer-chats", listPeerChatsForAdmin)
/** Alias for older admin clients. */
adminRouter.get("/peer-threads", listPeerChatsForAdmin)

adminRouter.get("/threads/:id", async (req, res) => {
  try {
    const db = getDb()
    const ref = db.collection(collections.messageThreads).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const messages = await listMessages(db, ref.id)
    if (snap.data()?.unreadForAdmin) {
      await ref.set({ unreadForAdmin: false }, { merge: true })
    }
    res.json({ thread: serializeThread(ref.id, snap.data() as any), messages })
  } catch (err) {
    console.error("admin thread get", err)
    res.status(500).json({ error: "Couldn't load chat" })
  }
})

const adminThreadMessageSchema = z.object({ text: z.string().min(1).max(1000) })

adminRouter.post("/threads/:id/messages", async (req, res) => {
  const parsed = adminThreadMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const db = getDb()
    const ref = db.collection(collections.messageThreads).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const thread = snap.data()!
    if (String(thread.subjectType) === "peer") {
      res.status(403).json({
        error:
          "Giver ↔ claimer chat is monitor-only. Message them from Claims (Reloved chat) if you need to intervene.",
      })
      return
    }
    await postMessage(db, ref.id, { senderRole: "admin", senderName: "Reloved", text: parsed.data.text })

    let ownerEmail = String(thread.ownerEmail || "")
    if (!ownerEmail) {
      const profileDoc = await findDonorProfileDoc(db, String(thread.ownerTarget || ""))
      ownerEmail = (profileDoc?.data()?.email as string | undefined) || ""
    }
    if (ownerEmail) {
      await sendNewMessageDonorAlert(ownerEmail, {
        firstName: thread.ownerName || "there",
        itemTitle: thread.itemTitle,
        preview: parsed.data.text.slice(0, 140),
        fromReloved: true,
      }).catch((err) => console.error("Failed to send new-message donor alert:", err))
    }

    const ownerTarget = String(thread.ownerTarget || "")
    if (ownerTarget) {
      const role = thread.subjectType === "donation" ? "giver" : "claimer"
      const href =
        thread.subjectType === "support"
          ? "/"
          : thread.subjectType === "donation"
            ? `/account/gifts/${thread.subjectId}`
            : `/account/claims/${thread.subjectId}`
      await pushUserNotification({
        donorTarget: ownerTarget,
        role,
        type: "new_message",
        title: thread.subjectType === "support" ? "Reloved replied in Ask Reloved" : "RE-LOVED replied",
        body:
          thread.subjectType === "support"
            ? `"${parsed.data.text.slice(0, 80)}"`
            : `On ${thread.itemTitle}: "${parsed.data.text.slice(0, 80)}"`,
        href,
        itemTitle: String(thread.itemTitle || ""),
      }).catch((err) => console.error("admin chat in-app notify", err))
    }

    const messages = await listMessages(db, ref.id)
    const updated = await ref.get()
    res.status(201).json({ thread: serializeThread(ref.id, updated.data() as any), messages })
  } catch (err) {
    console.error("admin thread message post", err)
    res.status(500).json({ error: "Couldn't send message" })
  }
})

/** Edesy masking readiness (no secrets returned). */
adminRouter.get("/calls/masking-status", async (_req, res) => {
  res.json(callMaskingStatus())
})

const maskCallSchema = z.object({
  subjectType: z.enum(["donation", "claim"]),
  subjectId: z.string().min(1),
  /**
   * Delivery / assist bridges.
   * - courier_to_claimer / courier_to_giver: rider rings first, then user
   * - claimer_to_giver: claimer rings first, then giver
   * - ops_to_claimer / ops_to_giver: Reloved ops rings first, then user (assist)
   */
  mode: z.enum([
    "courier_to_claimer",
    "courier_to_giver",
    "claimer_to_giver",
    "ops_to_claimer",
    "ops_to_giver",
  ]),
})

/**
 * Delivery masking via Edesy click-to-call: connect rider↔user, claimer↔giver,
 * or Reloved ops↔user. Both sides see the masked Reloved DID only.
 * Customer-care inbound still forwards to ops separately.
 */
adminRouter.post("/calls/mask", async (req, res) => {
  const parsed = maskCallSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  if (!callMaskingConfigured()) {
    res.status(503).json({
      error: "Call masking not configured yet",
      ...callMaskingStatus(),
    })
    return
  }

  try {
    const db = getDb()
    const { subjectType, subjectId, mode } = parsed.data
    const opsPhone = relovedOpsDialPhone()

    let fromPhone = ""
    let toPhone = ""
    let fromLabel = ""
    let toLabel = ""

    if (subjectType === "claim") {
      const snap = await db.collection(collections.itemRequests).doc(subjectId).get()
      if (!snap.exists) {
        res.status(404).json({ error: "Claim not found" })
        return
      }
      const data = snap.data()!
      const claimerPhone = String(data.requesterPhone || "")
      const courierPhone = String(data.borzoCourier?.phone || "")

      let giverPhone = ""
      const itemId = String(data.itemId || "")
      if (itemId) {
        const itemSnap = await db.collection(collections.items).doc(itemId).get()
        const submissionId = String(itemSnap.data()?.submissionId || "")
        if (submissionId) {
          const subSnap = await db.collection(collections.donationSubmissions).doc(submissionId).get()
          giverPhone = String(subSnap.data()?.phone || "")
        }
      }

      if (mode === "claimer_to_giver") {
        fromPhone = claimerPhone
        toPhone = giverPhone
        fromLabel = "claimer"
        toLabel = "giver"
      } else if (mode === "courier_to_claimer") {
        fromPhone = courierPhone
        toPhone = claimerPhone
        fromLabel = "rider"
        toLabel = "claimer"
      } else if (mode === "courier_to_giver") {
        fromPhone = courierPhone
        toPhone = giverPhone
        fromLabel = "rider"
        toLabel = "giver"
      } else if (mode === "ops_to_claimer") {
        fromPhone = opsPhone
        toPhone = claimerPhone
        fromLabel = "ops"
        toLabel = "claimer"
      } else if (mode === "ops_to_giver") {
        fromPhone = opsPhone
        toPhone = giverPhone
        fromLabel = "ops"
        toLabel = "giver"
      }
    } else {
      // donation / giver side
      if (mode !== "courier_to_giver" && mode !== "ops_to_giver") {
        res.status(400).json({ error: "For donations, use mode courier_to_giver or ops_to_giver" })
        return
      }
      const snap = await db.collection(collections.donationSubmissions).doc(subjectId).get()
      if (!snap.exists) {
        res.status(404).json({ error: "Donation not found" })
        return
      }
      const data = snap.data()!
      const giverPhone = String(data.phone || "")

      // Prefer courier on a linked open claim for this donation's items
      let courierPhone = ""
      const itemsSnap = await db
        .collection(collections.items)
        .where("submissionId", "==", subjectId)
        .limit(10)
        .get()
      for (const itemDoc of itemsSnap.docs) {
        const claimsSnap = await db
          .collection(collections.itemRequests)
          .where("itemId", "==", itemDoc.id)
          .where("status", "==", "approved")
          .limit(5)
          .get()
        for (const c of claimsSnap.docs) {
          const p = String(c.data().borzoCourier?.phone || "")
          if (p.replace(/\D/g, "")) {
            courierPhone = p
            break
          }
        }
        if (courierPhone) break
      }

      if (mode === "ops_to_giver") {
        fromPhone = opsPhone
        toPhone = giverPhone
        fromLabel = "ops"
        toLabel = "giver"
      } else {
        fromPhone = courierPhone
        toPhone = giverPhone
        fromLabel = "rider"
        toLabel = "giver"
      }
    }

    if (!fromPhone.replace(/\D/g, "")) {
      res.status(400).json({
        error:
          fromLabel === "rider"
            ? "No rider phone yet — book Borzo first so courier phone is on the claim"
            : fromLabel === "ops"
              ? "Reloved ops phone not configured (RELOVED_OPS_PRIMARY_PHONE / BORZO_OPS_PHONE)"
              : `No phone on file for ${fromLabel}`,
      })
      return
    }
    if (!toPhone.replace(/\D/g, "")) {
      res.status(400).json({ error: `No phone on file for ${toLabel}` })
      return
    }

    const result = await connectMaskedCall({
      fromPhone,
      toPhone,
      customField: `${subjectType}:${subjectId}:${mode}`,
      timeLimitSec: 120,
    })

    await db.collection(collections.callBridges).add({
      provider: "edesy",
      subjectType,
      subjectId,
      mode,
      fromLabel,
      toLabel,
      fromPhoneLast4: fromPhone.replace(/\D/g, "").slice(-4),
      toPhoneLast4: toPhone.replace(/\D/g, "").slice(-4),
      callSid: result.callSid,
      status: result.status,
      maskedNumber: result.maskedNumber,
      createdAt: FieldValue.serverTimestamp(),
    })

    res.status(201).json({
      ok: true,
      callSid: result.callSid,
      status: result.status,
      maskedNumber: result.maskedNumber,
      mode,
      message: `Connecting ${fromLabel} → ${toLabel} (masked). ${fromLabel} phone rings first.`,
    })
  } catch (err) {
    console.error("admin calls mask", err)
    res.status(502).json({ error: err instanceof Error ? err.message : "Masked call failed" })
  }
})
