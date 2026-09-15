import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { z } from "zod"
import { signSessionToken } from "../lib/auth"
import { getAdminAuth } from "../lib/firebaseAuth"
import { findDonorProfileDoc } from "../lib/donorIdentity"
import { collections, getDb } from "../lib/firestore"
import { isMultipart, parseMultipart } from "../lib/multipart"
import { sendClaimAdminAlert, sendClaimConfirmation, sendItemClaimNotifyGiver, sendNewMessageAdminAlert, sendNewMessageDonorAlert, sendWelcomeEmail } from "../lib/notifications"
import { pushUserNotification } from "../lib/userNotifications"
import {
  autoReplyText,
  canAccessThread,
  getOrCreatePeerThread,
  getOrCreateThread,
  listMessages,
  peerPartyForSession,
  postMessage,
  serializeThread,
  THREAD_QUICK_QUESTIONS,
  type ThreadSubjectType,
} from "../lib/messageThreads"
import { uploadImage } from "../lib/storage"
import { requireRole } from "../middleware/session"
import { registerMatchFlowRoutes, assertGiverSendsRadius, resolveGiverContact } from "./matchFlow"

export const donorRouter = Router()
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || ""

const OTP_VERIFIED_WINDOW_MS = 30 * 60 * 1000
const PHONE_REGEX = /^[6-9]\d{9}$/
/** Max Wall-of-Kindness claim requests a donor can send per calendar month. */
const DONOR_MONTHLY_REQUEST_LIMIT = 3

function monthWindowUtc() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end, resetsAt: end.toISOString() }
}

async function countDonorRequestsThisMonth(target: string): Promise<number> {
  const { start } = monthWindowUtc()
  const snap = await getDb()
    .collection(collections.itemRequests)
    .where("requesterTarget", "==", target)
    .limit(100)
    .get()
  return snap.docs.filter((d) => {
    const created = d.data().createdAt?.toDate?.() as Date | undefined
    return created && created >= start
  }).length
}

/**
 * A donor can log in via email one session and phone another. Both point at
 * the same person, so resolve to a single profile doc by whichever identity
 * matches — session target, its email field, or its phone field — instead of
 * an exact match on `target` alone (which would silently spawn a duplicate
 * profile on the second identity).
 */
export { findDonorProfileDoc }

function serializeProfile(id: string, data: Record<string, any>, sessionUid?: string) {
  const toIso = (v: any) =>
    v?.toDate?.()?.toISOString?.() || (typeof v === "string" ? v : null)
  const sessionEmail =
    sessionUid && sessionUid.includes("@") ? sessionUid.trim().toLowerCase() : null
  return {
    id,
    target: data.target,
    name: data.name ?? null,
    username: data.username ?? null,
    gender: data.gender ?? null,
    phone: data.phone ?? null,
    email: data.email || sessionEmail || null,
    address: data.address ?? null,
    addressLabel: data.addressLabel ?? null,
    pincode: data.pincode ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    onboardedAt: toIso(data.onboardedAt),
    updatedAt: toIso(data.updatedAt),
  }
}

const donorSessionSchema = z.object({
  channel: z.enum(["sms", "email"]),
  target: z.string().min(3).max(120),
})

const googleSessionSchema = z.object({
  idToken: z.string().min(10),
})

const donorProfileSchema = z.object({
  name: z.string().min(1).max(120),
  username: z.string().min(2).max(40),
  gender: z.enum(["men", "women", "unisex", "kids"]),
  phone: z.string().regex(PHONE_REGEX, "Enter a valid 10-digit mobile number starting with 6–9"),
  address: z.string().max(500).optional().nullable(),
  addressLabel: z.string().max(40).optional().nullable(),
  pincode: z.string().max(20).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
})

const itemRequestSchema = z.object({
  itemId: z.string().min(1),
  requesterName: z.string().min(1).max(120),
  requesterPhone: z.string().regex(PHONE_REGEX, "Enter a valid 10-digit mobile number"),
  requesterAddress: z.string().max(300).optional().or(z.literal("")),
  note: z.string().max(1000).optional().or(z.literal("")),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
})

async function isRecentlyVerified(target: string): Promise<boolean> {
  const sinceMs = Date.now() - OTP_VERIFIED_WINDOW_MS
  const snap = await getDb()
    .collection(collections.otpCodes)
    .where("target", "==", target)
    .limit(20)
    .get()
  return snap.docs.some((d) => {
    const verifiedAt = d.data().verifiedAt?.toMillis?.() ?? 0
    return verifiedAt >= sinceMs
  })
}

