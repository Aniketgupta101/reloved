import { Router } from "express"
import { FieldValue, Firestore } from "firebase-admin/firestore"
import { z } from "zod"
import { GIVER_SENDS_MATCH_RADIUS_KM, haversineKm, parseCoord, toPublicArea } from "../lib/geo"
import { collections, getDb } from "../lib/firestore"
import {
  sendClaimDecision,
  sendDeliveryDetailsToGiver,
  sendReloveDeliveredToClaimer,
  sendClaimCancelledToGiver,
  sendHandoverSuccessToClaimer,
  sendHandoverSuccessToGiver,
} from "../lib/notifications"
import { requireRole } from "../middleware/session"
import { findDonorProfileDoc, normalizeEmail, normalizePhoneDigits } from "../lib/donorIdentity"
import {
  collectDonorMatchKeys,
  fetchOwnedItemIds,
  fetchOwnedSubmissionDocs,
} from "../lib/donorOwnership"
import { claimerLandmarkForGiver, claimerReloveHeadline, resolveClaimerPublicIdentity } from "../lib/claimerIdentity"
import {
  notificationIdentityKeys,
  pushUserNotification,
  serializeUserNotification,
} from "../lib/userNotifications"
import { recordWallHideForDeclinedClaimer } from "../lib/wallHide"
import { isMultipart, parseMultipart } from "../lib/multipart"
import { uploadImage } from "../lib/storage"

const addressSchema = z.object({
  address: z.string().min(2).max(300),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
})

const decisionSchema = z.object({
  decision: z.enum(["accept", "decline"]),
  reason: z.string().max(200).optional(),
})

/** Claimer-facing only — never say Rejected. Keep in sync with frontend claimStatusCopy. */
const DECLINE_SOFT_COPY =
  "We couldn't match you this time — distance or timing may not have worked. The item is back on the Wall if you'd like to browse nearby."

export type HandoverStage =
  | "pending_giver"
  | "awaiting_delivery_address"
  | "awaiting_address_confirm"
  | "awaiting_schedule"
  | "schedule_proposed"
  | "schedule_agreed"
  | "awaiting_handover"
  | "handed_over"
  | "received"

/** Min calendar days ahead (2 = day after tomorrow — ops needs a buffer). */
export const SCHEDULE_MIN_LEAD_DAYS = 2

export function needsReceiverAddress(logistics: string | undefined): boolean {
  return logistics === "giver_sends" || logistics === "porter_arranged" || logistics === "personal_driver"
}

export function acceptNextSteps(logistics: string | undefined): string {
  if (logistics === "porter_arranged") {
    return "Your item has been accepted! ❤️ Confirm your delivery building. The giver will share when they’re free — then confirm you’ll be present. Reloved books the courier once you both settle."
  }
  if (logistics === "giver_sends") {
    return "Your item has been accepted! ❤️ Share a building/landmark if you haven't — exact flats stay private. The giver only sees area-level delivery details."
  }
  if (logistics === "personal_driver") {
    return "Your item has been accepted! ❤️ Share a delivery building/landmark if you haven't. The giver's personal driver will deliver — no third-party courier booking needed."
  }
  if (logistics === "receiver_collects") {
    return "Your item has been accepted! ❤️ You can pick it up — open your claim page for the giver’s pickup location."
  }
  return "Your item has been accepted! ❤️ Open your claim page for handover next steps."
}

/** Earliest slot: start of the calendar day that is MIN_LEAD_DAYS from today. */
function minScheduleSlotMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + SCHEDULE_MIN_LEAD_DAYS)
  return d.getTime()
}

function parseSlotAt(raw: string): Date | null {
  const d = new Date(String(raw || "").trim())
  if (Number.isNaN(d.getTime())) return null
  return d
}

export async function resolveClaimerEmail(db: Firestore, requesterTarget: string): Promise<string | null> {
  if (requesterTarget.includes("@")) return requesterTarget.trim().toLowerCase()
  const profileDoc = await findDonorProfileDoc(db, requesterTarget)
  return (profileDoc?.data()?.email as string | undefined) || null
}

export async function resolveGiverContact(
  db: Firestore,
  itemData: FirebaseFirestore.DocumentData
): Promise<{ email: string | null; firstName: string; donorTarget: string | null; submission: FirebaseFirestore.DocumentData | null }> {
  const submissionId = String(itemData.submissionId || "")
  let giverEmail: string | null = normalizeEmail(itemData.donorEmail) || null
  let giverFirstName = "there"
  let donorTarget: string | null = itemData.donorTarget ? String(itemData.donorTarget) : null
  let submission: FirebaseFirestore.DocumentData | null = null
  if (submissionId) {
    const subSnap = await db.collection(collections.donationSubmissions).doc(submissionId).get()
    if (subSnap.exists) {
      const sub = subSnap.data()!
      submission = sub
      donorTarget = sub.donorTarget ? String(sub.donorTarget) : donorTarget
      giverEmail = normalizeEmail(sub.email) || giverEmail
      giverFirstName = String(sub.donorFirstName || "").trim() || "there"
      if (!giverEmail && donorTarget) {
        const giverProfile = await findDonorProfileDoc(db, String(donorTarget))
        giverEmail = normalizeEmail(giverProfile?.data()?.email) || null
        if (giverFirstName === "there") {
          giverFirstName = String(giverProfile?.data()?.name || "").trim() || "there"
        }
      }
    }
  }
  return { email: giverEmail, firstName: giverFirstName, donorTarget, submission }
}

/** True when the signed-in donor is the giver of this item (any linked identity). */
export async function sessionIsGiver(
  db: Firestore,
  target: string,
  itemData: FirebaseFirestore.DocumentData
): Promise<boolean> {
  const { donorTarget, submission, email: giverEmail } = await resolveGiverContact(db, itemData)
  const targetNorm = String(target || "").trim()
  const targetEmail = normalizeEmail(targetNorm)
  const targetPhone = normalizePhoneDigits(targetNorm)

  if (donorTarget && String(donorTarget).trim() === targetNorm) return true
  if (donorTarget && targetEmail && normalizeEmail(donorTarget) === targetEmail) return true
  if (donorTarget && targetPhone && normalizePhoneDigits(donorTarget) === targetPhone) return true

  const profile = await findDonorProfileDoc(db, target)
  const profileEmail = normalizeEmail(profile?.data()?.email)
  const profilePhone = normalizePhoneDigits(profile?.data()?.phone)

  const identityEmails = new Set([targetEmail, profileEmail].filter(Boolean) as string[])
  const identityPhones = new Set([targetPhone, profilePhone].filter(Boolean) as string[])

  const subEmail = normalizeEmail(submission?.email) || giverEmail
  const subPhone =
    normalizePhoneDigits(submission?.phone) ||
    normalizePhoneDigits(itemData.donorPhone) ||
    normalizePhoneDigits(donorTarget)

  if (subEmail && identityEmails.has(subEmail)) return true
  if (subPhone && identityPhones.has(subPhone)) return true
  if (donorTarget) {
    const dtEmail = normalizeEmail(donorTarget)
    const dtPhone = normalizePhoneDigits(donorTarget)
    if (dtEmail && identityEmails.has(dtEmail)) return true
    if (dtPhone && identityPhones.has(dtPhone)) return true
  }
  return false
}

