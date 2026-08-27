import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { z } from "zod"
import { signSessionToken } from "../lib/auth"
import { collections, getDb } from "../lib/firestore"
import { isMultipart, parseMultipart } from "../lib/multipart"
import { uploadImage } from "../lib/storage"
import { requireRole } from "../middleware/session"

export const donorRouter = Router()

const OTP_VERIFIED_WINDOW_MS = 30 * 60 * 1000
const PHONE_REGEX = /^[6-9]\d{9}$/

const donorSessionSchema = z.object({
  channel: z.enum(["sms", "email"]),
  target: z.string().min(3).max(120),
})

const donorProfileSchema = z.object({
  name: z.string().min(1).max(120),
  username: z.string().min(2).max(40),
  gender: z.enum(["men", "women", "unisex", "kids"]),
  phone: z.string().max(40).optional().nullable(),
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
    const snap = await getDb()
      .collection(collections.donorProfiles)
      .where("target", "==", req.session!.uid)
      .limit(1)
      .get()
    const profile = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
    res.json({ profile })
  } catch (err) {
    console.error("donor profile get", err)
    res.status(500).json({ error: "Couldn't load profile" })
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
      res.json({ profile: { id: doc.id, ...doc.data() } })
    } else {
      await existing.docs[0].ref.set(data, { merge: true })
      const doc = await existing.docs[0].ref.get()
      res.json({ profile: { id: doc.id, ...doc.data() } })
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
    const identities = [target, profile?.phone].filter((v): v is string => Boolean(v))

    const snap = await db.collection(collections.donationSubmissions).limit(100).get()
    const matched = snap.docs.filter((d) => {
      const data = d.data()
      return identities.includes(data.phone) || identities.includes(data.email)
    })

    const submissions = []
    for (const doc of matched) {
      const itemsSnap = await db
        .collection(collections.items)
        .where("submissionId", "==", doc.id)
        .limit(20)
        .get()
      const submittedAt = doc.data().submittedAt?.toDate?.()?.toISOString?.() || null
      submissions.push({
        id: doc.id,
        ...doc.data(),
        submittedAt,
        items: itemsSnap.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })),
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
        requesterTarget: req.session!.uid,
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

    res.status(201).json({
      request: {
        id: requestRef.id,
        ...request,
        createdAt: new Date().toISOString(),
      },
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
    const snap = await getDb()
      .collection(collections.itemRequests)
      .where("requesterTarget", "==", req.session!.uid)
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

    res.json({ requests })
  } catch (err) {
    console.error("item-requests get", err)
    res.status(500).json({ error: "Couldn't load requests" })
  }
})