donorRouter.post("/session", async (req, res) => {
  const parsed = donorSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { target } = parsed.data

  try {
    const verified = await isRecentlyVerified(target)
    if (!verified) {
      res.status(403).json({ error: "Verify your phone/email with an OTP first." })
      return
    }
    const token = await signSessionToken({ uid: target, email: target, role: "donor" })
    res.json({ token, target })
  } catch (err) {
    console.error("donor session", err)
    res.status(500).json({ error: "Couldn't create session" })
  }
})

// Google's own attestation replaces the OTP step (their token proves a
// verified email); everything downstream (session shape, profile linking,
// onboarding gate) is identical to the OTP path so the two can't diverge.
donorRouter.post("/session/google", async (req, res) => {
  const parsed = googleSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(parsed.data.idToken)
    const email = (decoded.email || "").trim().toLowerCase()
    if (!email || !decoded.email_verified) {
      res.status(401).json({ error: "That Google account has no verified email." })
      return
    }

    const target = email
    const token = await signSessionToken({ uid: target, email: target, role: "donor" })

    // Link into any profile that already exists under this email (from an
    // earlier OTP login or a prior Google sign-in) instead of leaving it to
    // be discovered lazily — also carries the Google display name in for a
    // first-time onboarding prefill.
    const db = getDb()
    const existingDoc = await findDonorProfileDoc(db, target)
    if (existingDoc) {
      await existingDoc.ref.set({ googleUid: decoded.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    }

    res.json({
      token,
      target,
      googleName: (decoded.name as string | undefined) || null,
    })
  } catch (err) {
    console.error("donor google session", err)
    res.status(401).json({ error: "Couldn't verify Google sign-in. Please try again." })
  }
})

donorRouter.get("/profile", requireRole("donor"), async (req, res) => {
  try {
    const sessionUid = req.session!.uid
    const doc = await findDonorProfileDoc(getDb(), sessionUid)
    if (!doc) {
      res.json({ profile: null })
      return
    }
    const data = doc.data()
    // Persist login email onto the profile when it was never stored at onboarding.
    if (!data.email && sessionUid.includes("@")) {
      await doc.ref.set({ email: sessionUid.trim().toLowerCase(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      data.email = sessionUid.trim().toLowerCase()
    }
    res.json({ profile: serializeProfile(doc.id, data, sessionUid) })
  } catch (err) {
    console.error("donor profile get", err)
    res.status(500).json({ error: "Couldn't load profile" })
  }
})

const profilePatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  username: z.string().min(2).max(40).optional(),
  gender: z.enum(["men", "women", "unisex", "kids"]).optional(),
  phone: z.string().regex(PHONE_REGEX, "Enter a valid 10-digit mobile number starting with 6–9").optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional().nullable(),
  addressLabel: z.string().max(40).optional().nullable(),
  pincode: z.string().max(20).optional().nullable(),
})

donorRouter.patch("/profile", requireRole("donor"), async (req, res) => {
  const parsed = profilePatchSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  try {
    const target = req.session!.uid
    const db = getDb()
    const existingDoc = await findDonorProfileDoc(db, target)
    if (!existingDoc) {
      res.status(404).json({ error: "Profile not found. Complete onboarding first." })
      return
    }

    const ref = existingDoc.ref
    const current = existingDoc.data()
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }

    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.username !== undefined) updates.username = parsed.data.username.replace(/^@/, "")
    if (parsed.data.gender !== undefined) updates.gender = parsed.data.gender
    if (parsed.data.address !== undefined) updates.address = parsed.data.address
    if (parsed.data.addressLabel !== undefined) updates.addressLabel = parsed.data.addressLabel
    if (parsed.data.pincode !== undefined) updates.pincode = parsed.data.pincode

    if (parsed.data.phone !== undefined) {
      const nextPhone = parsed.data.phone
      const prevPhone = String(current.phone || "").replace(/\D/g, "")
      if (nextPhone !== prevPhone) {
        const verified = await isRecentlyVerified(nextPhone)
        if (!verified) {
          res.status(403).json({
            error: "Verify the new mobile number with an OTP before saving.",
          })
          return
        }
        updates.phone = nextPhone
      }
    }

    if (parsed.data.email !== undefined) {
      const nextEmail = (parsed.data.email || "").trim().toLowerCase()
      const prevEmail = String(current.email || "").trim().toLowerCase()
      if (nextEmail && nextEmail !== prevEmail) {
        const verified = await isRecentlyVerified(nextEmail)
        if (!verified) {
          res.status(403).json({
            error: "Verify the new email with an OTP before saving.",
          })
          return
        }
        updates.email = nextEmail
      } else if (!nextEmail) {
        updates.email = null
      }
    }

    await ref.set(updates, { merge: true })
    const doc = await ref.get()
    res.json({ profile: serializeProfile(doc.id, doc.data() || {}, target) })
  } catch (err) {
    console.error("donor profile patch", err)
    res.status(500).json({ error: "Couldn't update profile" })
  }
})