export async function assertGiverSendsRadius(opts: {
  item: FirebaseFirestore.DocumentData
  submission: FirebaseFirestore.DocumentData | null
  claimerLat: number | null
  claimerLng: number | null
}): Promise<{ ok: true } | { ok: false; status: number; error: string; code?: string }> {
  const logistics = String(opts.item.giverLogistics || opts.submission?.giverLogistics || "")
  if (logistics !== "giver_sends") return { ok: true }

  const giverLat = parseCoord(opts.item.latitude) ?? parseCoord(opts.submission?.latitude)
  const giverLng = parseCoord(opts.item.longitude) ?? parseCoord(opts.submission?.longitude)

  // Fail closed: without giver coords we cannot verify 3 km (BUG-05).
  if (giverLat == null || giverLng == null) {
    return {
      ok: false,
      status: 409,
      code: "GIVER_LOCATION_MISSING",
      error:
        "This giver sends within 3 km, but their location isn't set yet. Try Receiver collects or Use Porter / Borzo instead — or message Reloved support.",
    }
  }

  if (opts.claimerLat == null || opts.claimerLng == null) {
    return {
      ok: false,
      status: 400,
      code: "CLAIMER_LOCATION_REQUIRED",
      error:
        "This giver only sends within 3 km. Pick a building from the suggestions so we can check your distance. If your browser blocked location, type the building name manually.",
    }
  }

  const km = haversineKm(giverLat, giverLng, opts.claimerLat, opts.claimerLng)
  if (km > GIVER_SENDS_MATCH_RADIUS_KM) {
    // Explicit empty-radius fallback (BUG-06): hard exclude + clear next steps.
    return {
      ok: false,
      status: 403,
      code: "OUTSIDE_3KM",
      error: `This giver only sends within 3 km (you're about ${km.toFixed(1)} km away). Fallback options: (1) Ask Reloved to match you with a closer giver, (2) choose an item marked "Receiver collects" or "Porter / Borzo", or (3) message support — we never silently fail.`,
    }
  }
  return { ok: true }
}

function serializeIncoming(id: string, data: FirebaseFirestore.DocumentData, opts?: { forGiver?: boolean }) {
  const logistics = String(data.giverLogistics || "")
  const rawAddress = String(data.requesterAddress || "").trim()
  let requesterAddress: string | null = rawAddress || null
  if (opts?.forGiver) {
    if (!rawAddress) requesterAddress = null
    else if (logistics === "porter_arranged") {
      // Manual schedule: giver sees that drop is saved, not the full flat-level string until ops needs it.
      requesterAddress = data.dropAddressConfirmedByClaimer
        ? "Delivery building confirmed (exact flat stays private)"
        : "Waiting for claimer to confirm delivery building"
    } else if (logistics === "giver_sends") requesterAddress = toPublicArea(rawAddress)
    else requesterAddress = toPublicArea(rawAddress)
  }
  return {
    id,
    status: data.status,
    handoverStage: data.handoverStage || (data.status === "pending" ? "pending_giver" : null),
    giverLogistics: data.giverLogistics || null,
    requesterName: data.requesterName || null,
    requesterUsername: data.requesterUsername
      ? String(data.requesterUsername).replace(/^@+/, "")
      : null,
    requesterLandmark: claimerLandmarkForGiver(
      logistics,
      rawAddress,
      data.requesterLocality ? String(data.requesterLocality) : null
    ),
    requesterPhone: opts?.forGiver ? null : data.requesterPhone || null,
    requesterAddress,
    addressSaved: Boolean(rawAddress),
    pickupLocality: data.pickupLocality ? String(data.pickupLocality) : null,
    pickupAddressConfirmedByGiver: Boolean(data.pickupAddressConfirmedByGiver),
    dropAddressConfirmedByClaimer: Boolean(data.dropAddressConfirmedByClaimer),
    proposedSlotAt: data.proposedSlotAt ? String(data.proposedSlotAt) : null,
    proposedSlotBy: data.proposedSlotBy ? String(data.proposedSlotBy) : null,
    proposedSlots: Array.isArray(data.proposedSlots)
      ? data.proposedSlots.map((s: unknown) => String(s)).filter(Boolean)
      : data.proposedSlotAt
        ? [String(data.proposedSlotAt)]
        : [],
    scheduleMode: data.scheduleMode ? String(data.scheduleMode) : null,
    agreedSlotAt: data.agreedSlotAt ? String(data.agreedSlotAt) : null,
    scheduleAgreedAt: data.scheduleAgreedAt?.toDate?.()?.toISOString?.() || null,
    opsBookingStatus: data.opsBookingStatus ? String(data.opsBookingStatus) : null,
    opsNote: data.opsNote ? String(data.opsNote) : null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
    receivedPhotoUrl: data.receivedPhotoUrl ? String(data.receivedPhotoUrl) : null,
    receivedPhotoNote: data.receivedPhotoNote ? String(data.receivedPhotoNote) : null,
    receivedPhotoAt: data.receivedPhotoAt?.toDate?.()?.toISOString?.() || null,
    item: {
      id: data.itemId,
      slug: data.itemSlug,
      title: data.itemTitle,
      images: data.itemImages || [],
    },
  }
}

