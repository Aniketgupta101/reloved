import { Router } from "express"
import { FieldValue, Firestore } from "firebase-admin/firestore"
import { z } from "zod"
import { GIVER_SENDS_MATCH_RADIUS_KM, haversineKm, parseCoord, toPublicArea } from "../lib/geo"
import { collections, getDb } from "../lib/firestore"
import {
  sendClaimDecision,
  sendDeliveryDetailsToGiver,
  sendReloveDeliveredToClaimer,
} from "../lib/notifications"
import { requireRole } from "../middleware/session"
import { findDonorProfileDoc, normalizeEmail, normalizePhoneDigits } from "../lib/donorIdentity"
import {
  notificationIdentityKeys,
  pushUserNotification,
  serializeUserNotification,
} from "../lib/userNotifications"
import { recordWallHideForDeclinedClaimer } from "../lib/wallHide"

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
  | "awaiting_handover"
  | "handed_over"
  | "received"

export function needsReceiverAddress(logistics: string | undefined): boolean {
  return logistics === "giver_sends" || logistics === "porter_arranged"
}

export function acceptNextSteps(logistics: string | undefined): string {
  if (logistics === "giver_sends") {
    return "Your item has been accepted! ❤️ Share a building/landmark if you haven't — exact flats stay private. The giver only sees area-level delivery details."
  }
  if (logistics === "porter_arranged") {
    return "Your item has been accepted! ❤️ You (the receiver) book prepaid Borzo. Reloved uses your saved building for the rider — addresses stay hidden from the giver."
  }
  return "Your item has been accepted! ❤️ The giver will share a pickup location. Open your profile to see it."
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
    else if (logistics === "porter_arranged") requesterAddress = "Delivery building saved (hidden for privacy)"
    else if (logistics === "giver_sends") requesterAddress = toPublicArea(rawAddress)
    else requesterAddress = toPublicArea(rawAddress)
  }
  return {
    id,
    status: data.status,
    handoverStage: data.handoverStage || (data.status === "pending" ? "pending_giver" : null),
    giverLogistics: data.giverLogistics || null,
    requesterName: data.requesterName || null,
    requesterAddress,
    addressSaved: Boolean(rawAddress),
    pickupLocality: data.pickupLocality ? String(data.pickupLocality) : null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
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

      const incomingSnap = await db.collection(collections.itemRequests).limit(200).get()
      for (const doc of incomingSnap.docs) {
        const data = doc.data()
        if (String(data.status) !== "pending") continue
        const itemSnap = await db.collection(collections.items).doc(String(data.itemId)).get()
        if (!itemSnap.exists) continue
        if (!(await sessionIsGiver(db, target, itemSnap.data()!))) continue
        if (notifications.some((n) => n.requestId === doc.id && n.type === "item_claimed")) continue
        const submissionId = itemSnap.data()?.submissionId
        notifications.push({
          id: `live-${doc.id}`,
          role: "giver",
          type: "item_claimed",
          title: "Someone wants to Relove your item",
          body: `${data.requesterName || "Someone"} asked for ${data.itemTitle || "your item"}. Accept or decline now.`,
          href: submissionId ? `/account/gifts/${submissionId}` : "/account",
          itemTitle: data.itemTitle || null,
          requestId: doc.id,
          read: false,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        })
      }

      notifications.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      const trimmed = notifications.slice(0, 60)
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
      const snap = await db.collection(collections.itemRequests).limit(200).get()
      const incoming = []
      for (const doc of snap.docs) {
        const data = doc.data()
        if (!["pending", "approved"].includes(String(data.status))) continue
        const itemSnap = await db.collection(collections.items).doc(String(data.itemId)).get()
        if (!itemSnap.exists) continue
        if (!(await sessionIsGiver(db, target, itemSnap.data()!))) continue
        incoming.push({
          ...serializeIncoming(doc.id, data, { forGiver: true }),
          submissionId: itemSnap.data()?.submissionId || null,
        })
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
      const hasAddress = String(claim.requesterAddress || "").trim().length >= 2
      const handoverStage: HandoverStage = accept
        ? needsReceiverAddress(logistics) && !hasAddress
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
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      await itemRef.set(
        {
          publicStatus: accept ? "claimed" : "available",
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
        title: accept ? "You're matched" : "Couldn't match this time",
        body: accept
          ? `${claim.itemTitle} is yours to Relove. Open the claim to chat and share handover details.`
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
          title: "You accepted a Relove",
          body: `The receiver is matched to ${claim.itemTitle}. Chat to arrange handover.`,
          href: item.submissionId ? `/account/gifts/${item.submissionId}` : "/account",
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
          href: itemSnap.data()?.submissionId ? `/account/gifts/${itemSnap.data()?.submissionId}` : "/account",
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
        .set({ publicStatus: "reloved", updatedAt: FieldValue.serverTimestamp() }, { merge: true })

      const updated = await ref.get()
      const itemSnapAfter = await db.collection(collections.items).doc(String(claim.itemId)).get()
      const giver = itemSnapAfter.exists ? await resolveGiverContact(db, itemSnapAfter.data()!) : null
      await pushUserNotification({
        donorTarget: giver?.donorTarget || giver?.email,
        role: "giver",
        type: "received",
        title: "Your gift was Reloved",
        body: `${claim.requesterName || "The receiver"} confirmed they received ${claim.itemTitle}.`,
        href: itemSnapAfter.data()?.submissionId ? `/account/gifts/${itemSnapAfter.data()?.submissionId}` : "/account",
        itemTitle: String(claim.itemTitle || ""),
        requestId: ref.id,
      }).catch((err) => console.error("received in-app", err))
      res.json({ ok: true, claim: serializeIncoming(updated.id, updated.data()!) })
    } catch (err) {
      console.error("received", err)
      res.status(500).json({ error: "Couldn't confirm received" })
    }
  })
}