donorRouter.post("/profile", requireRole("donor"), async (req, res) => {
  const parsed = donorProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const target = req.session!.uid
  const emailFromSession = target.includes("@") ? target.trim().toLowerCase() : null

  try {
    const db = getDb()
    // Onboarding via email, then again via a phone that's already on file
    // (or vice versa) must land on the same profile, not spawn a duplicate.
    const existingDoc = await findDonorProfileDoc(db, target, parsed.data.phone)
    const existingData = existingDoc?.data()

    const data = {
      target: existingData?.target ?? target,
      ...parsed.data,
      phone: parsed.data.phone ?? null,
      email: emailFromSession ?? existingData?.email ?? null,
      address: parsed.data.address ?? null,
      addressLabel: parsed.data.addressLabel ?? null,
      pincode: parsed.data.pincode ?? null,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (!existingDoc) {
      const ref = await db.collection(collections.donorProfiles).add({
        ...data,
        onboardedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      })
      const doc = await ref.get()
      if (data.email) {
        await sendWelcomeEmail(data.email, { firstName: data.name }).catch((err) =>
          console.error("Failed to send welcome email:", err)
        )
      }
      res.json({ profile: serializeProfile(doc.id, doc.data() || {}, target) })
    } else {
      await existingDoc.ref.set(
        { ...data, onboardedAt: existingData?.onboardedAt ?? FieldValue.serverTimestamp() },
        { merge: true }
      )
      const doc = await existingDoc.ref.get()
      res.json({ profile: serializeProfile(doc.id, doc.data() || {}, target) })
    }
  } catch (err) {
    console.error("donor profile post", err)
    res.status(500).json({ error: "Couldn't save profile" })
  }
})

donorRouter.get("/submissions", requireRole("donor"), async (req, res) => {
  try {
    const target = req.session!.uid
    const db = getDb()
    const profileSnap = await db
      .collection(collections.donorProfiles)
      .where("target", "==", target)
      .limit(1)
      .get()
    const profile = profileSnap.empty ? null : profileSnap.docs[0].data()
    const identities = new Set(
      [target, profile?.phone, profile?.email, typeof target === "string" && target.includes("@") ? target : null]
        .filter((v): v is string => Boolean(v))
        .map((v) => v.trim().toLowerCase())
    )
    const phones = new Set(
      [profile?.phone]
        .filter((v): v is string => Boolean(v))
        .map((v) => String(v).replace(/\D/g, ""))
        .filter((v) => v.length >= 10)
    )

    // Phones used on take-requests for this account often match earlier drops
    // that weren't linked (before donorTarget existed).
    const reqSnap = await db
      .collection(collections.itemRequests)
      .where("requesterTarget", "==", target)
      .limit(50)
      .get()
    for (const r of reqSnap.docs) {
      const p = String(r.data().requesterPhone || "").replace(/\D/g, "")
      if (p.length >= 10) phones.add(p)
    }

    const snap = await db.collection(collections.donationSubmissions).limit(300).get()
    const matched = snap.docs.filter((d) => {
      const data = d.data()
      if (data.donorTarget && data.donorTarget === target) return true
      const email = String(data.email || "").trim().toLowerCase()
      if (email && identities.has(email)) return true
      const phone = String(data.phone || "").replace(/\D/g, "")
      if (phone && phones.has(phone)) return true
      return false
    })

    const submissions = []
    for (const doc of matched) {
      const itemsSnap = await db
        .collection(collections.items)
        .where("submissionId", "==", doc.id)
        .limit(20)
        .get()
      const raw = doc.data()
      const submittedAt =
        raw.submittedAt?.toDate?.()?.toISOString?.() ||
        raw.createdAt?.toDate?.()?.toISOString?.() ||
        null

      const itemIds = itemsSnap.docs.map((i) => i.id)
      const claimByItemId: Record<string, any> = {}
      if (itemIds.length > 0) {
        const claimsSnap = await db
          .collection(collections.itemRequests)
          .where("itemId", "in", itemIds.slice(0, 10))
          .limit(30)
          .get()
        for (const cd of claimsSnap.docs) {
          const cdata = cd.data()
          const prev = claimByItemId[cdata.itemId]
          const rank = (s: string) => (s === "pending" ? 3 : s === "approved" ? 2 : 1)
          if (!prev || rank(String(cdata.status)) >= rank(String(prev.status))) {
            claimByItemId[cdata.itemId] = {
              id: cd.id,
              status: cdata.status,
              handoverStage: cdata.handoverStage || null,
              requesterName: cdata.requesterName || null,
              requesterAddress: cdata.requesterAddress || null,
              deliveryStatus: cdata.deliveryStatus || null,
              borzoTrackingUrl: cdata.borzoTrackingUrl || null,
              borzoStatus: cdata.borzoStatus || null,
              borzoCourier: cdata.borzoCourier || null,
            }
          }
        }
      }

      submissions.push({
        id: doc.id,
        reference: raw.reference,
        status: raw.status,
        submittedAt,
        items: itemsSnap.docs.map((item) => {
          const d = item.data()
          return {
            id: item.id,
            slug: d.slug,
            title: d.title,
            category: d.category,
            status: d.status,
            publicVisibility: d.publicVisibility,
            images: d.images || [],
            publicStatus: d.publicStatus || null,
            giverLogistics: d.giverLogistics || null,
            claim: claimByItemId[item.id] || null,
            delivery: claimByItemId[item.id] || null,
          }
        }),
      })
    }

    submissions.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")))
    res.json({ submissions })
  } catch (err) {
    console.error("donor submissions", err)
    res.status(500).json({ error: "Couldn't load submissions" })
  }
})

donorRouter.post("/item-requests", requireRole("donor"), async (req, res) => {
  try {
    let fields: Record<string, string> = {}
    let photoBuffer: Buffer | null = null
    let photoMime = "image/jpeg"

    if (isMultipart(req)) {
      const parsedForm = await parseMultipart(req)
      fields = parsedForm.fields
      const photo = parsedForm.files.find((f) => f.fieldname === "photo")
      if (photo) {
        photoBuffer = photo.buffer
        photoMime = photo.mimeType || "image/jpeg"
      }
    } else {
      fields = Object.fromEntries(
        Object.entries(req.body || {}).map(([k, v]) => [k, v == null ? "" : String(v)])
      )
    }

    const parsed = itemRequestSchema.safeParse(fields)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const target = req.session!.uid
    const monthlyUsed = await countDonorRequestsThisMonth(target)
    if (monthlyUsed >= DONOR_MONTHLY_REQUEST_LIMIT) {
      const { resetsAt } = monthWindowUtc()
      res.status(429).json({
        error: `Monthly limit reached: you've already sent ${monthlyUsed}/${DONOR_MONTHLY_REQUEST_LIMIT} requests this month. Resets ${new Date(resetsAt).toLocaleDateString()}.`,
        monthlyUsed,
        monthlyLimit: DONOR_MONTHLY_REQUEST_LIMIT,
        resetsAt,
      })
      return
    }

    const { itemId, requesterName, requesterPhone, requesterAddress, note, latitude, longitude } = parsed.data

    let photoStoragePath: string | null = null
    if (photoBuffer) {
      try {
        const saved = await uploadImage(photoBuffer, "item-requests", photoMime)
        photoStoragePath = saved.url
      } catch (err) {
        console.error("item-request photo", err)
        photoStoragePath = null
      }
    }

    const db = getDb()
    const itemRef = db.collection(collections.items).doc(itemId)
    const itemPre = await itemRef.get()
    if (!itemPre.exists) {
      res.status(409).json({ error: "This item is no longer available to request." })
      return
    }
    const itemPreData = itemPre.data()!
    const giver = await resolveGiverContact(db, itemPreData)
    if (giver.donorTarget && giver.donorTarget === target) {
      res.status(400).json({ error: "You can't claim an item you gave." })
      return
    }

    const profileDoc = await findDonorProfileDoc(db, target)
    const profile = profileDoc?.data()
    const claimerLat = latitude ?? (profile?.latitude != null ? Number(profile.latitude) : null)
    const claimerLng = longitude ?? (profile?.longitude != null ? Number(profile.longitude) : null)
    const radius = await assertGiverSendsRadius({
      item: itemPreData,
      submission: giver.submission,
      claimerLat: Number.isFinite(claimerLat as number) ? (claimerLat as number) : null,
      claimerLng: Number.isFinite(claimerLng as number) ? (claimerLng as number) : null,
    })
    if (!radius.ok) {
      res.status(radius.status).json({ error: radius.error })
      return
    }

    const logistics = String(itemPreData.giverLogistics || giver.submission?.giverLogistics || "")
    const pickupLocality = String(
      itemPreData.locality || giver.submission?.locality || giver.submission?.pickupLocality || ""
    )
    const address = String(requesterAddress || "").trim()
    const requestRef = db.collection(collections.itemRequests).doc()

    const request = await db.runTransaction(async (tx) => {
      const itemDoc = await tx.get(itemRef)
      if (!itemDoc.exists) {
        throw Object.assign(new Error("UNAVAILABLE"), { code: "UNAVAILABLE" })
      }
      const item = itemDoc.data()!
      if (item.publicVisibility !== true || item.publicStatus !== "available") {
        throw Object.assign(new Error("UNAVAILABLE"), { code: "UNAVAILABLE" })
      }

      const created = {
        itemId,
        itemTitle: item.title,
        itemSlug: item.slug,
        itemImages: item.images || [],
        requesterTarget: target,
        requesterName,
        requesterPhone,
        requesterAddress: address || null,
        requesterLatitude: claimerLat ?? null,
        requesterLongitude: claimerLng ?? null,
        giverLogistics: logistics || null,
        pickupLocality: pickupLocality || null,
        handoverStage: "pending_giver",
        note: note || null,
        photoStoragePath,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
      }
      tx.set(requestRef, created)
      tx.update(itemRef, {
        publicStatus: "being_matched",
        updatedAt: FieldValue.serverTimestamp(),
      })
      return created
    })

    if (ADMIN_NOTIFY_EMAIL) {
      await sendClaimAdminAlert(ADMIN_NOTIFY_EMAIL, {
        requesterName,
        itemTitle: request.itemTitle,
        requesterPhone,
      }).catch((err) => console.error("Failed to send admin new-claim notification:", err))
    }

    // requesterTarget is whatever identity they logged in with — resolve to
    // an email either directly or via their linked profile (see findDonorProfileDoc).
    let requesterEmail = target.includes("@") ? target : null
    if (!requesterEmail) {
      const profileDoc = await findDonorProfileDoc(db, target)
      requesterEmail = (profileDoc?.data()?.email as string | undefined) || null
    }
    if (requesterEmail) {
      await sendClaimConfirmation(requesterEmail, { requesterName, itemTitle: request.itemTitle }).catch((err) =>
        console.error("Failed to send claim confirmation email:", err)
      )
    }

    // Notify the giver that someone requested their item (email from submission or profile).
    try {
      const itemSnap = await itemRef.get()
      const submissionId = String(itemSnap.data()?.submissionId || "")
      let giverEmail: string | null = null
      let giverFirstName = "there"
      let giverTarget: string | null = null
      if (submissionId) {
        const subSnap = await db.collection(collections.donationSubmissions).doc(submissionId).get()
        if (subSnap.exists) {
          const sub = subSnap.data()!
          giverTarget = sub.donorTarget ? String(sub.donorTarget) : null
          giverEmail = String(sub.email || "").trim().toLowerCase() || null
          giverFirstName = String(sub.donorFirstName || "").trim() || "there"
          if (!giverEmail && sub.donorTarget) {
            const giverProfile = await findDonorProfileDoc(db, String(sub.donorTarget))
            giverEmail = (giverProfile?.data()?.email as string | undefined) || null
            if (giverFirstName === "there") {
              giverFirstName = String(giverProfile?.data()?.name || "").trim() || "there"
            }
          }
        }
      }
      const giftHref = submissionId ? `/account/gifts/${submissionId}` : "/account"
      await pushUserNotification({
        donorTarget: giverTarget || giverEmail,
        role: "giver",
        type: "item_claimed",
        title: "Someone wants to Relove your item",
        body: `${requesterName} asked for ${request.itemTitle}. Open your gift to Accept or Decline.`,
        href: giftHref,
        itemTitle: String(request.itemTitle || ""),
        requestId: requestRef.id,
      }).catch((err) => console.error("giver claim in-app notify", err))
      await pushUserNotification({
        donorTarget: target,
        role: "claimer",
        type: "claim_sent",
        title: "Request sent",
        body: `You asked for ${request.itemTitle}. We'll notify you when the giver accepts or declines.`,
        href: `/account/claims/${requestRef.id}`,
        itemTitle: String(request.itemTitle || ""),
        requestId: requestRef.id,
      }).catch((err) => console.error("claimer claim in-app notify", err))
      if (giverEmail) {
        await sendItemClaimNotifyGiver(giverEmail, {
          firstName: giverFirstName,
          itemTitle: String(request.itemTitle || "your item"),
        }).catch((err) => console.error("Failed to send giver claim-notify email:", err))
      }
    } catch (err) {
      console.error("giver claim-notify lookup", err)
    }

    res.status(201).json({
      request: {
        id: requestRef.id,
        ...request,
        createdAt: new Date().toISOString(),
      },
      monthlyUsed: monthlyUsed + 1,
      monthlyLimit: DONOR_MONTHLY_REQUEST_LIMIT,
      resetsAt: monthWindowUtc().resetsAt,
    })
  } catch (err: any) {
    if (err?.code === "UNAVAILABLE" || err?.message === "UNAVAILABLE") {
      res.status(409).json({ error: "This item is no longer available to request." })
      return
    }
    console.error("item-requests post", err)
    res.status(500).json({ error: "Couldn't send your request. Please try again." })
  }
})

donorRouter.get("/item-requests", requireRole("donor"), async (req, res) => {
  try {
    const target = req.session!.uid
    const snap = await getDb()
      .collection(collections.itemRequests)
      .where("requesterTarget", "==", target)
      .limit(50)
      .get()

    const requests = snap.docs
      .map((d) => {
        const data = d.data()
        return {
          id: d.id,
          status: data.status,
          handoverStage: data.handoverStage || null,
          giverLogistics: data.giverLogistics || null,
          pickupLocality: data.pickupLocality || null,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
          requesterAddress: data.requesterAddress || null,
          note: data.note || null,
          deliveryStatus: data.deliveryStatus || null,
          deliveryUpdatedAt: data.deliveryUpdatedAt?.toDate?.()?.toISOString?.() || null,
          borzoOrderId: data.borzoOrderId || null,
          borzoOrderName: data.borzoOrderName || null,
          borzoStatus: data.borzoStatus || null,
          borzoDeliveryStatus: data.borzoDeliveryStatus || null,
          borzoTrackingUrl: data.borzoTrackingUrl || null,
          borzoCourier: data.borzoCourier || null,
          borzoDeliveryFee: data.borzoDeliveryFee || null,
          item: {
            id: data.itemId,
            slug: data.itemSlug,
            title: data.itemTitle,
            images: data.itemImages || [],
          },
        }
      })
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))

    const monthlyUsed = await countDonorRequestsThisMonth(target)
    const { resetsAt } = monthWindowUtc()
    res.json({
      requests,
      monthlyUsed,
      monthlyLimit: DONOR_MONTHLY_REQUEST_LIMIT,
      resetsAt,
    })
  } catch (err) {
    console.error("item-requests get", err)
    res.status(500).json({ error: "Couldn't load requests" })
  }
})

