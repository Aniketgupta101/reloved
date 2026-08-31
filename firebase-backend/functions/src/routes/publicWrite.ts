import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { z } from "zod"
import { collections, getDb } from "../lib/firestore"
import { isMultipart, parseMultipart } from "../lib/multipart"
import {
  sendContactMessageAdminAlert,
  sendDonationAdminAlert,
  sendDonationConfirmation,
  sendPartnerApplicationAdminAlert,
  sendPartnerApplicationConfirmation,
} from "../lib/notifications"
import { analyzePhotosViaLightsail } from "../lib/photoAnalyze"
import { uploadImage } from "../lib/storage"
import { attachSessionIfPresent } from "../middleware/session"

export const publicWriteRouter = Router()
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || ""

const PHONE_REGEX = /^[6-9]\d{9}$/

const contactMessageSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().regex(PHONE_REGEX).optional().or(z.literal("")),
  subject: z.string().max(160).optional().or(z.literal("")),
  message: z.string().min(1).max(3000),
})

const donationSchema = z.object({
  itemTitle: z.string().min(2).max(120),
  category: z.enum(["Clothing", "Footwear", "Bags"]),
  gender: z.enum(["men", "women", "unisex", "kids"]),
  description: z.string().min(5).max(2000),
  condition: z.string().min(1),
  size: z.string().max(60).optional().or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(50),
  brand: z.string().max(80).optional().or(z.literal("")),
  age: z.string().max(80).optional().or(z.literal("")),
  defect: z.string().max(500).optional().or(z.literal("")),
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional().or(z.literal("")),
  phone: z.string().regex(PHONE_REGEX, "Enter a valid 10-digit mobile number starting with 6–9"),
  email: z.string().email().optional().or(z.literal("")),
  contactMethod: z.enum(["WhatsApp", "Phone Call", "Email"]),
  recognitionPreference: z.enum(["name", "anonymous", "alias"]),
  aliasName: z.string().max(60).optional().or(z.literal("")),
  handoverMethod: z.enum(["self", "delivery_partner"]).default("self"),
  pickupLocality: z.string().min(2).max(120),
  dateRange: z.string().max(120).optional().or(z.literal("")),
  timeWindow: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  declaration: z.union([z.literal(true), z.literal("true")]),
  photoStoragePaths: z.string().max(4000).optional().or(z.literal("")),
})

const partnerApplicationSchema = z.object({
  orgName: z.string().min(2).max(160),
  orgType: z.string().min(1),
  registrationStatus: z.string().min(1),
  contactPerson: z.string().min(1).max(120),
  role: z.string().max(120).optional().or(z.literal("")),
  phone: z.string().regex(PHONE_REGEX),
  email: z.string().email(),
  locality: z.string().min(2).max(160),
  beneficiaryGroup: z.string().max(200).optional().or(z.literal("")),
  requiredCategories: z.union([z.array(z.string()), z.string()]),
  approxQuantity: z.string().max(120).optional().or(z.literal("")),
  message: z.string().max(2000).optional().or(z.literal("")),
  consent: z.union([z.literal(true), z.literal("true")]),
})

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
  return `${base || "item"}-${Date.now().toString(36)}`
}

function generateReference() {
  return `RL-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`
}

publicWriteRouter.post("/contact", async (req, res) => {
  const parsed = contactMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    await getDb().collection(collections.contactMessages).add({
      ...parsed.data,
      phone: parsed.data.phone || null,
      subject: parsed.data.subject || "General Inquiry",
      status: "new",
      createdAt: FieldValue.serverTimestamp(),
    })

    if (ADMIN_NOTIFY_EMAIL) {
      await sendContactMessageAdminAlert(ADMIN_NOTIFY_EMAIL, {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        subject: parsed.data.subject || "General Inquiry",
        message: parsed.data.message,
      }).catch((err) => console.error("Failed to send admin contact-message notification:", err))
    }

    res.status(201).json({ ok: true })
  } catch (err) {
    console.error("contact", err)
    res.status(500).json({ error: "Unable to send message. Please try again." })
  }
})

