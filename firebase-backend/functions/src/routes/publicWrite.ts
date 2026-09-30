import { Router } from "express"
import { FieldValue, type DocumentReference } from "firebase-admin/firestore"
import { z } from "zod"
import { collections, getDb } from "../lib/firestore"
import { isMultipart, parseMultipart } from "../lib/multipart"
import {
  opsAlertRecipients,
  sendContactMessageAdminAlert,
  sendDonationAdminAlert,
  sendDonationConfirmation,
  sendPartnerApplicationAdminAlert,
  sendPartnerApplicationConfirmation,
} from "../lib/notifications"
import { pushUserNotification } from "../lib/userNotifications"
import { analyzePhotosViaLightsail, polishItemImages, type AnalyzeMode } from "../lib/photoAnalyze"
import { PHOTO_ANALYZE_PUBLIC_ERROR, sanitizePublicError } from "../lib/privacyText"
import { uploadImage } from "../lib/storage"
import { attachSessionIfPresent } from "../middleware/session"
import { findDonorProfileDoc } from "../lib/donorIdentity"
import { isRecognisablePublicArea, isUsableLatLng, toPublicArea } from "../lib/geo"
import { ANALYTICS_FUNNEL_EVENTS, bumpAnalyticsDaily } from "../lib/analyticsDaily"

export const publicWriteRouter = Router()
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || ""

/** Client beacon: mirror funnel events into Firestore for admin Analytics (also goes to PostHog/GA). */
publicWriteRouter.post("/analytics/events", async (req, res) => {
  try {
    const event = String(req.body?.event || "").trim()
    if (!ANALYTICS_FUNNEL_EVENTS.has(event)) {
      res.status(400).json({ error: "Unknown event" })
      return
    }
    const flow = req.body?.flow != null ? String(req.body.flow).slice(0, 40) : null
    const host = req.body?.host != null ? String(req.body.host).slice(0, 80) : null
    await bumpAnalyticsDaily(event, 1, { flow, host })
    res.status(204).end()
  } catch (err) {
    console.error("analytics events", err)
    res.status(500).json({ error: "Failed to record event" })
  }
})

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
  description: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && String(v).trim().length >= 5 ? String(v).trim() : "Preloved piece ready for a new home.")),
  condition: z.string().min(1),
  size: z.string().max(60).optional().or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(50),
  brand: z.string().max(80).optional().or(z.literal("")),
  age: z.string().max(80).optional().or(z.literal("")),
  defect: z.string().max(500).optional().or(z.literal("")),
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional().or(z.literal("")),
  phone: z.string().regex(PHONE_REGEX, "Enter a valid 10-digit mobile number starting with 6–9").optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  contactMethod: z.enum(["WhatsApp", "Phone Call", "Email"]),
  recognitionPreference: z.enum(["name", "anonymous", "alias"]),
  aliasName: z.string().max(60).optional().or(z.literal("")),
  handoverMethod: z.enum(["self", "delivery_partner", "giver_sends", "porter_arranged"]).optional(),
  giverLogistics: z.enum(["receiver_collects", "giver_sends", "porter_arranged", "personal_driver"]).default("receiver_collects"),
  deliveryAddress: z.string().max(300).optional().or(z.literal("")),
  porterPaidBy: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["receiver", "giver"]).optional()
  ),
  pickupLocality: z.string().max(500).optional().or(z.literal("")),
  dateRange: z.string().max(120).optional().or(z.literal("")),
  timeWindow: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  declaration: z.union([z.literal(true), z.literal("true")]),
  photoStoragePaths: z.string().max(4000).optional().or(z.literal("")),
  /** Parallel JSON bool[] matching photoStoragePaths — true = studio cutout already done. */
  photoBgRemoved: z.string().max(1000).optional().or(z.literal("")),
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
    const contactRef = await getDb().collection(collections.contactMessages).add({
      ...parsed.data,
      phone: parsed.data.phone || null,
      subject: parsed.data.subject || "General Inquiry",
      status: "new",
      createdAt: FieldValue.serverTimestamp(),
    })

    await sendContactMessageAdminAlert(opsAlertRecipients(ADMIN_NOTIFY_EMAIL), {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      subject: parsed.data.subject || "General Inquiry",
      message: parsed.data.message,
      contactMessageId: contactRef.id,
    }).catch((err) => console.error("Failed to send admin contact-message notification:", err))

    res.status(201).json({ ok: true })
  } catch (err) {
    console.error("contact", err)
    res.status(500).json({ error: "Unable to send message. Please try again." })
  }
})