/**
 * Calculates Borzo delivery price for a claimer on their approved claim.
 */
donorRouter.post("/item-requests/:id/borzo/estimate", requireRole("donor"), async (req, res) => {
  try {
    const { borzoConfigured, borzoCalculateOrder } = await import("../lib/borzo")
    if (!borzoConfigured()) {
      res.status(400).json({
        error: "BORZO_AUTH_TOKEN is not configured on the server. Please contact Reloved ops.",
      })
      return
    }

    const db = getDb()
    const target = req.session!.uid
    const snap = await db.collection(collections.itemRequests).doc(req.params.id).get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    const profileDoc = await findDonorProfileDoc(db, target)
    const profile = profileDoc?.data()
    const isOwner =
      claimData.requesterTarget === target ||
      (profile?.email && claimData.requesterTarget === profile.email) ||
      (profile?.phone && claimData.requesterPhone && String(claimData.requesterPhone).replace(/\D/g, "") === String(profile.phone).replace(/\D/g, ""))

    if (!isOwner) {
      res.status(403).json({ error: "This isn't your item request" })
      return
    }

    const { resolveAddressesForClaim } = await import("./admin")
    const addrs = await resolveAddressesForClaim(db, claimData)
    if (!addrs.pickupAddress) {
      res.status(400).json({ error: "Donor pickup building/locality could not be found." })
      return
    }
    if (!addrs.dropAddress) {
      res.status(400).json({ error: "Your delivery drop address is missing on this request." })
      return
    }

    const calculation = await borzoCalculateOrder({
      pickupAddress: addrs.pickupAddress,
      dropAddress: addrs.dropAddress,
      matter: `Reloved: ${claimData.itemTitle || "Preloved item"} (#${req.params.id.slice(0, 6)})`,
    })

    res.json({
      ok: true,
      pickupAddress: addrs.pickupAddress,
      dropAddress: addrs.dropAddress,
      paymentAmount: calculation.paymentAmount,
      deliveryFeeAmount: calculation.deliveryFeeAmount,
      currency: "INR",
    })
  } catch (err: any) {
    console.error("donor borzo estimate", err)
    res.status(500).json({ error: err?.message || "Failed to estimate Borzo delivery fee" })
  }
})

