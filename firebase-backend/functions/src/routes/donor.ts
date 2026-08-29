import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { z } from "zod"
import { signSessionToken } from "../lib/auth"
import { collections, getDb } from "../lib/firestore"
import { isMultipart, parseMultipart } from "../lib/multipart"
import { sendClaimAdminAlert } from "../lib/notifications"
import { uploadImage } from "../lib/storage"
import { requireRole } from "../middleware/session"

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
    onboardedAt: toIso(data.onboardedAt),
    updatedAt: toIso(data.updatedAt),
  }
}

const donorSessionSchema = z.object({
  channel: z.enum(["sms", "email"]),
  target: z.string().min(3).max(120),
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
  requesterAddress: z.string().min(1).max(300),
  note: z.string().max(1000).optional().or(z.literal("")),
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

donorRouter.get("/profile", requireRole("donor"), async (req, res) => {
  try {
    const sessionUid = req.session!.uid
    const snap = await getDb()
      .collection(collections.donorProfiles)
      .where("target", "==", sessionUid)
      .limit(1)
      .get()
    if (snap.empty) {
      res.json({ profile: null })
      return
    }
    const doc = snap.docs[0]
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
    const existing = await db.collection(collections.donorProfiles).where("target", "==", target).limit(1).get()
    if (existing.empty) {
      res.status(404).json({ error: "Profile not found. Complete onboarding first." })
      return
    }

    const ref = existing.docs[0].ref
    const current = existing.docs[0].data()
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
  const data = {
    target,
    ...parsed.data,
    phone: parsed.data.phone ?? null,
    email: target.includes("@") ? target.trim().toLowerCase() : null,
    address: parsed.data.address ?? null,
    addressLabel: parsed.data.addressLabel ?? null,
    pincode: parsed.data.pincode ?? null,
    latitude: parsed.data.latitude ?? null,
    longitude: parsed.data.longitude ?? null,
    onboardedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  try {
    const db = getDb()
    const existing = await db
      .collection(collections.donorProfiles)
      .where("target", "==", target)
      .limit(1)
      .get()

    if (existing.empty) {
      const ref = await db.collection(collections.donorProfiles).add({
        ...data,
        createdAt: FieldValue.serverTimestamp(),
      })
      const doc = await ref.get()
      res.json({ profile: serializeProfile(doc.id, doc.data() || {}, target) })
    } else {
      await existing.docs[0].ref.set(data, { merge: true })
      const doc = await existing.docs[0].ref.get()
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

    const { itemId, requesterName, requesterPhone, requesterAddress, note } = parsed.data

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
        requesterAddress,
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

    // Requester-facing confirmation temporarily disabled — admin alert + OTP
    // emails only for now. Re-enable via sendClaimConfirmation (lib/notifications.ts).

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
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
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
