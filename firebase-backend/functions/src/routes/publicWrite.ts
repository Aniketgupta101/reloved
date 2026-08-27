import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { z } from "zod"
import { collections, getDb } from "../lib/firestore"
import { isMultipart, parseMultipart, type UploadedFile } from "../lib/multipart"
import { uploadImage } from "../lib/storage"

export const publicWriteRouter = Router()

const PHONE_REGEX = /^[6-9]\d{9}$/
const LIGHTSAIL_ANALYZE_URL =
  process.env.PHOTO_ANALYZE_RELAY_URL ||
  "https://3-110-214-193.sslip.io/api/donations/analyze-photos"
const LIGHTSAIL_ORIGIN = process.env.PHOTO_ANALYZE_ORIGIN || "https://3-110-214-193.sslip.io"

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
  phone: z.string().regex(PHONE_REGEX),
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

function absoluteMediaUrl(pathOrUrl: string | undefined | null): string {
  if (!pathOrUrl) return ""
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl
  if (pathOrUrl.startsWith("/")) return `${LIGHTSAIL_ORIGIN}${pathOrUrl}`
  return `${LIGHTSAIL_ORIGIN}/uploads/${pathOrUrl}`
}

/** Build multipart body for Lightsail analyze-photos (Gemini + bg removal). */
function buildPhotosMultipart(files: UploadedFile[]) {
  const boundary = `----RelovedBoundary${Date.now()}`
  const chunks: Buffer[] = []
  for (const file of files) {
    const safeName = (file.filename || "photo.jpg").replace(/"/g, "")
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${safeName}"\r\nContent-Type: ${
          file.mimeType || "image/jpeg"
        }\r\n\r\n`
      )
    )
    chunks.push(file.buffer)
    chunks.push(Buffer.from("\r\n"))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

async function rehostProcessedImage(url: string): Promise<string> {
  try {
    const res = await fetch(url)
    if (!res.ok) return url
    const buf = Buffer.from(await res.arrayBuffer())
    const ctype = res.headers.get("content-type") || "image/png"
    const saved = await uploadImage(buf, "donations", ctype)
    return saved.url
  } catch (err) {
    console.warn("Could not rehost processed photo to Firebase Storage, using Lightsail URL:", err)
    return url
  }
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
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error("contact", err)
    res.status(500).json({ error: "Unable to send message. Please try again." })
  }
})

/**
 * Give-flow photo analysis: bg-removal + Gemini run on Lightsail (native addons
 * aren't practical on Cloud Functions), then we rehost the cutout and return
 * the AI suggestion so the form autofills.
 */
publicWriteRouter.post("/donations/analyze-photos", async (req, res) => {
  try {
    if (!isMultipart(req)) {
      res.status(400).json({ error: "Expected multipart photo upload" })
      return
    }
    const { files } = await parseMultipart(req)
    const photos = files.filter((f) => f.fieldname === "photos" || f.fieldname === "photo")
    if (photos.length === 0) {
      res.status(400).json({ error: "No photos uploaded" })
      return
    }

    const { body, contentType } = buildPhotosMultipart(photos)
    const relayRes = await fetch(LIGHTSAIL_ANALYZE_URL, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    })
    const relayText = await relayRes.text()
    if (!relayRes.ok) {
      console.error("Lightsail analyze-photos failed:", relayRes.status, relayText.slice(0, 400))
      res.status(502).json({
        error: "Couldn't analyze that photo right now. Please fill the details manually and try again.",
      })
      return
    }

    const payload = JSON.parse(relayText) as {
      results?: Array<
        | {
            ok: true
            originalName: string
            storagePath: string
            url?: string
            suggestion: {
              title: string
              category: string
              gender: string
              description: string
              condition: string
              brand: string | null
            }
          }
        | { ok: false; originalName: string; error: string }
      >
      categories?: string[]
      conditions?: string[]
      genders?: string[]
    }

    const results = []
    for (const r of payload.results || []) {
      if (!r.ok) {
        results.push(r)
        continue
      }
      const absolute = absoluteMediaUrl(r.url || r.storagePath)
      const hosted = await rehostProcessedImage(absolute)
      results.push({
        ok: true as const,
        originalName: r.originalName,
        storagePath: hosted,
        url: hosted,
        suggestion: r.suggestion,
      })
    }

    res.json({
      results,
      categories: payload.categories || ["Clothing", "Footwear", "Bags"],
      conditions: payload.conditions || ["Excellent", "Good", "Fair but fully usable"],
      genders: payload.genders || ["men", "women", "unisex", "kids"],
    })
  } catch (err) {
    console.error("analyze-photos", err)
    res.status(500).json({ error: "Photo analysis failed" })
  }
})

publicWriteRouter.post("/donations", async (req, res) => {
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

    const db = getDb()
    const submissionRef = await db.collection(collections.donationSubmissions).add({
      reference,
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
    res.status(201).json({ reference })
  } catch (err) {
    console.error("partner-applications", err)
    res.status(500).json({ error: "Failed to submit application. Please try again." })
  }
})

publicWriteRouter.get("/track/:reference", async (req, res) => {
  try {
    const snap = await getDb()
      .collection(collections.donationSubmissions)
      .where("reference", "==", req.params.reference)
      .limit(1)
      .get()
    if (snap.empty) {
      res.status(404).json({ error: "Submission not found" })
      return
    }
    const doc = snap.docs[0]
    res.json({ submission: { id: doc.id, ...doc.data() } })
  } catch (err) {
    console.error("track", err)
    res.status(500).json({ error: "Failed to load submission" })
  }
})