/**
 * Allows the claimer to book Borzo rider in 1 click once claim is approved.
 */
donorRouter.post("/item-requests/:id/borzo/book", requireRole("donor"), async (req, res) => {
  try {
    const { borzoConfigured, borzoCreateOrder } = await import("../lib/borzo")
    if (!borzoConfigured()) {
      res.status(400).json({
        error: "BORZO_AUTH_TOKEN is not configured on the server. Please contact Reloved ops.",
      })
      return
    }

    const db = getDb()
    const target = req.session!.uid
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    const profileDoc = await findDonorProfileDoc(db, target)
    const profile = profileDoc?.data()
    const isOwner =
      claimData.requesterTarget === target ||
      (profile?.email && claimData.requesterTarget === profile.email) ||
      (profile?.phone && claimData.requesterPhone && String(claimData.requesterPhone).replace(/\D/g, "") === String(profile.phone).replace(/\D/g, ""))

    if (!isOwner) {
      res.status(403).json({ error: "This isn't your item request" })
      return
    }

    if (claimData.status !== "approved") {
      res.status(400).json({ error: "Your claim must be approved before booking Borzo delivery." })
      return
    }
    if (claimData.borzoOrderId && claimData.borzoStatus !== "canceled") {
      res.status(409).json({
        error: `Borzo order #${claimData.borzoOrderId} already exists for this claim.`,
      })
      return
    }

    const { resolveAddressesForClaim, advanceDeliveryStageAndNotify } = await import("./admin")
    const addrs = await resolveAddressesForClaim(db, claimData)
    if (!addrs.pickupAddress) {
      res.status(400).json({ error: "Donor pickup building/locality could not be found." })
      return
    }
    if (!addrs.dropAddress) {
      res.status(400).json({ error: "Your delivery drop address is missing on this request." })
      return
    }

    const order = await borzoCreateOrder({
      clientOrderId: `claim_${req.params.id}`,
      pickupAddress: addrs.pickupAddress,
      dropAddress: addrs.dropAddress,
      matter: `Reloved: ${claimData.itemTitle || "Preloved item"} (#${req.params.id.slice(0, 6)})`,
    })

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
    const data = updated.data()!
    res.json({
      ok: true,
      order,
      request: {
        id: updated.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
      },
    })
  } catch (err: any) {
    console.error("donor borzo book", err)
    res.status(500).json({ error: err?.message || "Failed to book Borzo delivery" })
  }
})