/**
 * Give-flow photo analysis: bg-removal + Gemini via Lightsail relay.
 */
publicWriteRouter.post("/donations/analyze-photos", async (req, res) => {
  try {
    if (!isMultipart(req)) {
      res.status(400).json({ error: "Expected multipart photo upload" })
      return
    }
    const { files } = await parseMultipart(req, { fileSize: 15 * 1024 * 1024, files: 5 })
    const photos = files.filter((f) => f.fieldname === "photos" || f.fieldname === "photo")
    const payload = await analyzePhotosViaLightsail(photos)
    res.json(payload)
  } catch (err: any) {
    console.error("analyze-photos", err)
    res.status(err?.status || 500).json({ error: err?.message || "Photo analysis failed" })
  }
})

publicWriteRouter.post("/donations", attachSessionIfPresent, async (req, res) => {
  try {
    let fields: Record<string, string> = {}
    const uploaded: { buffer: Buffer; mimeType: string }[] = []

    if (isMultipart(req)) {
      const parsedForm = await parseMultipart(req)
      fields = parsedForm.fields
      for (const file of parsedForm.files.filter((f) => f.fieldname === "photos" || f.fieldname === "photo")) {
        uploaded.push({ buffer: file.buffer, mimeType: file.mimeType })
      }
    } else {
      fields = Object.fromEntries(
        Object.entries(req.body || {}).map(([k, v]) => [k, v == null ? "" : String(v)])
      )
    }

    const parsed = donationSchema.safeParse(fields)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    const data = parsed.data
    if (data.recognitionPreference === "alias" && !data.aliasName?.trim()) {
      res.status(400).json({ error: "Alias name is required when recognition is alias." })
      return
    }

    const reference = generateReference()
    const images: { storagePath: string; imageType: string; sortOrder: number }[] = []
    let sortOrder = 0
    const preProcessed: string[] = data.photoStoragePaths ? JSON.parse(data.photoStoragePaths || "[]") : []
    for (const path of preProcessed) {
      images.push({ storagePath: path, imageType: "product", sortOrder: sortOrder++ })
    }
    for (const file of uploaded) {
      try {
        const saved = await uploadImage(file.buffer, "donations", file.mimeType || "image/jpeg")
        images.push({ storagePath: saved.url, imageType: "product", sortOrder: sortOrder++ })
      } catch (err) {
        console.error("donation photo upload", err)
      }
    }

    const donorRecognition =
      data.recognitionPreference === "name"
        ? data.firstName
        : data.recognitionPreference === "alias" && data.aliasName
          ? data.aliasName
          : "Anonymous"

    const donorTarget = req.session?.role === "donor" ? req.session.uid : null

    const db = getDb()
    const submissionRef = await db.collection(collections.donationSubmissions).add({
      reference,
      donorTarget,
      donorFirstName: data.firstName,
      donorLastName: data.lastName || null,
      phone: data.phone,
      email: data.email || null,
      locality: data.pickupLocality,
      preferredContactMethod: data.contactMethod,
      recognitionPreference: data.recognitionPreference,
      handoverMethod: data.handoverMethod,
      dateRange: data.dateRange || null,
      timeWindow: data.timeWindow || null,
      coordinationNotes: data.notes || null,
      status: "pending_review",
      submittedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    })

    await db.collection(collections.items).add({
      submissionId: submissionRef.id,
      slug: slugify(data.itemTitle),
      title: data.itemTitle,
      category: data.category,
      gender: data.gender,
      condition: data.condition,
      size: data.size || null,
      quantity: data.quantity,
      brand: data.brand || null,
      approximateAge: data.age || null,
      defectNotes: data.defect || null,
      description: data.description,
      locality: data.pickupLocality,
      donorRecognition,
      status: "pending_review",
      publicStatus: "available",
      publicVisibility: false,
      images,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Keep profile phone in sync so giving history can match past drops too.
    if (donorTarget) {
      try {
        const profileSnap = await db
          .collection(collections.donorProfiles)
          .where("target", "==", donorTarget)
          .limit(1)
          .get()
        if (!profileSnap.empty) {
          await profileSnap.docs[0].ref.update({
            phone: data.phone,
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      } catch (err) {
        console.warn("donation profile phone sync", err)
      }
    }

    if (ADMIN_NOTIFY_EMAIL) {
      await sendDonationAdminAlert(ADMIN_NOTIFY_EMAIL, {
        donorName: data.firstName,
        itemTitle: data.itemTitle,
        category: data.category,
        locality: data.pickupLocality,
        reference,
      }).catch((err) => console.error("Failed to send admin new-donation notification:", err))
    }

    if (data.email) {
      await sendDonationConfirmation(data.email, {
        firstName: data.firstName,
        itemTitle: data.itemTitle,
        reference,
      }).catch((err) => console.error("Failed to send donation confirmation email:", err))
    }

    res.status(201).json({ reference })
  } catch (err) {
    console.error("donations", err)
    res.status(500).json({ error: "Failed to submit donation. Please try again." })
  }
})

publicWriteRouter.post("/partner-applications", async (req, res) => {
  const body = { ...req.body }
  if (typeof body.requiredCategories === "string") {
    try {
      body.requiredCategories = JSON.parse(body.requiredCategories)
    } catch {
      body.requiredCategories = [body.requiredCategories]
    }
  }
  if (body.consent === "true") body.consent = true

  const parsed = partnerApplicationSchema.safeParse(body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const reference = generateReference()
    const cats = Array.isArray(parsed.data.requiredCategories)
      ? parsed.data.requiredCategories
      : [String(parsed.data.requiredCategories)]
    await getDb().collection(collections.partnerApplications).add({
      ...parsed.data,
      requiredCategories: cats,
      reference,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    })

    await sendPartnerApplicationConfirmation(parsed.data.email, {
      orgName: parsed.data.orgName,
      contactPerson: parsed.data.contactPerson,
      reference,
    }).catch((err) => console.error("Failed to send partner application confirmation email:", err))

    if (ADMIN_NOTIFY_EMAIL) {
      await sendPartnerApplicationAdminAlert(ADMIN_NOTIFY_EMAIL, {
        orgName: parsed.data.orgName,
        contactPerson: parsed.data.contactPerson,
        phone: parsed.data.phone,
        email: parsed.data.email,
        locality: parsed.data.locality,
        reference,
      }).catch((err) => console.error("Failed to send admin new-partner-application notification:", err))
    }

    res.status(201).json({ reference })
  } catch (err) {
    console.error("partner-applications", err)
    res.status(500).json({ error: "Failed to submit application. Please try again." })
  }
})

publicWriteRouter.get("/track/:reference", async (req, res) => {
  try {
    const db = getDb()
    const snap = await db
      .collection(collections.donationSubmissions)
      .where("reference", "==", req.params.reference)
      .limit(1)
      .get()
    if (snap.empty) {
      res.status(404).json({ error: "Submission not found" })
      return
    }
    const doc = snap.docs[0]
    const data = doc.data()
    const toIso = (v: any): string | null => {
      if (!v) return null
      if (typeof v.toDate === "function") return v.toDate().toISOString()
      if (typeof v._seconds === "number") return new Date(v._seconds * 1000).toISOString()
      if (typeof v === "string") return v
      return null
    }
    const itemsSnap = await db
      .collection(collections.items)
      .where("submissionId", "==", doc.id)
      .limit(50)
      .get()
    const submittedAt = toIso(data.submittedAt) || toIso(data.createdAt)
    res.json({
      submission: {
        id: doc.id,
        reference: data.reference,
        status: data.status,
        submitted_at: submittedAt,
        submittedAt,
        createdAt: toIso(data.createdAt),
        items: itemsSnap.docs.map((item) => {
          const d = item.data()
          return {
            id: item.id,
            title: d.title,
            category: d.category,
            status: d.status,
          }
        }),
      },
    })
  } catch (err) {
    console.error("track", err)
    res.status(500).json({ error: "Failed to load submission" })
  }
})