interface RateLimitRecord {
  timestamps: number[]
}

const photoAnalysisIpBuckets = new Map<string, RateLimitRecord>()

function checkPhotoAnalysisRateLimit(ip: string): boolean {
  const now = Date.now()
  const windowMs = 10 * 60 * 1000 // 10 minutes
  const maxRequests = 25 // 25 calls per 10 minutes per IP

  const record = photoAnalysisIpBuckets.get(ip) || { timestamps: [] }
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs)
  if (record.timestamps.length >= maxRequests) {
    return false
  }
  record.timestamps.push(now)
  photoAnalysisIpBuckets.set(ip, record)

  if (photoAnalysisIpBuckets.size > 2000) {
    for (const [key, val] of photoAnalysisIpBuckets.entries()) {
      val.timestamps = val.timestamps.filter((t) => now - t < windowMs)
      if (val.timestamps.length === 0) photoAnalysisIpBuckets.delete(key)
    }
  }
  return true
}

/**
 * Give-flow photo analysis: mode=catalog (fast titles) | cutout (studio) | full (legacy).
 */
publicWriteRouter.post("/donations/analyze-photos", async (req, res) => {
  try {
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown"
    if (!checkPhotoAnalysisRateLimit(clientIp)) {
      res.status(429).json({
        error: "Too many photo analysis requests. Please wait a few minutes before trying again.",
      })
      return
    }
    if (!isMultipart(req)) {
      res.status(400).json({ error: "Expected multipart photo upload" })
      return
    }
    const rawMode = String(req.query.mode || req.headers["x-analyze-mode"] || "full").toLowerCase()
    const mode: AnalyzeMode =
      rawMode === "catalog" || rawMode === "cutout" || rawMode === "full" || rawMode === "store"
        ? rawMode
        : "full"
    const { files, fields } = await parseMultipart(req, { fileSize: 15 * 1024 * 1024, files: 30 })
    const fieldMode = String(fields.mode || "").toLowerCase()
    const effectiveMode: AnalyzeMode =
      fieldMode === "catalog" ||
      fieldMode === "cutout" ||
      fieldMode === "full" ||
      fieldMode === "store"
        ? fieldMode
        : mode
    const photos = files.filter((f) => f.fieldname === "photos" || f.fieldname === "photo")
    const payload = await analyzePhotosViaLightsail(photos, effectiveMode)
    res.json(payload)
  } catch (err: any) {
    console.error("analyze-photos", err)
    res.status(err?.status || 500).json({
      error: sanitizePublicError(err, PHOTO_ANALYZE_PUBLIC_ERROR),
    })
  }
})