const threadOpenSchema = z.object({
  subjectType: z.enum(["donation", "claim", "peer"]),
  subjectId: z.string().min(1),
})

function threadErrorStatus(err: "NOT_FOUND" | "FORBIDDEN" | "NOT_APPROVED") {
  if (err === "NOT_FOUND") return { status: 404, error: "Not found" }
  if (err === "FORBIDDEN") return { status: 403, error: "This isn't your item" }
  return { status: 409, error: "Chat isn't available for this status." }
}

/** Opens (or resumes) the chat thread for an approved donation/claim the caller owns. */
donorRouter.post("/threads/open", requireRole("donor"), async (req, res) => {
  const parsed = threadOpenSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const db = getDb()
    const { subjectType, subjectId } = parsed.data
    const result =
      subjectType === "peer"
        ? await getOrCreatePeerThread(db, subjectId, req.session!.uid)
        : await getOrCreateThread(db, subjectType, subjectId, req.session!.uid)
    if ("error" in result) {
      const { status, error } = threadErrorStatus(result.error)
      res.status(status).json({ error })
      return
    }
    const messages = await listMessages(db, result.id)
    res.json({
      thread: serializeThread(result.id, result.data),
      messages,
      quickQuestions: THREAD_QUICK_QUESTIONS[subjectType],
      party: "party" in result ? result.party : undefined,
    })
  } catch (err) {
    console.error("donor threads open", err)
    res.status(500).json({ error: "Couldn't open chat" })
  }
})

