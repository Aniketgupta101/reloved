import { Router } from "express"
import { FieldValue, type QuerySnapshot } from "firebase-admin/firestore"
import { z } from "zod"
import { signSessionToken } from "../lib/auth"
import { getAdminAuth } from "../lib/firebaseAuth"
import {
  findDonorProfileDoc,
  findFirstProfileByPhone,
  isEmailTakenByOtherProfile,
  isPhoneTakenByOtherProfile,
  normalizeEmail,
  normalizePhoneDigits,
  PHONE_ALREADY_EXISTS_MESSAGE,
} from "../lib/donorIdentity"
import { collections, getDb } from "../lib/firestore"
import { isMultipart, parseMultipart } from "../lib/multipart"
import { sendClaimAdminAlert, sendClaimConfirmation, sendItemClaimNotifyGiver, sendNewMessageAdminAlert, sendNewMessageDonorAlert, sendWelcomeEmail, opsAlertRecipients } from "../lib/notifications"
import { pushUserNotification } from "../lib/userNotifications"
import {
  itemHiddenForViewer,
  loadDeclinedItemIdsForViewer,
  resolveViewerHideKeys,
} from "../lib/wallHide"
import {
  autoReplyText,
  FREE_TEXT_ACK,
  canAccessThread,
  getOrCreatePeerThread,
  getOrCreateSupportThread,
  getOrCreateThread,
  listMessages,
  peerPartyForSession,
  postMessage,
  serializeThread,
  THREAD_QUICK_QUESTIONS,
  type ThreadSubjectType,
} from "../lib/messageThreads"
import { PEER_CHAT_BLOCK_MESSAGE, peerChatTextBlocked } from "../lib/privacyText"
import { uploadImage } from "../lib/storage"
import { toPublicArea } from "../lib/geo"
import { requireRole } from "../middleware/session"
import { registerMatchFlowRoutes, assertGiverSendsRadius, resolveGiverContact, sessionIsGiver } from "./matchFlow"
import {
  collectDonorMatchKeys,
  fetchOwnedSubmissionDocs,
  submissionOwnedByDonor,
} from "../lib/donorOwnership"

export const donorRouter = Router()
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || ""

/** Statuses a giver may withdraw from Account → Giving. */
const REMOVABLE_SUBMISSION_STATUSES = new Set([
  "pending",
  "pending_review",
  "submitted",
  "under_review",
  "rejected",
  "approved",
])

/** What the giver may see of the claimer's delivery location — never exact flat/porter drop. */
function maskClaimerAddressForGiver(logistics: string, raw: string | null | undefined): string | null {
  const address = String(raw || "").trim()
  if (!address) return null
  if (logistics === "porter_arranged") return "Delivery building saved (hidden for privacy)"
  if (logistics === "giver_sends") return toPublicArea(address)
  return toPublicArea(address)
}

const OTP_VERIFIED_WINDOW_MS = 30 * 60 * 1000
const PHONE_REGEX = /^[6-9]\d{9}$/
/** Max Wall-of-Kindness claim requests a donor can send per calendar week (F&F pilot). */
const DONOR_WEEKLY_REQUEST_LIMIT = 3

function weekWindowUtc() {
  const now = new Date()
  const day = now.getUTCDay() // 0 Sun … 6 Sat
  const diffToMonday = (day + 6) % 7
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  return { start, end, resetsAt: end.toISOString() }
}

