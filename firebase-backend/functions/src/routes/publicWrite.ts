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
import { PHOTO_ANALYZE_PUBLIC_ERROR, sanitizePublicError } from "../lib/privacyText"
import { uploadImage } from "../lib/storage"
import { attachSessionIfPresent } from "../middleware/session"
import { findDonorProfileDoc } from "../lib/donorIdentity"
import { toPublicArea } from "../lib/geo"

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
  // Accept launch taxonomy + legacy enums; mapped before write.
  category: z.string().min(1).max(40),
  gender: z.string().min(1).max(20),
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
  handoverMethod: z.enum(["self", "delivery_partner", "giver_sends", "porter_arranged"]).optional(),
  giverLogistics: z.enum(["receiver_collects", "giver_sends", "porter_arranged"]).default("receiver_collects"),
  deliveryAddress: z.string().max(300).optional().or(z.literal("")),
  porterPaidBy: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["receiver", "giver"]).optional()
  ),
  pickupLocality: z.string().max(120).optional().or(z.literal("")),
  dateRange: z.string().max(120).optional().or(z.literal("")),
  timeWindow: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  declaration: z.union([z.literal(true), z.literal("true")]),
  photoStoragePaths: z.string().max(4000).optional().or(z.literal("")),
  latitude: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().optional().nullable()),
  longitude: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().optional().nullable()),
})

function mapDonationCategory(raw: string): "Clothing" | "Footwear" | "Bags" {
  const v = (raw || "").trim()
  if (v === "Clothing" || v === "Footwear" || v === "Bags") return v
  if (v === "Kicks") return "Footwear"
  if (v === "Bags") return "Bags"
  return "Clothing"
}

function mapDonationGender(raw: string): "men" | "women" | "unisex" | "kids" {
  const v = (raw || "").toLowerCase().trim()
  if (v === "men" || v === "women" || v === "unisex" || v === "kids") return v
  if (v === "girls" || v === "boys") return "kids"
  return "unisex"
}

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
 * Give-flow photo analysis: Gemini + Storage via analyzePhotosViaLightsail.
 */
publicWriteRouter.post("/donations/analyze-photos", async (req, res) => {
  try {
    if (!isMultipart(req)) {
      res.status(400).json({ error: "Expected multipart photo upload" })
      return
    }
    const { files } = await parseMultipart(req, { fileSize: 15 * 1024 * 1024, files: 12 })
    const photos = files.filter((f) => f.fieldname === "photos" || f.fieldname === "photo")
    const payload = await analyzePhotosViaLightsail(photos)
    res.json(payload)
  } catch (err: any) {
    console.error("analyze-photos", err)
    res.status(err?.status || 500).json({
      error: sanitizePublicError(err, PHOTO_ANALYZE_PUBLIC_ERROR),
    })
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
    if (data.giverLogistics === "receiver_collects") {
      if (!data.pickupLocality?.trim() || data.pickupLocality.trim().length < 2) {
        res.status(400).json({ error: "Pickup address is required." })
        return
      }
      if (!data.dateRange?.trim() || !data.timeWindow?.trim()) {
        res.status(400).json({ error: "Preferred date and time are required." })
        return
      }
    }
    if (data.giverLogistics === "giver_sends") {
      if (!data.pickupLocality?.trim() || data.pickupLocality.trim().length < 2) {
        res.status(400).json({ error: "Your building or landmark is required so we can match receivers within 3 km." })
        return
      }
    }
    if (data.giverLogistics === "porter_arranged") {
      // First 500 Borzo rides: Reloved pays (tracked on book). After: receiver reimburses.
      data.porterPaidBy = "receiver"
      if (!data.pickupLocality?.trim() || data.pickupLocality.trim().length < 2) {
        res.status(400).json({ error: "Pickup building or landmark is required." })
        return
      }
    }

    const handoverMethod =
      data.giverLogistics === "receiver_collects"
        ? "self"
        : data.giverLogistics === "giver_sends"
          ? "giver_sends"
          : "porter_arranged"

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
    // Logged-in givers skip the Donor Details step, so form email is often blank —
    // fall back to profile email / email-login session so confirmation + decision
    // templates actually fire.
    let donorEmail = (data.email || "").trim().toLowerCase() || null
    if (!donorEmail && donorTarget) {
      if (donorTarget.includes("@")) donorEmail = donorTarget.trim().toLowerCase()
      else {
        try {
          const profileDoc = await findDonorProfileDoc(db, donorTarget, data.phone)
          const profileEmail = String(profileDoc?.data()?.email || "")
            .trim()
            .toLowerCase()
          if (profileEmail.includes("@")) donorEmail = profileEmail
        } catch (err) {
          console.warn("donation email profile lookup", err)
        }
      }
    }

    const privatePickup = String(data.pickupLocality || data.deliveryAddress || "").trim() || null
    const publicArea = toPublicArea(privatePickup)

    const submissionRef = await db.collection(collections.donationSubmissions).add({
      reference,
      donorTarget,
      donorFirstName: data.firstName,
      donorLastName: data.lastName || null,
      phone: data.phone,
      email: donorEmail,
      // Private building kept for match / courier; publicArea for wall display.
      locality: privatePickup,
      pickupLocality: privatePickup,
      publicArea,
      preferredContactMethod: data.contactMethod,
      recognitionPreference: data.recognitionPreference,
      handoverMethod,
      giverLogistics: data.giverLogistics,
      deliveryAddress: data.deliveryAddress || null,
      porterPaidBy: data.porterPaidBy || null,
      dateRange: data.dateRange || null,
      timeWindow: data.timeWindow || null,
      coordinationNotes: data.notes || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      status: "approved",
      submittedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    })

    await db.collection(collections.items).add({
      submissionId: submissionRef.id,
      slug: slugify(data.itemTitle),
      title: data.itemTitle,
      category: mapDonationCategory(data.category),
      gender: mapDonationGender(data.gender),
      condition: data.condition,
      size: data.size || null,
      quantity: data.quantity,
      brand: data.brand || null,
      approximateAge: data.age || null,
      defectNotes: data.defect || null,
      description: data.description,
      // Store private pickup separately; public locality is neighbourhood only.
      locality: publicArea,
      pickupLocality: privatePickup,
      publicArea,
      donorRecognition,
      donorTarget,
      giverLogistics: data.giverLogistics,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      // Auto-publish on drop — no admin QC gate before Wall.
      status: "approved",
      publicStatus: "available",
      publicVisibility: true,
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
        locality: data.pickupLocality || data.deliveryAddress || "—",
        reference,
      }).catch((err) => console.error("Failed to send admin new-donation notification:", err))
    }

    if (donorEmail) {
      await sendDonationConfirmation(donorEmail, {
        firstName: data.firstName,
        itemTitle: data.itemTitle,
        reference,
      }).catch((err) => console.error("Failed to send donation confirmation email:", err))
    } else {
      console.warn("donation confirmation skipped — no email on form or profile", {
        reference,
        donorTarget,
        phone: data.phone,
      })
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