donorRouter.get("/threads/:id", requireRole("donor"), async (req, res) => {
  try {
    const db = getDb()
    const ref = db.collection(collections.messageThreads).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const data = snap.data()!
    if (!(await canAccessThread(db, data, req.session!.uid))) {
      res.status(403).json({ error: "This isn't your chat" })
      return
    }
    const messages = await listMessages(db, ref.id)
    const party = await peerPartyForSession(db, data, req.session!.uid)
    const readPatch =
      data.subjectType === "peer"
        ? party === "giver"
          ? { unreadForGiver: false }
          : { unreadForClaimer: false, unreadForOwner: false }
        : { unreadForOwner: false }
    if (
      (data.subjectType === "peer" && ((party === "giver" && data.unreadForGiver) || (party === "claimer" && data.unreadForClaimer))) ||
      (data.subjectType !== "peer" && data.unreadForOwner)
    ) {
      await ref.set(readPatch, { merge: true })
    }
    res.json({
      thread: serializeThread(ref.id, data as any),
      messages,
      quickQuestions: THREAD_QUICK_QUESTIONS[(data.subjectType as ThreadSubjectType) || "claim"],
      party: party || undefined,
    })
  } catch (err) {
    console.error("donor thread get", err)
    res.status(500).json({ error: "Couldn't load chat" })
  }
})