export function registerMatchFlowRoutes(donorRouter: Router) {
  donorRouter.get("/notifications", requireRole("donor"), async (req, res) => {
    try {
      const db = getDb()
      const target = req.session!.uid
      const identities = await notificationIdentityKeys(target)
      const chunks: FirebaseFirestore.QuerySnapshot[] = []
      for (let i = 0; i < identities.length; i += 10) {
        const slice = identities.slice(i, i + 10)
        chunks.push(
          await db.collection(collections.userNotifications).where("donorTarget", "in", slice).limit(80).get()
        )
      }
      const seen = new Set<string>()
      const notifications = chunks
        .flatMap((snap) => snap.docs)
        .filter((d) => {
          if (seen.has(d.id)) return false
          seen.add(d.id)
          return true
        })
        .map((d) => serializeUserNotification(d.id, d.data()))

      // Live pending claims for this giver (indexed via their submissions — not a full scan).
      try {
        const keys = await collectDonorMatchKeys(db, target)
        const ownedSubs = await fetchOwnedSubmissionDocs(db, keys)
        const itemMap = await fetchOwnedItemIds(
          db,
          ownedSubs.map((d) => d.id)
        )
        const itemIds = [...itemMap.keys()]
        for (let i = 0; i < itemIds.length; i += 10) {
          const chunk = itemIds.slice(i, i + 10)
          if (chunk.length === 0) continue
          const claimSnap = await db
            .collection(collections.itemRequests)
            .where("itemId", "in", chunk)
            .limit(40)
            .get()
          for (const doc of claimSnap.docs) {
            const data = doc.data()
            if (String(data.status) !== "pending") continue
            if (notifications.some((n) => n.requestId === doc.id && n.type === "item_claimed")) continue
            const submissionId = itemMap.get(String(data.itemId))
            const identity = await resolveClaimerPublicIdentity(db, data as Record<string, unknown>)
            const headline = claimerReloveHeadline({
              name: identity.name || data.requesterName,
              username: identity.username,
              landmark: identity.landmark,
              itemTitle: data.itemTitle || "your item",
            })
            notifications.push({
              id: `live-${doc.id}`,
              role: "giver",
              type: "item_claimed",
              title: headline,
              body: "Accept or decline now.",
              href: submissionId
                ? `/account/gifts/${submissionId}?claim=${encodeURIComponent(doc.id)}`
                : "/account?tab=giving",
              itemTitle: data.itemTitle || null,
              requestId: doc.id,
              read: false,
              createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
            })
          }
        }
      } catch (liveErr) {
        console.error("donor notifications live claims", liveErr)
      }

      notifications.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      const { collapseNotificationsByTransaction } = await import("../lib/collapseNotifications")
      const collapsed = collapseNotificationsByTransaction(notifications)
      const trimmed = collapsed.slice(0, 60)
      res.json({
        notifications: trimmed,
        unreadCount: trimmed.filter((n) => !n.read).length,
      })
    } catch (err) {
      console.error("donor notifications get", err)
      res.status(500).json({ error: "Couldn't load notifications" })
    }
  })

  donorRouter.patch("/notifications/read-all", requireRole("donor"), async (req, res) => {
    try {
      const db = getDb()
      const identities = await notificationIdentityKeys(req.session!.uid)
      const snaps = await Promise.all(
        identities.map((id) => db.collection(collections.userNotifications).where("donorTarget", "==", id).limit(80).get())
      )
      const batch = db.batch()
      snaps.forEach((snap) =>
        snap.docs.forEach((d) => {
          if (!d.data().read) batch.update(d.ref, { read: true, readAt: FieldValue.serverTimestamp() })
        })
      )
      await batch.commit()
      res.json({ ok: true })
    } catch (err) {
      console.error("notifications read-all", err)
      res.status(500).json({ error: "Couldn't mark notifications read" })
    }
  })

  donorRouter.patch("/notifications/:id/read", requireRole("donor"), async (req, res) => {
    try {
      const id = req.params.id
      if (id.startsWith("live-")) {
        res.json({ ok: true })
        return
      }
      const db = getDb()
      const ref = db.collection(collections.userNotifications).doc(id)
      const snap = await ref.get()
      if (!snap.exists) {
        res.status(404).json({ error: "Notification not found" })
        return
      }
      const identities = await notificationIdentityKeys(req.session!.uid)
      if (!identities.includes(String(snap.data()?.donorTarget || ""))) {
        res.status(403).json({ error: "Not your notification" })
        return
      }
      await ref.update({ read: true, readAt: FieldValue.serverTimestamp() })
      res.json({ ok: true })
    } catch (err) {
      console.error("notification read", err)
      res.status(500).json({ error: "Couldn't mark notification read" })
    }
  })

  donorRouter.get("/incoming-claims", requireRole("donor"), async (req, res) => {
    try {
      const target = req.session!.uid
      const db = getDb()
      const keys = await collectDonorMatchKeys(db, target)
      const ownedSubs = await fetchOwnedSubmissionDocs(db, keys)
      const itemMap = await fetchOwnedItemIds(
        db,
        ownedSubs.map((d) => d.id)
      )
      const itemIds = [...itemMap.keys()]
      const incoming = []
      for (let i = 0; i < itemIds.length; i += 10) {
        const chunk = itemIds.slice(i, i + 10)
        if (chunk.length === 0) continue
        const snap = await db
          .collection(collections.itemRequests)
          .where("itemId", "in", chunk)
          .limit(50)
          .get()
        for (const doc of snap.docs) {
          const data = doc.data()
          if (!["pending", "approved"].includes(String(data.status))) continue
          const base = serializeIncoming(doc.id, data, { forGiver: true })
          const identity = await resolveClaimerPublicIdentity(db, data as Record<string, unknown>)
          incoming.push({
            ...base,
            requesterName: identity.name || base.requesterName,
            requesterUsername: identity.username || base.requesterUsername,
            requesterLandmark: identity.landmark || base.requesterLandmark,
            submissionId: itemMap.get(String(data.itemId)) || null,
          })
        }
      }
      incoming.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      res.json({ claims: incoming })
    } catch (err) {
      console.error("incoming-claims", err)
      res.status(500).json({ error: "Couldn't load incoming claims" })
    }
  })

  donorRouter.post("/item-requests/:id/giver-decision", requireRole("donor"), async (req, res) => {
    const parsed = decisionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    try {
      const db = getDb()
      const target = req.session!.uid
      const ref = db.collection(collections.itemRequests).doc(req.params.id)
      const snap = await ref.get()
      if (!snap.exists) {
        res.status(404).json({ error: "Claim not found" })
        return
      }
      const claim = snap.data()!
      if (claim.status !== "pending") {
        res.status(400).json({ error: "This claim is no longer waiting for a decision." })
        return
      }
      const itemRef = db.collection(collections.items).doc(String(claim.itemId))
      const itemSnap = await itemRef.get()
      if (!itemSnap.exists) {
        res.status(404).json({ error: "Item not found" })
        return
      }
      const item = itemSnap.data()!
      if (!(await sessionIsGiver(db, target, item))) {
        res.status(403).json({ error: "Only the giver can accept or decline this claim." })
        return
      }

      const accept = parsed.data.decision === "accept"
      const logistics = String(claim.giverLogistics || item.giverLogistics || "")
      // Manual schedule flow (porter_arranged): both confirm addresses, then propose a slot.
      const handoverStage: HandoverStage = accept
        ? logistics === "porter_arranged"
          ? "awaiting_address_confirm"
          : needsReceiverAddress(logistics) && !String(claim.requesterAddress || "").trim()
            ? "awaiting_delivery_address"
            : "awaiting_handover"
        : "pending_giver"

      await ref.set(
        {
          status: accept ? "approved" : "rejected",
          handoverStage: accept ? handoverStage : "pending_giver",
          reviewedBy: "giver",
          reviewedAt: FieldValue.serverTimestamp(),
          declineReason: accept ? FieldValue.delete() : String(parsed.data.reason || "").trim() || "distance_or_timing",
          ...(accept && logistics === "porter_arranged"
            ? {
                pickupAddressConfirmedByGiver: false,
                dropAddressConfirmedByClaimer: false,
                opsBookingStatus: "pending_schedule",
              }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      await itemRef.set(
        {
          // Accept → Claimed (still on Wall). Decline → Available again.
          publicStatus: accept ? "claimed" : "available",
          publicVisibility: true,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      // Declined claimer must not see this item on the Wall again (persisted).
      if (!accept) {
        await recordWallHideForDeclinedClaimer(db, {
          itemId: itemRef.id,
          itemSlug: item.slug != null ? String(item.slug) : null,
          itemTitle: String(claim.itemTitle || item.title || ""),
          claimId: ref.id,
          claimerTarget: String(claim.requesterTarget || ""),
          claimerPhone: claim.requesterPhone != null ? String(claim.requesterPhone) : null,
          claimerName: claim.requesterName != null ? String(claim.requesterName) : null,
          reason: String(parsed.data.reason || "").trim() || "distance_or_timing",
        }).catch((err) => console.error("giver-decision wall hide", err))
      }

      const claimerEmail = await resolveClaimerEmail(db, String(claim.requesterTarget || ""))
      if (claimerEmail) {
        await sendClaimDecision(claimerEmail, {
          requesterName: String(claim.requesterName || "there"),
          itemTitle: String(claim.itemTitle || "your item"),
          approved: accept,
          nextSteps: accept ? acceptNextSteps(logistics) : DECLINE_SOFT_COPY,
          softDecline: !accept,
        }).catch((err) => console.error("giver-decision claimer email", err))
      }
      await pushUserNotification({
        donorTarget: String(claim.requesterTarget || ""),
        role: "claimer",
        type: accept ? "claim_accepted" : "claim_declined",
        title: accept ? "You’re matched!" : "Not matched this time",
        body: accept
          ? `${claim.itemTitle || "Your claim"} was accepted. Open it to confirm your building and schedule pickup.`
          : DECLINE_SOFT_COPY,
        href: `/account/claims/${ref.id}`,
        itemTitle: String(claim.itemTitle || ""),
        requestId: ref.id,
      }).catch((err) => console.error("giver-decision claimer in-app", err))
      if (accept) {
        await pushUserNotification({
          donorTarget: target,
          role: "giver",
          type: "claim_accepted",
          title: "You accepted a claim",
          body: `You’re matched on ${claim.itemTitle || "your item"}. Confirm pickup details when ready.`,
          href: item.submissionId
            ? `/account/gifts/${item.submissionId}?claim=${encodeURIComponent(ref.id)}`
            : "/account",
          itemTitle: String(claim.itemTitle || ""),
          requestId: ref.id,
        }).catch((err) => console.error("giver-decision giver in-app", err))
      }

      const updated = await ref.get()
      res.json({ claim: serializeIncoming(updated.id, updated.data()!) })
    } catch (err) {
      console.error("giver-decision", err)
      res.status(500).json({ error: "Couldn't save your decision" })
    }
  })

  donorRouter.post("/item-requests/:id/delivery-address", requireRole("donor"), async (req, res) => {
    const parsed = addressSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    try {
      const db = getDb()
      const target = req.session!.uid
      const ref = db.collection(collections.itemRequests).doc(req.params.id)
      const snap = await ref.get()
      if (!snap.exists) {
        res.status(404).json({ error: "Claim not found" })
        return
      }
      const claim = snap.data()!
      if (claim.requesterTarget !== target) {
        res.status(403).json({ error: "Only the claimer can share a delivery address." })
        return
      }
      if (claim.status !== "approved") {
        res.status(400).json({ error: "Wait until the giver accepts before sharing an address." })
        return
      }

      const logistics = String(claim.giverLogistics || "")
      if (logistics === "porter_arranged") {
        const { extractIndiaPincode } = await import("../lib/shiprocket")
        if (!extractIndiaPincode(parsed.data.address)) {
          res.status(400).json({
            error: "Add a 6-digit pincode to your building (e.g. Mumbai 400051) so Shiprocket can book.",
          })
          return
        }
      }

      await ref.set(
        {
          requesterAddress: parsed.data.address,
          requesterLatitude: parsed.data.latitude ?? null,
          requesterLongitude: parsed.data.longitude ?? null,
          handoverStage: "awaiting_handover",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      const itemSnap = await db.collection(collections.items).doc(String(claim.itemId)).get()
      if (itemSnap.exists) {
        const giver = await resolveGiverContact(db, itemSnap.data()!)
        if (giver.email) {
          await sendDeliveryDetailsToGiver(giver.email, {
            firstName: giver.firstName,
            itemTitle: String(claim.itemTitle || "your item"),
            receiverAddress: toPublicArea(parsed.data.address),
          }).catch((err) => console.error("delivery-address giver email", err))
        }
        await pushUserNotification({
          donorTarget: giver.donorTarget || giver.email,
          role: "giver",
          type: "address_shared",
          title: "Delivery details received",
          body: `The receiver shared a handover landmark for ${claim.itemTitle}.`,
          href: itemSnap.data()?.submissionId
            ? `/account/gifts/${itemSnap.data()?.submissionId}?claim=${encodeURIComponent(ref.id)}`
            : "/account",
          itemTitle: String(claim.itemTitle || ""),
          requestId: ref.id,
        }).catch((err) => console.error("delivery-address in-app", err))
      }

      const updated = await ref.get()
      res.json({ ok: true, claim: serializeIncoming(updated.id, updated.data()!) })
    } catch (err) {
      console.error("delivery-address", err)
      res.status(500).json({ error: "Couldn't save delivery address" })
    }
  })

  donorRouter.post("/item-requests/:id/handed-over", requireRole("donor"), async (req, res) => {
    try {
      const db = getDb()
      const target = req.session!.uid
      const ref = db.collection(collections.itemRequests).doc(req.params.id)
      const snap = await ref.get()
      if (!snap.exists) {
        res.status(404).json({ error: "Claim not found" })
        return
      }
      const claim = snap.data()!
      if (claim.status !== "approved") {
        res.status(400).json({ error: "This claim is not matched yet." })
        return
      }
      const stage = String(claim.handoverStage || "")
      const canHandOver = [
        "schedule_agreed",
        "awaiting_handover",
        "handed_over",
      ].includes(stage)
      if (!canHandOver) {
        res.status(400).json({
          error: "Agree a pickup time first (or wait until ops marks the order booked).",
        })
        return
      }
      const itemSnap = await db.collection(collections.items).doc(String(claim.itemId)).get()
      if (!itemSnap.exists || !(await sessionIsGiver(db, target, itemSnap.data()!))) {
        res.status(403).json({ error: "Only the giver can mark this as handed over." })
        return
      }

      await ref.set(
        {
          handoverStage: "handed_over",
          handedOverAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      const claimerEmail = await resolveClaimerEmail(db, String(claim.requesterTarget || ""))
      if (claimerEmail) {
        await sendReloveDeliveredToClaimer(claimerEmail, {
          requesterName: String(claim.requesterName || "there"),
          itemTitle: String(claim.itemTitle || "your item"),
        }).catch((err) => console.error("handed-over claimer email", err))
      }
      await pushUserNotification({
        donorTarget: String(claim.requesterTarget || ""),
        role: "claimer",
        type: "handed_over",
        title: "Your item is on the way",
        body: `The giver marked ${claim.itemTitle} as handed over. Confirm when you receive it.`,
        href: `/account/claims/${ref.id}`,
        itemTitle: String(claim.itemTitle || ""),
        requestId: ref.id,
      }).catch((err) => console.error("handed-over in-app", err))

      const updated = await ref.get()
      res.json({ ok: true, claim: serializeIncoming(updated.id, updated.data()!) })
    } catch (err) {
      console.error("handed-over", err)
      res.status(500).json({ error: "Couldn't mark handed over" })
    }
  })

  donorRouter.post("/item-requests/:id/received", requireRole("donor"), async (req, res) => {
    try {
      const db = getDb()
      const target = req.session!.uid
      const ref = db.collection(collections.itemRequests).doc(req.params.id)
      const snap = await ref.get()
      if (!snap.exists) {
        res.status(404).json({ error: "Claim not found" })
        return
      }
      const claim = snap.data()!
      if (claim.requesterTarget !== target) {
        res.status(403).json({ error: "Only the claimer can confirm received." })
        return
      }
      if (claim.handoverStage !== "handed_over") {
        res.status(400).json({ error: "Wait until the giver marks this as handed over." })
        return
      }

      await ref.set(
        {
          handoverStage: "received",
          receivedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      await db
        .collection(collections.items)
        .doc(String(claim.itemId))
        .set(
          {
            // Leave active Wall grid (status=wall excludes reloved); keep visible for Wall of Love.
            publicStatus: "reloved",
            publicVisibility: true,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )

      const updated = await ref.get()
      const itemSnapAfter = await db.collection(collections.items).doc(String(claim.itemId)).get()
      const giver = itemSnapAfter.exists ? await resolveGiverContact(db, itemSnapAfter.data()!) : null
      const giftHref = itemSnapAfter.data()?.submissionId
        ? `/account/gifts/${itemSnapAfter.data()?.submissionId}?claim=${encodeURIComponent(ref.id)}`
        : "/account"
      await pushUserNotification({
        donorTarget: giver?.donorTarget || giver?.email,
        role: "giver",
        type: "received",
        title: "Your gift was Reloved",
        body: `${claim.requesterName || "The receiver"} confirmed they received ${claim.itemTitle}.`,
        href: giftHref,
        itemTitle: String(claim.itemTitle || ""),
        requestId: ref.id,
      }).catch((err) => console.error("received in-app", err))

      // Success emails (mirrors in-app celebrate popup for claimer + thank-you for giver).
      const claimerEmail = await resolveClaimerEmail(db, String(claim.requesterTarget || ""))
      if (claimerEmail) {
        await sendHandoverSuccessToClaimer(claimerEmail, {
          requesterName: String(claim.requesterName || "there"),
          itemTitle: String(claim.itemTitle || "your item"),
          claimId: ref.id,
        }).catch((err) => console.error("handover success claimer email", err))
      }
      if (giver?.email) {
        await sendHandoverSuccessToGiver(giver.email, {
          firstName: String(giver.firstName || "there"),
          claimerName: String(claim.requesterName || "The receiver"),
          itemTitle: String(claim.itemTitle || "your item"),
          giftUrl: `${process.env.PUBLIC_APP_URL || "https://reloved.digital"}${giftHref}`,
        }).catch((err) => console.error("handover success giver email", err))
      }

      res.json({ ok: true, claim: serializeIncoming(updated.id, updated.data()!) })
    } catch (err) {
      console.error("received", err)
      res.status(500).json({ error: "Couldn't confirm received" })
    }
  })

  /**
   * Optional celebration photo after both sides complete handover
   * (giver Handed over → claimer Received). Does not affect status.
   */
  donorRouter.post("/item-requests/:id/received-photo", requireRole("donor"), async (req, res) => {
    try {
      const db = getDb()
      const target = req.session!.uid
      const ref = db.collection(collections.itemRequests).doc(req.params.id)
      const snap = await ref.get()
      if (!snap.exists) {
        res.status(404).json({ error: "Claim not found" })
        return
      }
      const claim = snap.data()!
      if (claim.requesterTarget !== target) {
        res.status(403).json({ error: "Only the claimer can share a received photo." })
        return
      }
      if (claim.handoverStage !== "received") {
        res.status(400).json({ error: "Confirm Received first — then you can share a photo." })
        return
      }

      let photoBuffer: Buffer | null = null
      let photoMime = "image/jpeg"
      let note = ""
      if (isMultipart(req)) {
        const parsedForm = await parseMultipart(req, { fileSize: 8 * 1024 * 1024, files: 1 })
        const photo = parsedForm.files.find((f) => f.fieldname === "photo") || parsedForm.files[0]
        if (photo) {
          photoBuffer = photo.buffer
          photoMime = photo.mimeType || "image/jpeg"
        }
        note = String(parsedForm.fields.note || "").trim().slice(0, 280)
      } else {
        note = String(req.body?.note || "").trim().slice(0, 280)
      }

      if (!photoBuffer) {
        res.status(400).json({ error: "Add a photo to share." })
        return
      }

      const saved = await uploadImage(photoBuffer, "received-moments", photoMime)
      await ref.set(
        {
          receivedPhotoUrl: saved.url,
          receivedPhotoPath: saved.path,
          receivedPhotoNote: note || null,
          receivedPhotoAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      const updated = await ref.get()
      res.json({ ok: true, claim: serializeIncoming(updated.id, updated.data()!) })
    } catch (err) {
      console.error("received-photo", err)
      res.status(500).json({ error: "Couldn't save photo" })
    }
  })

  /**
   * Claimer cancels their own request.
   * Allowed while pending, or matched but before handover / active courier.
   * Puts the item back on the Wall (available).
   */
  donorRouter.post("/item-requests/:id/cancel", requireRole("donor"), async (req, res) => {
    try {
      const db = getDb()
      const target = req.session!.uid
      const ref = db.collection(collections.itemRequests).doc(req.params.id)
      const snap = await ref.get()
      if (!snap.exists) {
        res.status(404).json({ error: "Claim not found" })
        return
      }
      const claim = snap.data()!
      if (String(claim.requesterTarget || "") !== target) {
        // Also allow if claimer logged in with linked identity
        const profileDoc = await findDonorProfileDoc(db, target)
        const profile = profileDoc?.data()
        const keys = new Set(
          [target, profile?.email, profile?.phone]
            .filter(Boolean)
            .map((v) => String(v).trim().toLowerCase())
        )
        const reqTarget = String(claim.requesterTarget || "").trim().toLowerCase()
        const reqPhone = String(claim.requesterPhone || "").replace(/\D/g, "")
        const profilePhone = String(profile?.phone || "").replace(/\D/g, "")
        const owns =
          keys.has(reqTarget) ||
          (reqPhone.length >= 10 && profilePhone.length >= 10 && reqPhone.slice(-10) === profilePhone.slice(-10))
        if (!owns) {
          res.status(403).json({ error: "You can only cancel your own claim." })
          return
        }
      }

      const status = String(claim.status || "")
      if (status === "cancelled" || status === "rejected") {
        res.json({ ok: true, id: ref.id, status })
        return
      }
      if (status !== "pending" && status !== "approved") {
        res.status(400).json({ error: "This claim can't be cancelled in its current state." })
        return
      }

      const stage = String(claim.handoverStage || "")
      if (stage === "handed_over" || stage === "received") {
        res.status(400).json({ error: "This item is already handed over — it can't be cancelled." })
        return
      }
      const delivery = String(claim.deliveryStatus || "")
      if (["rider_dispatched", "picked_up", "delivered"].includes(delivery)) {
        res.status(400).json({ error: "A rider is already on the way — message Reloved if you need help." })
        return
      }
      if (claim.borzoOrderId && String(claim.borzoStatus || "") !== "canceled") {
        res.status(400).json({
          error: "A courier is already booked for this claim. Message Reloved to cancel the ride first.",
        })
        return
      }

      await ref.set(
        {
          status: "cancelled",
          cancelledBy: "claimer",
          cancelledAt: FieldValue.serverTimestamp(),
          handoverStage: "pending_giver",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      const itemId = String(claim.itemId || "")
      if (itemId) {
        await db.collection(collections.items).doc(itemId).set(
          {
            publicStatus: "available",
            publicVisibility: true,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }

      const itemSnap = itemId ? await db.collection(collections.items).doc(itemId).get() : null
      const giver = itemSnap?.exists ? await resolveGiverContact(db, itemSnap.data()!) : null
      if (giver?.email) {
        await sendClaimCancelledToGiver(giver.email, {
          firstName: giver.firstName,
          itemTitle: String(claim.itemTitle || "your item"),
        }).catch((err) => console.error("claim cancel giver email", err))
      }
      await pushUserNotification({
        donorTarget: giver?.donorTarget || giver?.email,
        role: "giver",
        type: "claim_declined",
        title: "Claim cancelled",
        body: `The requester cancelled their claim on ${claim.itemTitle}. It's back on the Wall.`,
        href: itemSnap?.data()?.submissionId ? `/account/gifts/${itemSnap.data()?.submissionId}` : "/account?tab=giving",
        itemTitle: String(claim.itemTitle || ""),
        requestId: ref.id,
      }).catch((err) => console.error("claim cancel giver in-app", err))

      const updated = await ref.get()
      res.json({ ok: true, claim: serializeIncoming(updated.id, updated.data()!) })
    } catch (err) {
      console.error("claimer cancel", err)
      res.status(500).json({ error: "Couldn't cancel claim" })
    }
  })

  const confirmAddressSchema = z.object({
    address: z.string().min(2).max(300).optional(),
    pincode: z.string().max(10).optional(),
  })

  /** Giver or claimer confirms their side of the address before scheduling. */
  donorRouter.post("/item-requests/:id/confirm-address", requireRole("donor"), async (req, res) => {
    const parsed = confirmAddressSchema.safeParse(req.body || {})
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    try {
      const db = getDb()
      const target = req.session!.uid
      const ref = db.collection(collections.itemRequests).doc(req.params.id)
      const snap = await ref.get()
      if (!snap.exists) {
        res.status(404).json({ error: "Claim not found" })
        return
      }
      const claim = snap.data()!
      if (String(claim.status) !== "approved") {
        res.status(400).json({ error: "Addresses can only be confirmed after the claim is matched." })
        return
      }
      const itemSnap = await db.collection(collections.items).doc(String(claim.itemId)).get()
      if (!itemSnap.exists) {
        res.status(404).json({ error: "Item not found" })
        return
      }
      const item = itemSnap.data()!
      const isGiver = await sessionIsGiver(db, target, item)
      const isClaimer = String(claim.requesterTarget || "") === target
      if (!isGiver && !isClaimer) {
        res.status(403).json({ error: "Only the giver or claimer can confirm an address." })
        return
      }

      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
      if (isGiver) {
        let addr = String(parsed.data.address || claim.pickupLocality || item.pickupLocality || item.locality || "").trim()
        const pin = String(parsed.data.pincode || "").replace(/\D/g, "").slice(0, 6)
        if (pin.length === 6 && !/\b\d{6}\b/.test(addr)) {
          addr = `${addr}, ${pin}`
        }
        if (addr.length < 2) {
          res.status(400).json({ error: "Add your pickup building / landmark first." })
          return
        }
        if (!/\b\d{6}\b/.test(addr)) {
          res.status(400).json({ error: "Include a 6-digit pincode in your pickup address." })
          return
        }
        patch.pickupLocality = addr
        patch.pickupAddressConfirmedByGiver = true
        patch.pickupAddressConfirmedAt = FieldValue.serverTimestamp()
      } else {
        let addr = String(parsed.data.address || claim.requesterAddress || "").trim()
        const pin = String(parsed.data.pincode || "").replace(/\D/g, "").slice(0, 6)
        if (pin.length === 6 && !/\b\d{6}\b/.test(addr)) {
          addr = `${addr}, ${pin}`
        }
        if (addr.length < 2) {
          res.status(400).json({ error: "Add your delivery building / landmark first." })
          return
        }
        if (!/\b\d{6}\b/.test(addr)) {
          res.status(400).json({ error: "Include a 6-digit pincode in your delivery address." })
          return
        }
        patch.requesterAddress = addr
        patch.dropAddressConfirmedByClaimer = true
        patch.dropAddressConfirmedAt = FieldValue.serverTimestamp()
      }

      const nextGiver =
        isGiver || Boolean(claim.pickupAddressConfirmedByGiver)
      const nextClaimer =
        !isGiver || Boolean(claim.dropAddressConfirmedByClaimer)
      // After this write, recompute with patch flags.
      const giverOk = isGiver ? true : Boolean(claim.pickupAddressConfirmedByGiver)
      const claimerOk = isClaimer ? true : Boolean(claim.dropAddressConfirmedByClaimer)
      void nextGiver
      void nextClaimer
      if (giverOk && claimerOk) {
        const stage = String(claim.handoverStage || "")
        if (
          stage === "awaiting_address_confirm" ||
          stage === "awaiting_delivery_address" ||
          !stage
        ) {
          patch.handoverStage = "awaiting_schedule"
        }
      }

      await ref.set(patch, { merge: true })

      const otherTarget = isGiver ? String(claim.requesterTarget || "") : null
      let giverTarget: string | null = null
      if (isClaimer) {
        const { donorTarget } = await resolveGiverContact(db, item)
        giverTarget = donorTarget
      }
      await pushUserNotification({
        donorTarget: isGiver ? otherTarget : giverTarget,
        role: isGiver ? "claimer" : "giver",
        type: "address_confirmed",
        title: isGiver ? "Giver confirmed pickup address" : "Claimer confirmed delivery address",
        body: `${claim.itemTitle || "Your item"} — open the match to continue scheduling.`,
        href: isGiver
          ? `/account/claims/${ref.id}`
          : item.submissionId
            ? `/account/gifts/${item.submissionId}?claim=${encodeURIComponent(ref.id)}`
            : "/account?tab=giving",
        itemTitle: String(claim.itemTitle || ""),
        requestId: ref.id,
      }).catch((err) => console.error("confirm-address notify", err))

      const updated = await ref.get()
      res.json({ ok: true, claim: serializeIncoming(updated.id, updated.data()!) })
    } catch (err) {
      console.error("confirm-address", err)
      res.status(500).json({ error: "Couldn't confirm address" })
    }
  })

  const proposeScheduleSchema = z.object({
    slotAt: z.string().min(8).max(40).optional(),
    slots: z.array(z.string().min(8).max(40)).max(14).optional(),
    mode: z.enum(["weekends", "specific", "custom"]).optional(),
    note: z.string().max(300).optional(),
  })

  /** Giver only — propose delivery availability (min +2 days). Claimer responds separately. */
  donorRouter.post("/item-requests/:id/propose-schedule", requireRole("donor"), async (req, res) => {
    const parsed = proposeScheduleSchema.safeParse(req.body || {})
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    try {
      const db = getDb()
      const target = req.session!.uid
      const ref = db.collection(collections.itemRequests).doc(req.params.id)
      const snap = await ref.get()
      if (!snap.exists) {
        res.status(404).json({ error: "Claim not found" })
        return
      }
      const claim = snap.data()!
      if (String(claim.status) !== "approved") {
        res.status(400).json({ error: "Schedule only after the claim is matched." })
        return
      }
      const itemSnap = await db.collection(collections.items).doc(String(claim.itemId)).get()
      if (!itemSnap.exists) {
        res.status(404).json({ error: "Item not found" })
        return
      }
      const item = itemSnap.data()!
      const isGiver = await sessionIsGiver(db, target, item)
      if (!isGiver) {
        res.status(403).json({ error: "Only the giver can propose delivery times." })
        return
      }
      if (!claim.pickupAddressConfirmedByGiver || !claim.dropAddressConfirmedByClaimer) {
        res.status(400).json({ error: "Both addresses must be confirmed before scheduling." })
        return
      }

      const rawSlots = [
        ...(parsed.data.slots || []),
        ...(parsed.data.slotAt ? [parsed.data.slotAt] : []),
      ]
      const uniqueIso: string[] = []
      const seen = new Set<string>()
      for (const raw of rawSlots) {
        const slot = parseSlotAt(raw)
        if (!slot) {
          res.status(400).json({ error: "Enter a valid date and time." })
          return
        }
        if (slot.getTime() < minScheduleSlotMs()) {
          res.status(400).json({
            error: `Delivery must be at least ${SCHEDULE_MIN_LEAD_DAYS} days from now.`,
          })
          return
        }
        const iso = slot.toISOString()
        if (!seen.has(iso)) {
          seen.add(iso)
          uniqueIso.push(iso)
        }
      }
      uniqueIso.sort()
      if (uniqueIso.length < 1) {
        res.status(400).json({ error: "Pick at least one date and time." })
        return
      }

      const primary = uniqueIso[0]
      const mode = parsed.data.mode || (uniqueIso.length > 1 ? "custom" : "specific")
      const historyEntry = {
        at: new Date().toISOString(),
        by: "giver",
        action: "propose",
        slotAt: primary,
        slots: uniqueIso,
        mode,
        note: parsed.data.note || null,
      }
      await ref.set(
        {
          proposedSlotAt: primary,
          proposedSlots: uniqueIso,
          proposedSlotBy: "giver",
          scheduleMode: mode,
          handoverStage: "schedule_proposed",
          scheduleHistory: FieldValue.arrayUnion(historyEntry),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      const whenLabel =
        uniqueIso.length === 1
          ? new Date(primary).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
          : `${uniqueIso.length} options starting ${new Date(primary).toLocaleDateString("en-IN", { dateStyle: "medium" })}`

      await pushUserNotification({
        donorTarget: String(claim.requesterTarget || ""),
        role: "claimer",
        type: "schedule_proposed",
        title: "Giver shared availability",
        body: `The giver is available on ${whenLabel} for ${claim.itemTitle || "the item"}. Please confirm you’ll be present — or say if you’re not free.`,
        href: `/account/claims/${ref.id}`,
        itemTitle: String(claim.itemTitle || ""),
      }).catch((err) => console.error("propose-schedule notify", err))

      const updated = await ref.get()
      res.json({ ok: true, claim: serializeIncoming(updated.id, updated.data()!) })
    } catch (err) {
      console.error("propose-schedule", err)
      res.status(500).json({ error: "Couldn't propose schedule" })
    }
  })

  const respondScheduleSchema = z.object({
    decision: z.enum(["accept", "unavailable", "reschedule"]),
    slotAt: z.string().min(8).max(40).optional(),
    note: z.string().max(300).optional(),
  })

  /** Claimer accepts a proposed slot, or says they’re unavailable (giver proposes again). */
  donorRouter.post("/item-requests/:id/respond-schedule", requireRole("donor"), async (req, res) => {
    const parsed = respondScheduleSchema.safeParse(req.body || {})
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    try {
      const db = getDb()
      const target = req.session!.uid
      const ref = db.collection(collections.itemRequests).doc(req.params.id)
      const snap = await ref.get()
      if (!snap.exists) {
        res.status(404).json({ error: "Claim not found" })
        return
      }
      const claim = snap.data()!
      if (String(claim.status) !== "approved") {
        res.status(400).json({ error: "Not a matched claim." })
        return
      }
      const itemSnap = await db.collection(collections.items).doc(String(claim.itemId)).get()
      if (!itemSnap.exists) {
        res.status(404).json({ error: "Item not found" })
        return
      }
      const item = itemSnap.data()!
      const isGiver = await sessionIsGiver(db, target, item)
      const isClaimer = String(claim.requesterTarget || "") === target
      if (!isGiver && !isClaimer) {
        res.status(403).json({ error: "Only the giver or claimer can respond." })
        return
      }

      const decision = parsed.data.decision === "reschedule" ? "unavailable" : parsed.data.decision

      if (decision === "accept") {
        if (!isClaimer) {
          res.status(403).json({ error: "Only the claimer can confirm they’ll be present." })
          return
        }
        if (String(claim.handoverStage) !== "schedule_proposed") {
          res.status(400).json({ error: "No proposed time to accept." })
          return
        }
        const offered: string[] = Array.isArray(claim.proposedSlots)
          ? claim.proposedSlots.map((s: unknown) => String(s)).filter(Boolean)
          : claim.proposedSlotAt
            ? [String(claim.proposedSlotAt)]
            : []
        let slotIso = String(parsed.data.slotAt || claim.proposedSlotAt || "")
        if (parsed.data.slotAt && offered.length > 0 && !offered.includes(parsed.data.slotAt)) {
          // Allow matching by date if exact ISO differs slightly
          const pick = offered.find((s) => s === parsed.data.slotAt || s.startsWith(String(parsed.data.slotAt).slice(0, 10)))
          if (!pick) {
            res.status(400).json({ error: "Pick one of the times the giver offered." })
            return
          }
          slotIso = pick
        }
        if (!slotIso) {
          res.status(400).json({ error: "No proposed time to accept." })
          return
        }
        const historyEntry = {
          at: new Date().toISOString(),
          by: "claimer",
          action: "accept",
          slotAt: slotIso,
          note: parsed.data.note || null,
        }
        await ref.set(
          {
            handoverStage: "schedule_agreed",
            scheduleAgreedAt: FieldValue.serverTimestamp(),
            agreedSlotAt: slotIso,
            proposedSlotAt: slotIso,
            opsBookingStatus: "ready_to_book",
            scheduleHistory: FieldValue.arrayUnion(historyEntry),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        const { donorTarget } = await resolveGiverContact(db, item)
        await pushUserNotification({
          donorTarget,
          role: "giver",
          type: "schedule_agreed",
          title: "Claimer will be present",
          body: `They confirmed ${new Date(slotIso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} for ${claim.itemTitle || "your item"}. Reloved will book the courier.`,
          href: item.submissionId
            ? `/account/gifts/${item.submissionId}?claim=${encodeURIComponent(ref.id)}`
            : "/account?tab=giving",
          itemTitle: String(claim.itemTitle || ""),
          requestId: ref.id,
        }).catch((err) => console.error("respond-schedule accept notify", err))
      } else {
        // Claimer unavailable — giver must propose again. Giver can also clear and re-propose.
        if (!isClaimer && !isGiver) {
          res.status(403).json({ error: "Not allowed." })
          return
        }
        if (isClaimer && String(claim.handoverStage) !== "schedule_proposed") {
          res.status(400).json({ error: "No proposed time to respond to." })
          return
        }
        const by = isGiver ? "giver" : "claimer"
        const historyEntry = {
          at: new Date().toISOString(),
          by,
          action: "unavailable",
          slotAt: null,
          note: parsed.data.note || null,
        }
        await ref.set(
          {
            handoverStage: "awaiting_schedule",
            proposedSlotAt: FieldValue.delete(),
            proposedSlots: FieldValue.delete(),
            proposedSlotBy: FieldValue.delete(),
            scheduleMode: FieldValue.delete(),
            scheduleAgreedAt: FieldValue.delete(),
            agreedSlotAt: FieldValue.delete(),
            opsBookingStatus: "pending_schedule",
            scheduleHistory: FieldValue.arrayUnion(historyEntry),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        const { donorTarget } = await resolveGiverContact(db, item)
        if (isClaimer) {
          await pushUserNotification({
            donorTarget,
            role: "giver",
            type: "schedule_reschedule",
            title: "Claimer isn’t free then",
            body: parsed.data.note
              ? `They said: “${parsed.data.note}”. Please propose another time.`
              : "They’re not free on the time you offered. Please propose another option.",
            href: item.submissionId
              ? `/account/gifts/${item.submissionId}?claim=${encodeURIComponent(ref.id)}`
              : "/account?tab=giving",
            itemTitle: String(claim.itemTitle || ""),
          }).catch((err) => console.error("respond-schedule unavailable notify", err))
        }
      }

      const updated = await ref.get()
      res.json({ ok: true, claim: serializeIncoming(updated.id, updated.data()!) })
    } catch (err) {
      console.error("respond-schedule", err)
      res.status(500).json({ error: "Couldn't update schedule" })
    }
  })
}