async function countDonorRequestsThisWeek(target: string): Promise<number> {
  const { start } = weekWindowUtc()
  const snap = await getDb()
    .collection(collections.itemRequests)
    .where("requesterTarget", "==", target)
    .limit(100)
    .get()
  // Cancelled / declined claims free the weekly slot so claimers can try again.
  const excluded = new Set(["cancelled", "canceled", "rejected", "declined"])
  return snap.docs.filter((d) => {
    const data = d.data()
    const status = String(data.status || "").toLowerCase()
    if (excluded.has(status)) return false
    const created = data.createdAt?.toDate?.() as Date | undefined
    return Boolean(created && created >= start)
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
  // Optional — profile no longer collects "Clothes for"; kept for legacy docs / Wall prefs.
  gender: z.enum(["men", "women", "unisex", "kids"]).optional().nullable(),
  phone: z.string().regex(PHONE_REGEX, "Enter a valid 10-digit mobile number starting with 6–9").optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional().nullable(),
  addressLabel: z.string().max(40).optional().nullable(),
  pincode: z.string().max(20).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
})

const itemRequestSchema = z.object({
  itemId: z.string().min(1),
  requesterName: z.string().min(1).max(120),
  requesterPhone: z.string().regex(PHONE_REGEX, "Enter a valid 10-digit mobile number").optional().or(z.literal("")),
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
    // Same email+phone person → land on their existing (first) account.
    const existing = await findDonorProfileDoc(getDb(), target)
    const sessionTarget = existing?.data()?.target ? String(existing.data()!.target) : target
    const token = await signSessionToken({ uid: sessionTarget, email: sessionTarget, role: "donor" })
    res.json({ token, target: sessionTarget })
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

    const db = getDb()
    // Two Google emails that already share one profile (linkedEmails / same
    // phone) must open the **first** account — never spawn a second session uid.
    const existingDoc = await findDonorProfileDoc(db, email)
    const sessionTarget = existingDoc?.data()?.target ? String(existingDoc.data()!.target) : email
    const token = await signSessionToken({ uid: sessionTarget, email: sessionTarget, role: "donor" })

    if (existingDoc) {
      const linked = Array.isArray(existingDoc.data()?.linkedEmails)
        ? (existingDoc.data()!.linkedEmails as string[])
        : []
      const updates: Record<string, unknown> = {
        googleUid: decoded.uid,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (email !== normalizeEmail(String(existingDoc.data()?.email || existingDoc.data()?.target || ""))) {
        if (!linked.map((e) => e.toLowerCase()).includes(email)) {
          updates.linkedEmails = FieldValue.arrayUnion(email)
        }
      }
      await existingDoc.ref.set(updates, { merge: true })
    }

    res.json({
      token,
      target: sessionTarget,
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
    // Sliding session: re-issue token on every successful profile read so active
    // users stay signed in until they explicitly log out.
    const token = await signSessionToken({
      uid: sessionUid,
      email: req.session!.email || sessionUid,
      role: "donor",
    })
    if (!doc) {
      res.json({ profile: null, token })
      return
    }
    const data = doc.data() || {}
    // Persist login email onto the profile when it was never stored at onboarding.
    if (!data.email && sessionUid.includes("@")) {
      await doc.ref.set({ email: sessionUid.trim().toLowerCase(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      data.email = sessionUid.trim().toLowerCase()
    }
    res.json({ profile: serializeProfile(doc.id, data, sessionUid), token })
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
    const current = existingDoc.data() || {}
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }

    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.username !== undefined) updates.username = parsed.data.username.replace(/^@/, "")
    if (parsed.data.gender !== undefined) updates.gender = parsed.data.gender
    if (parsed.data.address !== undefined) updates.address = parsed.data.address
    if (parsed.data.addressLabel !== undefined) updates.addressLabel = parsed.data.addressLabel
    if (parsed.data.pincode !== undefined) updates.pincode = parsed.data.pincode

    if (parsed.data.phone !== undefined) {
      const nextPhone = normalizePhoneDigits(parsed.data.phone) || parsed.data.phone
      const prevPhone = normalizePhoneDigits(String(current.phone || "")) || ""
      if (nextPhone !== prevPhone) {
        const verified = await isRecentlyVerified(nextPhone)
        if (!verified) {
          res.status(403).json({
            error: "Verify the new mobile number with an OTP before saving.",
          })
          return
        }
        if (await isPhoneTakenByOtherProfile(db, nextPhone, existingDoc.id)) {
          res.status(409).json({ error: PHONE_ALREADY_EXISTS_MESSAGE })
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
        if (await isEmailTakenByOtherProfile(db, nextEmail, existingDoc.id)) {
          res.status(409).json({
            error: "That email is already linked to another Reloved account. Emails are unique — use a different email, or sign in with that account.",
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

  try {
    const db = getDb()
    const emailFromSession = normalizeEmail(target)
    const phoneFromSession = emailFromSession ? null : normalizePhoneDigits(target) || normalizePhoneDigits(String(target))
    const phoneRaw =
      normalizePhoneDigits(parsed.data.phone) ||
      (parsed.data.phone ? String(parsed.data.phone) : null) ||
      phoneFromSession
    const phone = phoneRaw && PHONE_REGEX.test(phoneRaw) ? phoneRaw : null

    const emailFromBody = normalizeEmail(parsed.data.email)
    // Email/Google login → email from session. Phone login may still send email later.
    if (!emailFromSession && !emailFromBody) {
      // Phone-only session without email on body: allow light onboard (Name/Username/Area).
      if (!phone) {
        res.status(400).json({ error: "Sign in with email or phone first, then complete your profile." })
        return
      }
    }
    const resolvedEmail = emailFromSession ?? emailFromBody ?? null

    // Every account needs a mobile before onboarding completes.
    // Login already verified email or phone — do not require a second OTP here.
    if (!phone) {
      res.status(400).json({
        error: "Add a 10-digit mobile number to finish onboarding.",
      })
      return
    }

    // Prefer existing profile for this email/target; phone login resolves to first account.
    let existingDoc = await findDonorProfileDoc(db, target, phone || undefined)
    const phoneOwner = phone ? await findFirstProfileByPhone(db, phone) : null

    // Second Google email onboarding with a phone already on the first account
    // → land on that first account (link email), do not create a duplicate.
    if (
      emailFromSession &&
      phoneOwner &&
      (!existingDoc || existingDoc.id !== phoneOwner.id)
    ) {
      const ownerEmail = normalizeEmail(phoneOwner.data()?.email) || normalizeEmail(String(phoneOwner.data()?.target || ""))
      if (ownerEmail && ownerEmail !== emailFromSession) {
        await phoneOwner.ref.set(
          {
            linkedEmails: FieldValue.arrayUnion(emailFromSession),
            googleUid: phoneOwner.data()?.googleUid || null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        const sessionTarget = String(phoneOwner.data()?.target || ownerEmail)
        const token = await signSessionToken({ uid: sessionTarget, email: sessionTarget, role: "donor" })
        const fresh = await phoneOwner.ref.get()
        res.json({
          profile: serializeProfile(fresh.id, fresh.data() || {}, sessionTarget),
          token,
          target: sessionTarget,
          mergedIntoExisting: true,
          message: "This number is already on your first Reloved account — you're signed into that one.",
        })
        return
      }
    }

    if (phone && phoneOwner && existingDoc && phoneOwner.id !== existingDoc.id) {
      res.status(409).json({ error: PHONE_ALREADY_EXISTS_MESSAGE })
      return
    }
    if (phone && phoneOwner && !existingDoc) {
      // Phone-only session creating profile while phone already exists → use first account.
      existingDoc = phoneOwner
    }

    const existingData = existingDoc?.data()

    if (resolvedEmail && (await isEmailTakenByOtherProfile(db, resolvedEmail, existingDoc?.id))) {
      res.status(409).json({
        error: "That email is already linked to another Reloved account. Sign in with that account instead.",
      })
      return
    }

    if (phone && !existingDoc && (await isPhoneTakenByOtherProfile(db, phone))) {
      res.status(409).json({ error: PHONE_ALREADY_EXISTS_MESSAGE })
      return
    }

    const data: Record<string, unknown> = {
      target: existingData?.target ?? target,
      name: parsed.data.name,
      username: parsed.data.username,
      phone: phone ?? existingData?.phone ?? null,
      email: resolvedEmail ?? existingData?.email ?? null,
      address: parsed.data.address ?? null,
      addressLabel: parsed.data.addressLabel ?? existingData?.addressLabel ?? null,
      pincode: parsed.data.pincode ?? existingData?.pincode ?? null,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (parsed.data.gender !== undefined) {
      data.gender = parsed.data.gender
    } else if (existingData?.gender == null) {
      data.gender = null
    }

    const linkedEmails = [
      ...(emailFromSession ? [emailFromSession] : []),
      ...(emailFromBody && !emailFromSession ? [emailFromBody] : []),
    ]

    if (!existingDoc) {
      const ref = await db.collection(collections.donorProfiles).add({
        ...data,
        linkedEmails,
        onboardedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      })
      const doc = await ref.get()
      if (data.email) {
        await sendWelcomeEmail(String(data.email), { firstName: String(data.name) }).catch((err) =>
          console.error("Failed to send welcome email:", err)
        )
      }
      res.json({ profile: serializeProfile(doc.id, doc.data() || {}, target) })
    } else {
      await existingDoc.ref.set(
        { ...data, onboardedAt: existingData?.onboardedAt ?? FieldValue.serverTimestamp() },
        { merge: true }
      )
      for (const e of linkedEmails) {
        await existingDoc.ref.set({ linkedEmails: FieldValue.arrayUnion(e) }, { merge: true })
      }
      const doc = await existingDoc.ref.get()
      res.json({ profile: serializeProfile(doc.id, doc.data() || {}, String(doc.data()?.target || target)) })
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
    const keys = await collectDonorMatchKeys(db, target)
    const matched = await fetchOwnedSubmissionDocs(db, keys)

    const submissions = await Promise.all(
      matched.map(async (doc) => {
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
          const claimChunks: QuerySnapshot[] = []
          for (let i = 0; i < itemIds.length; i += 10) {
            claimChunks.push(
              await db
                .collection(collections.itemRequests)
                .where("itemId", "in", itemIds.slice(i, i + 10))
                .limit(30)
                .get()
            )
          }
          for (const claimsSnap of claimChunks) {
            for (const cd of claimsSnap.docs) {
              const cdata = cd.data()
              const prev = claimByItemId[cdata.itemId]
              const rank = (s: string) => (s === "approved" ? 3 : s === "pending" ? 2 : 1)
              if (!prev || rank(String(cdata.status)) > rank(String(prev.status))) {
                const status = String(cdata.status || "")
                const approved = status === "approved"
                const rawAddress = String(cdata.requesterAddress || "").trim()
                claimByItemId[cdata.itemId] = {
                  id: cd.id,
                  status,
                  handoverStage: cdata.handoverStage || null,
                  requesterName: cdata.requesterName || null,
                  requesterAddress: approved
                    ? rawAddress || null
                    : maskClaimerAddressForGiver(String(cdata.giverLogistics || ""), cdata.requesterAddress),
                  requesterPhone: approved ? String(cdata.requesterPhone || "").trim() || null : null,
                  addressSaved: Boolean(rawAddress),
                  deliveryStatus: cdata.deliveryStatus || null,
                  borzoTrackingUrl: cdata.borzoTrackingUrl || null,
                  borzoStatus: cdata.borzoStatus || null,
                  borzoCourier: cdata.borzoCourier || null,
                  giverLogistics: cdata.giverLogistics || null,
                }
              }
            }
          }
        }

        return {
          id: doc.id,
          reference: raw.reference,
          status: raw.status,
          submittedAt,
          locality: raw.locality || raw.pickupLocality || null,
          address: raw.address || raw.addressLabel || null,
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
              locality: d.locality || null,
              claim: claimByItemId[item.id] || null,
              delivery: claimByItemId[item.id] || null,
            }
          }),
        }
      })
    )

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
    const weeklyUsed = await countDonorRequestsThisWeek(target)
    if (weeklyUsed >= DONOR_WEEKLY_REQUEST_LIMIT) {
      const { resetsAt } = weekWindowUtc()
      res.status(429).json({
        error: `Weekly limit reached: you've already sent ${weeklyUsed}/${DONOR_WEEKLY_REQUEST_LIMIT} requests this week. Resets ${new Date(resetsAt).toLocaleDateString()}.`,
        weeklyUsed,
        weeklyLimit: DONOR_WEEKLY_REQUEST_LIMIT,
        monthlyUsed: weeklyUsed,
        monthlyLimit: DONOR_WEEKLY_REQUEST_LIMIT,
        resetsAt,
      })
      return
    }

    const { itemId, requesterName, requesterAddress, note, latitude, longitude } = parsed.data
    let requesterPhone = parsed.data.requesterPhone || ""
    if (!PHONE_REGEX.test(requesterPhone)) {
      const profileDoc = await findDonorProfileDoc(getDb(), target)
      const fromProfile = String(profileDoc?.data()?.phone || "").replace(/\D/g, "").slice(-10)
      if (PHONE_REGEX.test(fromProfile)) requesterPhone = fromProfile
      else if (normalizeEmail(target) || normalizeEmail(String(profileDoc?.data()?.email || ""))) {
        // Email-first account: allow claim without phone; ops coordinate via email.
        requesterPhone = ""
      } else {
        res.status(400).json({ error: "Add a mobile number on your profile, or enter one to claim." })
        return
      }
    }

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
    // Block self-claim across email/phone/target identities (exact target match alone was too weak).
    if (await sessionIsGiver(db, target, itemPreData)) {
      res.status(400).json({ error: "You can't claim an item you gave." })
      return
    }

    // Giver previously declined this claimer — item stays off their Wall and can't be re-requested.
    {
      const viewerKeys = await resolveViewerHideKeys(db, target)
      const declinedItemIds = await loadDeclinedItemIdsForViewer(db, target, viewerKeys)
      if (
        declinedItemIds.has(itemId) ||
        itemHiddenForViewer(itemPreData as { wallHiddenForTargets?: unknown }, viewerKeys)
      ) {
        res.status(403).json({
          error: "This item isn't available for you to request. Browse the Wall for something else.",
        })
        return
      }
    }

    const giver = await resolveGiverContact(db, itemPreData)

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
      res.status(radius.status).json({ error: radius.error, code: radius.code || null })
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
        itemCategory: item.category || null,
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

    await sendClaimAdminAlert(opsAlertRecipients(ADMIN_NOTIFY_EMAIL), {
      requesterName,
      itemTitle: request.itemTitle,
      requesterPhone,
      requestId: requestRef.id,
      itemId,
    }).catch((err) => console.error("Failed to send admin new-claim notification:", err))

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
        title: "Someone would love to Relove your drop! ❤️",
        body: `Your item is being matched — ${request.itemTitle}. Open your gift to Accept or Decline.`,
        href: giftHref,
        itemTitle: String(request.itemTitle || ""),
        requestId: requestRef.id,
      }).catch((err) => console.error("giver claim in-app notify", err))
      await pushUserNotification({
        donorTarget: target,
        role: "claimer",
        type: "claim_sent",
        title: "Your request is in! ❤️",
        body: `We’ll let you know when the dropper responds about ${request.itemTitle}.`,
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
      weeklyUsed: weeklyUsed + 1,
      weeklyLimit: DONOR_WEEKLY_REQUEST_LIMIT,
      monthlyUsed: weeklyUsed + 1,
      monthlyLimit: DONOR_WEEKLY_REQUEST_LIMIT,
      resetsAt: weekWindowUtc().resetsAt,
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
          borzoPaidBy: data.borzoPaidBy || null,
          borzoSubsidyIndex: data.borzoSubsidyIndex || null,
          item: {
            id: data.itemId,
            slug: data.itemSlug,
            title: data.itemTitle,
            images: data.itemImages || [],
          },
        }
      })
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))

    const weeklyUsed = await countDonorRequestsThisWeek(target)
    const { resetsAt } = weekWindowUtc()
    res.json({
      requests,
      weeklyUsed,
      weeklyLimit: DONOR_WEEKLY_REQUEST_LIMIT,
      monthlyUsed: weeklyUsed,
      monthlyLimit: DONOR_WEEKLY_REQUEST_LIMIT,
      resetsAt,
    })
  } catch (err) {
    console.error("item-requests get", err)
    res.status(500).json({ error: "Couldn't load requests" })
  }
})

/** Withdraw / delete own listing (pending, rejected, or approved-on-Wall). */
donorRouter.delete("/submissions/:id", requireRole("donor"), async (req, res) => {
  try {
    const db = getDb()
    const target = req.session!.uid
    const ref = db.collection(collections.donationSubmissions).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Listing not found" })
      return
    }
    const data = snap.data()!
    const keys = await collectDonorMatchKeys(db, target)
    if (!submissionOwnedByDonor(data, keys)) {
      res.status(403).json({ error: "You can only remove your own listing." })
      return
    }
    const status = String(data.status || "")
    if (status === "withdrawn") {
      res.json({ ok: true, id: ref.id, status: "withdrawn" })
      return
    }
    if (!REMOVABLE_SUBMISSION_STATUSES.has(status)) {
      res.status(400).json({ error: "This listing can't be removed in its current state." })
      return
    }

    const reason = String(req.body?.reason || "").trim()

    // Collect linked items (by itemIds + submissionId).
    const itemIds = new Set<string>(
      (Array.isArray(data.itemIds) ? data.itemIds : []).map(String).filter(Boolean)
    )
    const bySub = await db.collection(collections.items).where("submissionId", "==", ref.id).limit(20).get()
    for (const doc of bySub.docs) itemIds.add(doc.id)

    // Once claimed / matched / Reloved, giver cannot remove from email or account.
    for (const itemId of itemIds) {
      const itemSnap = await db.collection(collections.items).doc(itemId).get()
      if (!itemSnap.exists) continue
      const item = itemSnap.data()!
      const ps = String(item.publicStatus || "")
      if (ps === "reloved") {
        res.status(400).json({
          error: "This item is already Reloved (handed over), so it can't be removed.",
        })
        return
      }
      if (ps === "claimed" || ps === "being_matched") {
        res.status(400).json({
          error: "Someone has claimed this item, so it can't be removed. Accept or decline the request instead.",
        })
        return
      }
    }

    // Soft-delete submission + hide linked Wall items.
    await ref.set(
      {
        status: "withdrawn",
        publicVisibility: false,
        ...(reason ? { withdrawReason: reason.slice(0, 500) } : {}),
        withdrawnAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    for (const itemId of itemIds) {
      const itemRef = db.collection(collections.items).doc(itemId)
      const itemSnap = await itemRef.get()
      if (!itemSnap.exists) continue
      const item = itemSnap.data()!
      if (item.publicStatus === "reloved") continue
      await itemRef.set(
        {
          publicVisibility: false,
          publicStatus: "withdrawn",
          status: "withdrawn",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }
    res.json({ ok: true, id: ref.id, status: "withdrawn" })
  } catch (err) {
    console.error("delete submission", err)
    res.status(500).json({ error: "Couldn't remove listing" })
  }
})

/**
 * Claimer owns the request, or giver owns the linked donation item.
 */
async function canAccessClaimForBorzo(
  db: ReturnType<typeof getDb>,
  claimData: Record<string, any>,
  target: string
): Promise<"claimer" | "giver" | null> {
  const profileDoc = await findDonorProfileDoc(db, target)
  const profile = profileDoc?.data()
  const isClaimer =
    claimData.requesterTarget === target ||
    (profile?.email && claimData.requesterTarget === profile.email) ||
    (profile?.phone &&
      claimData.requesterPhone &&
      String(claimData.requesterPhone).replace(/\D/g, "") === String(profile.phone).replace(/\D/g, ""))
  if (isClaimer) return "claimer"

  const itemId = String(claimData.itemId || "")
  if (!itemId) return null
  const itemSnap = await db.collection(collections.items).doc(itemId).get()
  if (!itemSnap.exists) return null
  const submissionId = String(itemSnap.data()?.submissionId || "")
  if (!submissionId) return null
  const subSnap = await db.collection(collections.donationSubmissions).doc(submissionId).get()
  if (!subSnap.exists) return null
  const sub = subSnap.data()!
  if (sub.donorTarget && sub.donorTarget === target) return "giver"
  const email = String(sub.email || "").trim().toLowerCase()
  const profileEmail = String(profile?.email || "").trim().toLowerCase()
  if (email && profileEmail && email === profileEmail) return "giver"
  const phone = String(sub.phone || "").replace(/\D/g, "")
  const profilePhone = String(profile?.phone || "").replace(/\D/g, "")
  if (phone.length >= 10 && profilePhone.length >= 10 && phone === profilePhone) return "giver"
  return null
}

/**
 * Calculates Borzo delivery price for claimer or giver on an approved claim.
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
    const party = await canAccessClaimForBorzo(db, claimData, target)
    if (!party) {
      res.status(403).json({ error: "This isn't your match" })
      return
    }

    const { resolveAddressesForClaim } = await import("./admin")
    const { toPublicArea } = await import("../lib/geo")
    const addrs = await resolveAddressesForClaim(db, claimData)
    if (!addrs.pickupAddress) {
      res.status(400).json({ error: "Donor pickup building/locality could not be found." })
      return
    }
    if (!addrs.dropAddress) {
      res.status(400).json({ error: "Delivery drop address is missing on this request." })
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
      // Never return full pickup/drop strings to claimer or giver (privacy).
      pickupArea: toPublicArea(addrs.pickupAddress),
      dropArea: toPublicArea(addrs.dropAddress),
      addressHidden: true,
      paymentAmount: calculation.paymentAmount,
      deliveryFeeAmount: calculation.deliveryFeeAmount,
      currency: "INR",
      subsidy,
      subsidyCopy: subsidyUserCopy(subsidy),
      paidByPreview: subsidy.nextCoveredByReloved ? "reloved_subsidy" : "receiver",
    })
  } catch (err: any) {
    console.error("donor borzo estimate", err)
    res.status(500).json({ error: err?.message || "Failed to estimate Borzo delivery fee" })
  }
})

/**
 * After giver Accept: claimer books Borzo in 1 click.
 * First 500 rides: Reloved prepaid subsidy. After: receiver reimburses Reloved (still no COD).
 * Server uses stored buildings; full addresses never returned to either party.
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
    const party = await canAccessClaimForBorzo(db, claimData, target)
    if (!party) {
      res.status(403).json({ error: "This isn't your match" })
      return
    }

    // Claimer books by default. Giver may book only as fallback if claimer hasn't.
    const logistics = String(claimData.giverLogistics || "")
    if (logistics === "personal_driver") {
      res.status(400).json({
        error: "This match uses the giver's personal driver — third-party courier booking isn't available.",
      })
      return
    }
    if (logistics === "porter_arranged" && party === "giver") {
      // Allow giver book only when claimer address already saved (ops backup).
      if (!String(claimData.requesterAddress || "").trim()) {
        res.status(400).json({
          error: "Wait for the receiver's building to be saved, or ask them to Book Borzo from their claim page.",
        })
        return
      }
    }

    if (claimData.status !== "approved") {
      res.status(400).json({ error: "Claim must be approved before booking Borzo delivery." })
      return
    }
    if (claimData.borzoOrderId && claimData.borzoStatus !== "canceled") {
      res.status(409).json({
        error: `Borzo order #${claimData.borzoOrderId} already exists for this claim.`,
      })
      return
    }

    const { resolveAddressesForClaim, advanceDeliveryStageAndNotify } = await import("./admin")
    const { toPublicArea } = await import("../lib/geo")
    const addrs = await resolveAddressesForClaim(db, claimData)
    if (!addrs.pickupAddress) {
      res.status(400).json({ error: "Donor pickup building/locality could not be found." })
      return
    }
    if (!addrs.dropAddress) {
      res.status(400).json({ error: "Delivery drop address is missing on this request." })
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
      // Persist for ops/webhook only — never expose on public claimer/giver JSON.
      borzoPickupAddress: addrs.pickupAddress,
      borzoDropAddress: addrs.dropAddress,
      borzoBookedBy: party,
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
    const data = updated.data()!
    res.json({
      ok: true,
      order: {
        orderId: order.orderId,
        orderName: order.orderName,
        status: order.status,
        trackingUrl: order.trackingUrl,
        paymentAmount: order.paymentAmount || order.deliveryFeeAmount || null,
      },
      pickupArea: toPublicArea(addrs.pickupAddress),
      dropArea: toPublicArea(addrs.dropAddress),
      addressHidden: true,
      borzoPaidBy: reserved.paidBy,
      subsidy: reserved.snapshot,
      subsidyCopy: subsidyUserCopy(reserved.snapshot),
      request: {
        id: updated.id,
        status: data.status,
        borzoOrderId: data.borzoOrderId || null,
        borzoOrderName: data.borzoOrderName || null,
        borzoStatus: data.borzoStatus || null,
        borzoTrackingUrl: data.borzoTrackingUrl || null,
        borzoBookedBy: data.borzoBookedBy || null,
        borzoPaidBy: data.borzoPaidBy || null,
        borzoSubsidyIndex: data.borzoSubsidyIndex || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
      },
    })
  } catch (err: any) {
    console.error("donor borzo book", err)
    res.status(500).json({ error: err?.message || "Failed to book Borzo delivery" })
  }
})

/**
 * Claimer (or giver fallback) booked Borzo/Porter themselves in the consumer app.
 * No Reloved API / no Reloved payment — user pays the courier.
 */
donorRouter.post("/item-requests/:id/courier/self-booked", requireRole("donor"), async (req, res) => {
  try {
    const db = getDb()
    const target = req.session!.uid
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    const party = await canAccessClaimForBorzo(db, claimData, target)
    if (!party) {
      res.status(403).json({ error: "This isn't your match" })
      return
    }
    if (claimData.status !== "approved") {
      res.status(400).json({ error: "Claim must be matched (accepted) first." })
      return
    }

    const carrierRaw = String(req.body?.carrier || "borzo").trim().toLowerCase()
    const carrier = carrierRaw === "porter" ? "porter" : "borzo"

    await ref.set(
      {
        courierBookedVia: `${carrier}_self`,
        borzoPaidBy: "receiver",
        borzoStatus: claimData.borzoOrderId ? claimData.borzoStatus : "self_booked",
        deliveryStatus: claimData.deliveryStatus || "rider_dispatched",
        deliveryUpdatedAt: FieldValue.serverTimestamp(),
        borzoBookedBy: party,
        borzoUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    const updated = await ref.get()
    const data = updated.data()!
    res.json({
      ok: true,
      carrier,
      paidBy: "receiver",
      request: {
        id: updated.id,
        status: data.status,
        deliveryStatus: data.deliveryStatus || null,
        courierBookedVia: data.courierBookedVia || null,
        borzoPaidBy: data.borzoPaidBy || null,
        borzoStatus: data.borzoStatus || null,
      },
    })
  } catch (err: any) {
    console.error("courier self-booked", err)
    res.status(500).json({ error: err?.message || "Couldn't save booking" })
  }
})

const threadOpenSchema = z.object({
  subjectType: z.enum(["donation", "claim", "peer", "support"]),
  subjectId: z.string().min(1).optional(),
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
    const { subjectType } = parsed.data
    const subjectId = parsed.data.subjectId || "me"
    const result =
      subjectType === "support"
        ? await getOrCreateSupportThread(db, req.session!.uid)
        : subjectType === "peer"
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
    if (thread.subjectType === "peer" && !peerParty) {
      res.status(403).json({ error: "This isn't your chat" })
      return
    }
    if (thread.subjectType === "peer" && peerChatTextBlocked(parsed.data.text)) {
      res.status(400).json({ error: PEER_CHAT_BLOCK_MESSAGE })
      return
    }
    const senderRole =
      thread.subjectType === "peer"
        ? peerParty === "giver"
          ? "donor"
          : "claimer"
        : thread.subjectType === "support" || thread.subjectType === "donation"
          ? "donor"
          : "claimer"
    const senderName =
      thread.subjectType === "peer"
        ? peerParty === "giver"
          ? "Giver"
          : "Receiver"
        : thread.subjectType === "support"
          ? thread.ownerName || "You"
          : senderRole === "donor"
            ? thread.ownerName || "there"
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
          firstName: "there",
          itemTitle: thread.itemTitle,
          preview: parsed.data.text.slice(0, 140),
          fromReloved: false,
        }).catch((err) => console.error("peer chat notify", err))
      }

      // Resolve gift page for the giver (peer threads only store claim id as subjectId).
      let submissionId = String(thread.submissionId || "")
      if (!submissionId && thread.subjectId) {
        const claimSnap = await db.collection(collections.itemRequests).doc(String(thread.subjectId)).get()
        const itemId = claimSnap.exists ? String(claimSnap.data()?.itemId || "") : ""
        if (itemId) {
          const itemSnap = await db.collection(collections.items).doc(itemId).get()
          submissionId = itemSnap.exists ? String(itemSnap.data()?.submissionId || "") : ""
        }
      }
      const giverHref = submissionId ? `/account/gifts/${submissionId}` : "/account?tab=giving"
      const claimerHref = `/account/claims/${thread.subjectId}`

      await pushUserNotification({
        donorTarget: otherTarget || otherEmail,
        role: peerParty === "giver" ? "claimer" : "giver",
        type: "new_message",
        title: "New handover message",
        body: `${senderName} wrote on ${thread.itemTitle}: "${parsed.data.text.slice(0, 80)}"`,
        // Recipient link (opposite of sender party)
        href: peerParty === "giver" ? claimerHref : giverHref,
        itemTitle: String(thread.itemTitle || ""),
        requestId: String(thread.subjectId || ""),
      }).catch((err) => console.error("peer chat in-app notify", err))
    } else if (thread.subjectType === "support") {
      // Ask Reloved: no canned ack — admin replies in the same popup.
      await sendNewMessageAdminAlert(opsAlertRecipients(ADMIN_NOTIFY_EMAIL), {
        senderName: thread.ownerName || "A visitor",
        itemTitle: "Ask Reloved",
        preview: parsed.data.text.slice(0, 140),
        dashboardUrl: `${process.env.PUBLIC_APP_URL || "https://reloved.digital"}/admin/messages`,
        subjectType: "claim",
        subjectId: String(thread.subjectId || ""),
      }).catch((err) => console.error("Failed to send support-chat admin alert:", err))
    } else {
      const reply = await autoReplyText(db, thread.subjectType, thread.subjectId, parsed.data.quickReplyKey)
      if (reply) {
        await postMessage(db, ref.id, { senderRole: "system", senderName: "Reloved", text: reply })
      } else {
        // Free-text: acknowledge in-thread so the user sees a follow-up, and always email ops.
        await postMessage(db, ref.id, { senderRole: "system", senderName: "Reloved", text: FREE_TEXT_ACK })
      }
      // Always notify ops for Reloved chat (including after canned replies that may still need a human).
      await sendNewMessageAdminAlert(opsAlertRecipients(ADMIN_NOTIFY_EMAIL), {
        senderName: thread.ownerName || "A donor",
        itemTitle: thread.itemTitle,
        preview: parsed.data.text.slice(0, 140),
        dashboardUrl:
          thread.subjectType === "donation"
            ? `${process.env.PUBLIC_APP_URL || "https://reloved.digital"}/admin/donations`
            : `${process.env.PUBLIC_APP_URL || "https://reloved.digital"}/admin/item-requests`,
        subjectType: thread.subjectType === "donation" ? "donation" : "claim",
        subjectId: String(thread.subjectId || ""),
        itemId: thread.itemId ? String(thread.itemId) : undefined,
      }).catch((err) => console.error("Failed to send new-message admin alert:", err))
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