const threadMessageSchema = z.object({
  text: z.string().min(1).max(1000),
  quickReplyKey: z.string().max(40).optional(),
})

donorRouter.post("/threads/:id/messages", requireRole("donor"), async (req, res) => {
  const parsed = threadMessageSchema.safeParse(req.body)
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
    if (!(await canAccessThread(db, thread, req.session!.uid))) {
      res.status(403).json({ error: "This isn't your chat" })
      return
    }
    const peerParty = await peerPartyForSession(db, thread, req.session!.uid)
    const senderRole =
      thread.subjectType === "peer"
        ? peerParty === "giver"
          ? "donor"
          : "claimer"
        : thread.subjectType === "donation"
          ? "donor"
          : "claimer"
    const senderName =
      senderRole === "donor"
        ? thread.subjectType === "peer"
          ? "Giver"
          : thread.ownerName || "there"
        : thread.ownerName || "there"
    await postMessage(db, ref.id, {
      senderRole,
      senderName,
      text: parsed.data.text,
      quickReplyKey: parsed.data.quickReplyKey,
    })

    if (thread.subjectType === "peer") {
      const otherTarget =
        peerParty === "giver" ? String(thread.claimerTarget || thread.ownerTarget || "") : String(thread.giverTarget || "")
      let otherEmail = otherTarget.includes("@") ? otherTarget : ""
      if (!otherEmail && otherTarget) {
        const otherProfile = await findDonorProfileDoc(db, otherTarget)
        otherEmail = String(otherProfile?.data()?.email || "")
      }
      if (otherEmail) {
        await sendNewMessageDonorAlert(otherEmail, {
          firstName: peerParty === "giver" ? String(thread.ownerName || "there") : "there",
          itemTitle: thread.itemTitle,
          preview: parsed.data.text.slice(0, 140),
        }).catch((err) => console.error("peer chat notify", err))
      }
      await pushUserNotification({
        donorTarget: otherTarget || otherEmail,
        role: peerParty === "giver" ? "claimer" : "giver",
        type: "new_message",
        title: "New handover message",
        body: `${senderName} wrote on ${thread.itemTitle}: "${parsed.data.text.slice(0, 80)}"`,
        href: peerParty === "giver" ? `/account/claims/${thread.subjectId}` : `/account`,
        itemTitle: String(thread.itemTitle || ""),
        requestId: String(thread.subjectId || ""),
      }).catch((err) => console.error("peer chat in-app notify", err))
    } else {
      const reply = await autoReplyText(db, thread.subjectType, thread.subjectId, parsed.data.quickReplyKey)
      if (reply) {
        await postMessage(db, ref.id, { senderRole: "system", senderName: "Reloved", text: reply })
      } else if (ADMIN_NOTIFY_EMAIL) {
        await sendNewMessageAdminAlert(ADMIN_NOTIFY_EMAIL, {
          senderName: thread.ownerName || "A donor",
          itemTitle: thread.itemTitle,
          preview: parsed.data.text.slice(0, 140),
          dashboardUrl:
            thread.subjectType === "donation"
              ? `${process.env.PUBLIC_APP_URL || "https://reloved.digital"}/admin/donations`
              : `${process.env.PUBLIC_APP_URL || "https://reloved.digital"}/admin/item-requests`,
        }).catch((err) => console.error("Failed to send new-message admin alert:", err))
      }
    }

    const messages = await listMessages(db, ref.id)
    const updated = await ref.get()
    res.status(201).json({
      thread: serializeThread(ref.id, updated.data() as any),
      messages,
    })
  } catch (err) {
    console.error("donor thread message post", err)
    res.status(500).json({ error: "Couldn't send message" })
  }
})

registerMatchFlowRoutes(donorRouter)