/** Re-run studio cutouts for an item (owner / admin / internal). Use force=true to retry grey originals. */
publicWriteRouter.post("/donations/polish-item-images", attachSessionIfPresent, async (req, res) => {
  try {
    const itemId = String(req.body?.itemId || "").trim()
    const force = Boolean(req.body?.force)
    if (!itemId) {
      res.status(400).json({ error: "itemId required" })
      return
    }
    const db = getDb()
    const ref = db.collection(collections.items).doc(itemId)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item not found" })
      return
    }
    const data = snap.data() || {}
    const donorTarget = req.session?.role === "donor" ? req.session.uid : null
    const isOwner = Boolean(donorTarget && data.donorTarget === donorTarget)
    const polishSecret = String(process.env.RELOVED_POLISH_SECRET || process.env.ADMIN_SESSION_SECRET || "").trim()
    const providedSecret = String(req.headers["x-reloved-polish-secret"] || "").trim()
    // Only treat as internal when a real secret is configured (never match on empty).
    const isInternal = Boolean(polishSecret && providedSecret && providedSecret === polishSecret)
    if (!isOwner && !isInternal && req.session?.role !== "admin") {
      res.status(403).json({ error: "Not allowed" })
      return
    }
    let images = Array.isArray(data.images) ? [...data.images] : []
    const hasModelled = images.some(
      (img: any) => img && (img.imageType === "modelled" || img.bgRemoved === true) && img.storagePath,
    )
    const hasTypedOriginal = images.some(
      (img: any) => img && img.imageType === "original" && img.storagePath,
    )
    const hasRawDonor = images.some(
      (img: any) => img && img.storagePath && img.imageType !== "modelled" && img.bgRemoved !== true,
    )
    const modelledCount = images.filter((img: any) => img && img.imageType === "modelled").length
    const originalCount = images.filter((img: any) => img && img.imageType === "original").length
    const galleryClean =
      modelledCount === 1 &&
      originalCount === images.length - 1 &&
      hasTypedOriginal &&
      images.every((img: any) => img && (img.imageType === "modelled" || img.imageType === "original"))
    const needsPolish = !hasModelled && images.some((img: any) => img && img.storagePath)
    if (
      !force &&
      !needsPolish &&
      galleryClean &&
      data.imageProcessingStatus === "ready" &&
      data.publicVisibility === true
    ) {
      res.json({ ok: true, alreadyReady: true })
      return
    }

    /** Collect true donor upload paths for this item only (never AI / product rows). */
    const recoverDonorOriginalPaths = async (): Promise<string[]> => {
      const fromItem = Array.isArray(data.donorOriginalPaths)
        ? data.donorOriginalPaths.map((p: unknown) => String(p || "").trim()).filter(Boolean)
        : []
      if (fromItem.length > 0) return [...new Set(fromItem)]

      const submissionId = String(data.submissionId || "").trim()
      if (!submissionId) return []
      try {
        const subSnap = await db.collection(collections.donationSubmissions).doc(submissionId).get()
        const sub = subSnap.data() || {}
        if (Array.isArray(sub.donorOriginalPaths) && sub.donorOriginalPaths.length > 0) {
          return [
            ...new Set(
              sub.donorOriginalPaths.map((p: unknown) => String(p || "").trim()).filter(Boolean),
            ),
          ]
        }
        const paths: string[] = []
        const rawPaths = sub.photoStoragePaths
        const rawFlags = sub.photoBgRemoved
        const pathList: string[] = Array.isArray(rawPaths)
          ? rawPaths.map((p: unknown) => String(p || "").trim()).filter(Boolean)
          : []
        const flagList: boolean[] = Array.isArray(rawFlags)
          ? rawFlags.map((f: unknown) => Boolean(f))
          : []
        if (pathList.length > 0) {
          for (let i = 0; i < pathList.length; i++) {
            // Only keep true uploads (bgRemoved=false). Skip AI/modelled entries.
            if (flagList.length > 0 && flagList[i] === true) continue
            paths.push(pathList[i])
          }
          return [...new Set(paths)]
        }
      } catch (err) {
        console.warn("polish-item-images submission lookup failed", itemId, err)
      }
      return []
    }

    // When force or originals are missing, rebuild from authoritative donor paths so
    // leftover product/AI rows cannot inflate the gallery.
    const recovered = await recoverDonorOriginalPaths()
    if (recovered.length > 0 && (force || (!hasTypedOriginal && !hasRawDonor))) {
      const keptAi = images.filter(
        (img: any) => img && img.storagePath && img.imageType === "modelled",
      )
      images = [
        ...keptAi.slice(0, 1),
        ...recovered.map((p, i) => ({
          storagePath: p,
          imageType: "original",
          sortOrder: i + keptAi.slice(0, 1).length,
          bgRemoved: false,
        })),
      ]
      console.info("polish-item-images rebuilt from donor originals", {
        itemId,
        ai: keptAi.slice(0, 1).length,
        originals: recovered.length,
      })
    }

    const polished = await polishItemImages(
      images.map((img: any, i: number) => ({
        storagePath: String(img.storagePath || ""),
        imageType: String(img.imageType || (img.bgRemoved ? "modelled" : "original")),
        sortOrder: typeof img.sortOrder === "number" ? img.sortOrder : i,
        bgRemoved: Boolean(img.bgRemoved),
      })),
      { force },
    )
    // Persist raw donor upload paths (not cutout outputs) for future re-polish.
    const existingDonorPaths = Array.isArray(data.donorOriginalPaths)
      ? data.donorOriginalPaths.map((p: unknown) => String(p || "").trim()).filter(Boolean)
      : []
    const donorOriginalPaths =
      existingDonorPaths.length > 0
        ? [...new Set(existingDonorPaths)]
        : recovered.length > 0
          ? recovered
          : [
              ...new Set(
                images
                  .filter(
                    (img: any) =>
                      img &&
                      img.storagePath &&
                      (img.imageType === "original" ||
                        (img.imageType !== "modelled" && img.bgRemoved !== true)),
                  )
                  .map((img: any) => String(img.storagePath)),
              ),
            ]
    await ref.update({
      images: polished.images,
      // Always leave ready so donor dashboard never sticks on awaiting review.
      imageProcessingStatus: "ready",
      publicVisibility: true,
      missingOriginalImage: polished.missingOriginal,
      donorOriginalPaths,
      updatedAt: FieldValue.serverTimestamp(),
    })
    res.json({
      ok: true,
      allReady: polished.allReady,
      imageCount: polished.images.length,
      cutouts: polished.images.filter((img) => img.bgRemoved === true).length,
      missingOriginal: polished.missingOriginal,
      originalCount: polished.originalCount,
      images: polished.images.map((img) => ({
        imageType: img.imageType,
        bgRemoved: img.bgRemoved,
        storagePath: img.storagePath,
      })),
    })
  } catch (err: any) {
    console.error("polish-item-images", err)
    res.status(500).json({ error: "Failed to polish images" })
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
    const donorTargetEarly = req.session?.role === "donor" ? req.session.uid : null
    const phoneOk = Boolean(data.phone && PHONE_REGEX.test(data.phone))
    const emailOk =
      Boolean(data.email && String(data.email).includes("@")) ||
      Boolean(donorTargetEarly && String(donorTargetEarly).includes("@"))
    if (!phoneOk && !emailOk && !donorTargetEarly) {
      res.status(400).json({ error: "Add a phone or email, or sign in to post." })
      return
    }
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
      if (!data.pickupLocality?.trim() || data.pickupLocality.trim().length < 2) {
        res.status(400).json({ error: "Your building or landmark is required (from your account address)." })
        return
      }
    }

    const handoverMethod =
      data.giverLogistics === "receiver_collects"
        ? "self"
        : data.giverLogistics === "giver_sends"
          ? "giver_sends"
          : data.giverLogistics === "personal_driver"
            ? "personal_driver"
            : "porter_arranged"

    const reference = generateReference()
    const images: {
      storagePath: string
      imageType: string
      sortOrder: number
      bgRemoved?: boolean
    }[] = []
    let sortOrder = 0
    let preProcessedRaw: unknown[] = []
    try {
      preProcessedRaw = data.photoStoragePaths ? JSON.parse(data.photoStoragePaths || "[]") : []
      if (!Array.isArray(preProcessedRaw)) preProcessedRaw = []
    } catch {
      preProcessedRaw = []
    }
    const preProcessed = preProcessedRaw
      .map((p) => String(p || "").trim())
      .filter((p) => p.length > 0)
    let bgFlags: boolean[] = []
    try {
      bgFlags = data.photoBgRemoved ? JSON.parse(data.photoBgRemoved || "[]") : []
    } catch {
      bgFlags = []
    }
    for (let i = 0; i < preProcessed.length; i++) {
      const path = preProcessed[i]
      const removed = Boolean(bgFlags[i])
      images.push({
        storagePath: path,
        imageType: removed ? "modelled" : "original",
        sortOrder: sortOrder++,
        bgRemoved: removed,
      })
    }
    let uploadFailures = 0
    let lastUploadErr = ""
    for (const file of uploaded) {
      if (!file.buffer?.length) {
        uploadFailures++
        lastUploadErr = "empty file buffer"
        console.warn("donation photo empty buffer", { mimeType: file.mimeType })
        continue
      }
      try {
        const saved = await uploadImage(file.buffer, "donations", file.mimeType || "image/jpeg")
        images.push({
          storagePath: saved.url,
          imageType: "original",
          sortOrder: sortOrder++,
          bgRemoved: false,
        })
      } catch (err: any) {
        uploadFailures++
        lastUploadErr = String(err?.message || err || "upload failed")
        console.error("donation photo upload", lastUploadErr, {
          bytes: file.buffer.length,
          mimeType: file.mimeType,
        })
      }
    }
    // Cap to one AI hero — extras belong as originals only if they were uploads.
    const modelledIdx = images.findIndex((img) => img.imageType === "modelled")
    if (modelledIdx >= 0) {
      for (let i = 0; i < images.length; i++) {
        if (i === modelledIdx) continue
        if (images[i].imageType === "modelled") {
          images[i] = { ...images[i], imageType: "original", bgRemoved: false }
        }
      }
    }
    const donorOriginalPaths = [
      ...new Set(
        images
          .filter((img) => img.imageType === "original" && img.storagePath)
          .map((img) => img.storagePath),
      ),
    ]

    // STRICT: every drop must keep donor originals, not AI-only.
    // If the client only sent modelled paths, reject so they re-submit with originals.
    if (donorOriginalPaths.length === 0 && images.some((img) => img.imageType === "modelled")) {
      console.error("donation rejected: AI images without donor originals", {
        preProcessed: preProcessed.length,
        uploaded: uploaded.length,
        imageTypes: images.map((img) => img.imageType),
      })
      res.status(400).json({
        error:
          "Original photos are required. Please go back to Photo, re-add your pictures, and submit again.",
      })
      return
    }

    // Wall API hides items with no photos — never create a "live" drop the user can't see.
    if (images.length === 0) {
      console.error("donation rejected: no images", {
        preProcessed: preProcessed.length,
        uploaded: uploaded.length,
        uploadFailures,
        lastUploadErr,
      })
      res.status(400).json({
        error:
          uploadFailures > 0 || uploaded.length > 0
            ? "Photo couldn’t be saved to storage. Please go back to Photo, re-add the picture, and submit again."
            : "Photo upload failed — your item needs at least one photo to appear on the Wall. Please add a photo and try again.",
      })
      return
    }

    // Go live as soon as photos exist. Studio polish upgrades images in the
    // background — never hide the drop (that made "Awaiting review" / replace bugs).
    // Ready once we have a modelled cutout (original stays bgRemoved=false by design).
    const cutoutRequired = process.env.RELOVED_PHOTO_BG_REMOVE === "1"
    const hasModelled = images.some(
      (img) => img.bgRemoved === true || img.imageType === "modelled",
    )
    const allCutoutsReady = !cutoutRequired || hasModelled
    const imageProcessingStatus = allCutoutsReady ? "ready" : "processing"
    const publicVisibility = true

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
    // Wall / map locality = where this drop actually is (pickup), not the profile
    // home area. Profile is only a fallback when pickup has no recognisable suburb
    // (e.g. bare "Mumbai"). Otherwise Kandivali drops wrongly pin under Andheri/Juhu.
    let profileAddress: string | null = null
    if (donorTarget) {
      try {
        const profileDoc = await findDonorProfileDoc(db, donorTarget, data.phone)
        const profile = profileDoc?.data()
        if (profile) {
          const profileEmail = String(profile.email || "")
            .trim()
            .toLowerCase()
          if (!donorEmail && profileEmail.includes("@")) donorEmail = profileEmail
          const addr = String(profile.address || "").trim()
          if (addr.length >= 2) profileAddress = addr
        }
      } catch (err) {
        console.warn("donation profile lookup", err)
      }
      if (!donorEmail && donorTarget.includes("@")) donorEmail = donorTarget.trim().toLowerCase()
    }

    const privatePickup = String(data.pickupLocality || data.deliveryAddress || "").trim() || null
    const fromProfile = profileAddress ? toPublicArea(profileAddress) : ""
    const fromPickup = privatePickup ? toPublicArea(privatePickup) : ""
    const publicArea = isRecognisablePublicArea(fromPickup)
      ? fromPickup
      : isRecognisablePublicArea(fromProfile)
        ? fromProfile
        : fromPickup || fromProfile || "Mumbai"

    const usableDropCoords = isUsableLatLng(data.latitude, data.longitude)
    const dropLat = usableDropCoords ? (data.latitude as number) : null
    const dropLng = usableDropCoords ? (data.longitude as number) : null

    // Soft idempotency via deterministic doc id (no composite index required).
    const idempotencyKey = String(
      (req.headers["idempotency-key"] as string | undefined) ||
        (typeof fields.idempotencyKey === "string" ? fields.idempotencyKey : "") ||
        (req.body && typeof req.body === "object"
          ? (req.body as { idempotencyKey?: string }).idempotencyKey
          : "") ||
        "",
    )
      .trim()
      .slice(0, 120)

    let idemRef: DocumentReference | null = null
    if (donorTarget && idempotencyKey) {
      const { createHash } = await import("crypto")
      const idemDocId = createHash("sha256")
        .update(`donation|${donorTarget}|${idempotencyKey}`)
        .digest("hex")
        .slice(0, 40)
      idemRef = db.collection("idempotencyKeys").doc(idemDocId)
      const priorIdem = await idemRef.get()
      if (priorIdem.exists) {
        const prior = priorIdem.data() || {}
        res.status(200).json({
          ok: true,
          reference: String(prior.reference || ""),
          submissionId: prior.submissionId || null,
          itemId: prior.itemId || null,
          idempotentReplay: true,
        })
        return
      }
    }

    const submissionRef = await db.collection(collections.donationSubmissions).add({
      reference,
      donorTarget,
      donorFirstName: data.firstName,
      donorLastName: data.lastName || null,
      phone: data.phone && PHONE_REGEX.test(data.phone) ? data.phone : null,
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
      latitude: dropLat,
      longitude: dropLng,
      idempotencyKey: idempotencyKey || null,
      photoStoragePaths: preProcessed,
      photoBgRemoved: bgFlags,
      donorOriginalPaths,
      status: "approved",
      submittedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    })

    const itemRef = await db.collection(collections.items).add({
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
      latitude: dropLat,
      longitude: dropLng,
      // Auto-publish when studio cutouts ready; otherwise owner-only until polish finishes.
      status: "approved",
      publicStatus: "available",
      publicVisibility,
      imageProcessingStatus,
      images,
      donorOriginalPaths,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    if (idemRef) {
      await idemRef
        .set({
          kind: "donation",
          donorTarget,
          idempotencyKey,
          reference,
          submissionId: submissionRef.id,
          itemId: itemRef.id,
          createdAt: FieldValue.serverTimestamp(),
        })
        .catch((err) => console.warn("donation idempotency write", err))
    }

    // Keep profile phone in sync so giving history can match past drops too.
    if (donorTarget && data.phone && PHONE_REGEX.test(data.phone)) {
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

    const dropAlertRecipients = opsAlertRecipients(ADMIN_NOTIFY_EMAIL)
    await sendDonationAdminAlert(dropAlertRecipients, {
      donorName: data.firstName,
      itemTitle: data.itemTitle,
      category: data.category,
      locality: data.pickupLocality || data.deliveryAddress || "—",
      reference,
      submissionId: submissionRef.id,
      itemId: itemRef.id,
      phone: data.phone && PHONE_REGEX.test(data.phone) ? data.phone : null,
      donorEmail,
    }).catch((err) => console.error("Failed to send admin new-donation notification:", err))

    // In-app: show on Notifications tab (profile). Prefer session uid, else email/phone
    // so the note is findable via notificationIdentityKeys after login.
    const notifyTarget =
      donorTarget ||
      donorEmail ||
      (data.phone && PHONE_REGEX.test(data.phone) ? data.phone : null)
    if (notifyTarget) {
      await pushUserNotification({
        donorTarget: notifyTarget,
        alsoTargets: [donorEmail, data.phone && PHONE_REGEX.test(data.phone) ? data.phone : null, donorTarget],
        role: "giver",
        type: "item_dropped",
        title: "Your drop is live",
        body: `${data.itemTitle} is on the Wall of Kindness (ref ${reference}).`,
        href: `/account/gifts/${submissionRef.id}`,
        itemTitle: data.itemTitle,
      }).catch((err) => console.error("drop in-app notify", err))
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

    res.status(201).json({
      reference,
      itemId: itemRef.id,
      imageProcessingStatus,
      publicVisibility,
    })
    void bumpAnalyticsDaily("donation_submitted", 1, { flow: "give" })

    // Kick polish without blocking the client — keep item live even if cutout fails.
    const needsStudioPolish =
      process.env.RELOVED_PHOTO_BG_REMOVE === "1" &&
      !images.some((img) => img.bgRemoved === true || img.imageType === "modelled")
    if (imageProcessingStatus === "processing" || needsStudioPolish) {
      void (async () => {
        try {
          const polished = await polishItemImages(images)
          await itemRef.update({
            images: polished.images,
            // Always leave "ready" so donor dashboard never sticks on awaiting review.
            imageProcessingStatus: "ready",
            publicVisibility: true,
            missingOriginalImage: polished.missingOriginal,
            donorOriginalPaths,
            updatedAt: FieldValue.serverTimestamp(),
          })
        } catch (err) {
          console.error("inline polish after donation failed", itemRef.id, err)
          try {
            await itemRef.update({
              imageProcessingStatus: "ready",
              publicVisibility: true,
              updatedAt: FieldValue.serverTimestamp(),
            })
          } catch (err2) {
            console.error("inline polish fallback visibility", itemRef.id, err2)
          }
        }
      })()
    }
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

    await sendPartnerApplicationAdminAlert(opsAlertRecipients(ADMIN_NOTIFY_EMAIL), {
      orgName: parsed.data.orgName,
      contactPerson: parsed.data.contactPerson,
      phone: parsed.data.phone,
      email: parsed.data.email,
      locality: parsed.data.locality,
      reference,
    }).catch((err) => console.error("Failed to send admin new-partner-application notification:", err))

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
