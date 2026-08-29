import { Router } from "express"
import multer from "multer"
import { randomInt, createHash } from "crypto"
import { prisma } from "../lib/prisma.js"
import { saveImage, compressUpload, imageFileFilter } from "../lib/storage.js"
import { sendOtpEmail, sendOtpSms, sendEmail, sendDonationConfirmation, sendDonationAdminAlert } from "../lib/notifications.js"
import { generateReference, slugify } from "../lib/ref.js"
import { isRecentlyVerified } from "../lib/otp.js"
import { removeBackgroundToWhite } from "../lib/bgRemoval.js"
import { suggestItemDetails, CATEGORIES, CONDITIONS, GENDERS } from "../lib/gemini.js"
import {
  donationSchema,
  partnerApplicationSchema,
  contactMessageSchema,
  waitlistSignupSchema,
  otpRequestSchema,
  otpVerifySchema,
  otpWidgetVerifySchema,
  categoryFilterValues,
  genderFilterValues,
} from "../../../shared/schemas.js"

export const publicRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: imageFileFilter,
})

const REQUIRE_OTP = process.env.REQUIRE_OTP_FOR_DONATIONS === "true"
const OTP_TTL_MINUTES = 10
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || ""

function hashOtp(code: string) {
  return createHash("sha256").update(code).digest("hex")
}

// ---- OTP ----

/** Firebase / other backends with rotating IPs can relay OTP email through Lightsail (Brevo IP allowlist). */
publicRouter.post("/internal/relay-otp-email", async (req, res) => {
  const secret = process.env.EMAIL_RELAY_SECRET
  if (!secret || req.headers["x-relay-secret"] !== secret) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }
  const email = String(req.body?.email || "").trim().toLowerCase()
  const code = String(req.body?.code || "").trim()
  if (!email.includes("@") || !/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "email and 6-digit code required" })
    return
  }
  try {
    await sendOtpEmail(email, code)
    res.json({ ok: true })
  } catch (err) {
    console.error("relay OTP email failed:", err)
    res.status(502).json({ error: "Email send failed" })
  }
})

publicRouter.post("/otp/request", async (req, res) => {
  const parsed = otpRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { channel, target } = parsed.data

  try {
    const recentCount = await prisma.otpCode.count({
      where: { target, channel, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
    })
    if (recentCount >= 3) {
      res.status(429).json({ error: "Too many OTP requests. Try again later." })
      return
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
    await prisma.otpCode.create({
      data: {
        channel,
        target,
        codeHash: hashOtp(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      },
    })

    // A vendor hiccup here (bad key, IP not allowlisted, rate limit) must not
    // take the whole server down — same class of bug that crashed local dev
    // when Brevo's IP allowlist rejected a send with no try/catch around it.
    if (channel === "sms") {
      await sendOtpSms(target, code)
    } else {
      await sendOtpEmail(target, code)
    }

    res.json({ ok: true })
  } catch (err) {
    console.error("Failed to send OTP:", err)
    res.status(502).json({ error: "Couldn't send the code right now. Please try again shortly." })
  }
})

publicRouter.post("/otp/verify", async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { channel, target, code } = parsed.data

  try {
    const record = await prisma.otpCode.findFirst({
      where: { channel, target, verifiedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    })

    if (!record) {
      res.status(400).json({ error: "No pending OTP for this target. Request a new one." })
      return
    }

    if (record.attempts >= 5) {
      res.status(429).json({ error: "Too many incorrect attempts. Request a new code." })
      return
    }

    if (record.codeHash !== hashOtp(code)) {
      await prisma.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } })
      res.status(400).json({ error: "Incorrect code." })
      return
    }

    await prisma.otpCode.update({ where: { id: record.id }, data: { verifiedAt: new Date() } })
    res.json({ ok: true })
  } catch (err) {
    console.error("Failed to verify OTP:", err)
    res.status(500).json({ error: "Something went wrong verifying that code. Please try again." })
  }
})

// MSG91 OTP Widget path — the widget already verified the code client-side
// and handed the frontend a short-lived access token; this confirms that
// token server-side (never trust a client-asserted "I verified it") before
// letting the donor session get issued.
publicRouter.post("/otp/verify-widget", async (req, res) => {
  const parsed = otpWidgetVerifySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { target, accessToken } = parsed.data

  try {
    const verifyRes = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authkey: process.env.MSG91_AUTH_KEY, "access-token": accessToken }),
    })
    const body = (await verifyRes.json().catch(() => ({}))) as { type?: string }
    if (!verifyRes.ok || body?.type !== "success") {
      res.status(400).json({ error: "Incorrect code." })
      return
    }

    // Backfill a verified record so isRecentlyVerified() (donation/donor
    // session gating) works the same regardless of which vendor actually
    // checked the code.
    await prisma.otpCode.create({
      data: {
        channel: "sms",
        target,
        codeHash: hashOtp(accessToken.slice(0, 32)),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
        verifiedAt: new Date(),
      },
    })
    res.json({ ok: true })
  } catch (err) {
    console.error("MSG91 widget token verify failed:", err)
    res.status(500).json({ error: "Something went wrong verifying that code. Please try again." })
  }
})

// ---- Donations ----

// Same AI pipeline as admin bulk-upload (background removal onto white +
// Gemini categorization) — run against a donor's own photos on the Give
// flow, so their submission arrives pre-processed and pre-filled instead of
// needing an admin to redo that work later. Doesn't touch the DB — the
// donor still confirms/edits the suggestion before it's ever submitted.
publicRouter.post("/donations/analyze-photos", upload.array("photos", 12), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (files.length === 0) {
    res.status(400).json({ error: "No photos uploaded" })
    return
  }

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const compressed = await compressUpload(file.buffer)
        const whiteBg = await removeBackgroundToWhite(compressed.buffer, compressed.mimeType)
        const saved = await saveImage(whiteBg, "items")
        const suggestion = await suggestItemDetails(whiteBg)

        return {
          ok: true as const,
          originalName: file.originalname,
          storagePath: saved.path,
          url: saved.url,
          suggestion,
        }
      } catch (err) {
        console.error(`Give-flow photo analysis failed for ${file.originalname}:`, err)
        return { ok: false as const, originalName: file.originalname, error: "Processing failed" }
      }
    })
  )

  res.json({ results, categories: CATEGORIES, conditions: CONDITIONS, genders: GENDERS })
})

publicRouter.post("/donations", upload.array("photos", 12), async (req, res) => {
  const parsed = donationSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const data = parsed.data

  if (REQUIRE_OTP && !(await isRecentlyVerified(data.phone))) {
    res.status(403).json({ error: "Phone number not verified. Complete OTP verification first." })
    return
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? []

  try {
    const reference = generateReference()

    const submission = await prisma.donationSubmission.create({
      data: {
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
        otpVerifiedAt: REQUIRE_OTP ? new Date() : null,
      },
    })

    const item = await prisma.item.create({
      data: {
        submissionId: submission.id,
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
        donorRecognition:
          data.recognitionPreference === "name"
            ? data.firstName
            : data.recognitionPreference === "alias" && data.aliasName
              ? data.aliasName
              : "Anonymous",
      },
    })

    // Photos already run through /donations/analyze-photos arrive as storage
    // paths (already background-removed) — anything left over as a raw
    // `photos` file is one that skipped or failed analysis and gets stored
    // as-is, so a donor is never blocked from submitting by an AI hiccup.
    let sortOrder = 0
    const preProcessedPaths: string[] = data.photoStoragePaths ? JSON.parse(data.photoStoragePaths) : []
    for (const path of preProcessedPaths) {
      await prisma.itemImage.create({
        data: { itemId: item.id, storagePath: path, sortOrder: sortOrder++ },
      })
    }
    for (const file of files) {
      const saved = await saveImage(file.buffer, "items")
      await prisma.itemImage.create({
        data: { itemId: item.id, storagePath: saved.path, sortOrder: sortOrder++ },
      })
    }

    // Donor-facing confirmation temporarily disabled — admin alert + OTP
    // emails only for now. Re-enable by uncommenting below.
    // if (data.email) {
    //   await sendDonationConfirmation(data.email, {
    //     firstName: data.firstName,
    //     itemTitle: data.itemTitle,
    //     reference,
    //   }).catch((err) => console.error("Failed to send donation confirmation email:", err))
    // }

    // Pilot moderation stays operator-in-the-loop (nothing auto-publishes —
    // see Item.publicVisibility default), so the admin needs to actually
    // hear about a new submission rather than having to poll the dashboard.
    if (ADMIN_NOTIFY_EMAIL) {
      await sendDonationAdminAlert(ADMIN_NOTIFY_EMAIL, {
        donorName: data.firstName,
        itemTitle: data.itemTitle,
        category: data.category,
        locality: data.pickupLocality,
        reference,
      }).catch((err) => console.error("Failed to send admin new-submission notification:", err))
    }

    res.status(201).json({ reference, itemId: item.id })
  } catch (err) {
    console.error("Failed to create donation submission:", err)
    res.status(500).json({ error: "Failed to save donation. Please try again." })
  }
})

// ---- Items (Wall of Kindness) ----

publicRouter.get("/items", async (req, res) => {
  const { category, locality, status, gender } = req.query as Record<string, string | undefined>

  // status=available → claimable-only inventory.
  // Default / status=wall → full Wall catalogue (available + matched + reloved stamps).
  // status=reloved → Wall of Love history, etc.
  const wallStatuses = ["available", "being_matched", "claimed", "reloved"] as const
  const statusWhere =
    !status || status === "wall" || status === "catalogue"
      ? { OR: wallStatuses.map((s) => ({ publicStatus: s })) }
      : { publicStatus: status }

  const categoryValues = categoryFilterValues(category || "")
  const genderValues = genderFilterValues(gender || "")

  const items = await prisma.item.findMany({
    where: {
      publicVisibility: true,
      ...(categoryValues ? { category: { in: categoryValues } } : {}),
      ...(locality ? { locality } : {}),
      ...(genderValues ? { gender: { in: genderValues } } : {}),
      ...statusWhere,
    },
    include: { images: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  res.json({ items })
})

publicRouter.get("/items/:slug", async (req, res) => {
  const item = await prisma.item.findFirst({
    where: { slug: req.params.slug, publicVisibility: true },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  })

  if (!item) {
    res.status(404).json({ error: "Item not found" })
    return
  }

  res.json({ item })
})

// ---- Track ----

publicRouter.get("/track/:reference", async (req, res) => {
  const submission = await prisma.donationSubmission.findUnique({
    where: { reference: req.params.reference.toUpperCase() },
    include: { items: true },
  })

  if (!submission) {
    res.status(404).json({ error: "Reference not found" })
    return
  }

  res.json({ submission })
})

// ---- Partner applications ----

publicRouter.post("/partner-applications", async (req, res) => {
  const parsed = partnerApplicationSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const data = parsed.data
  const reference = generateReference("PARTNER")

  try {
    await prisma.partnerApplication.create({
      data: {
        reference,
        organisationName: data.orgName,
        organisationType: data.orgType,
        registrationStatus: data.registrationStatus,
        contactName: data.contactPerson,
        contactRole: data.role || null,
        phone: data.phone,
        email: data.email,
        locality: data.locality,
        beneficiaryProfile: data.beneficiaryGroup || null,
        requiredCategories: data.requiredCategories,
        estimatedQuantities: data.approxQuantity || null,
        message: data.message || null,
      },
    })

    res.status(201).json({ reference })
  } catch (err) {
    console.error("Failed to create partner application:", err)
    res.status(500).json({ error: "Failed to submit application. Please try again." })
  }
})

// ---- Contact ----

publicRouter.post("/contact", async (req, res) => {
  const parsed = contactMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const data = parsed.data

  try {
    await prisma.contactMessage.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        subject: data.subject || "General Inquiry",
        message: data.message,
      },
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error("Failed to save contact message:", err)
    res.status(500).json({ error: "Unable to send message. Please try again." })
  }
})

// ---- Coming-soon waitlist ----

publicRouter.post("/waitlist", async (req, res) => {
  const parsed = waitlistSignupSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and mobile number, and choose donate or claim." })
    return
  }
  const fullName = (parsed.data.fullName || "").trim() || null
  const email = (parsed.data.email || "").trim().toLowerCase() || null
  const phone = (parsed.data.phone || "").trim() || null
  const intent = parsed.data.intent

  try {
    if (email) {
      const existing = await prisma.waitlistSignup.findUnique({ where: { email } })
      if (existing) {
        if (intent && !existing.intent) {
          await prisma.waitlistSignup.update({ where: { id: existing.id }, data: { intent } })
        }
        res.status(200).json({ ok: true, alreadyJoined: true })
        return
      }
    }
    if (phone) {
      const existingPhone = await prisma.waitlistSignup.findUnique({ where: { phone } })
      if (existingPhone) {
        if (intent && !existingPhone.intent) {
          await prisma.waitlistSignup.update({ where: { id: existingPhone.id }, data: { intent } })
        }
        res.status(200).json({ ok: true, alreadyJoined: true })
        return
      }
    }

    await prisma.waitlistSignup.create({
      data: {
        fullName,
        email,
        phone,
        intent,
        source: "coming_soon",
      },
    })

    if (ADMIN_NOTIFY_EMAIL) {
      const who = fullName || email || phone || "Someone"
      const contact = [email, phone].filter(Boolean).join(" / ")
      sendEmail(
        ADMIN_NOTIFY_EMAIL,
        `Waitlist: ${who}${intent ? ` (${intent})` : ""}`,
        `${who} &lt;${contact}&gt; joined the reloved waitlist${intent ? ` — intent: ${intent}` : ""}.`
      ).catch((err) => console.error("Waitlist notify failed:", err))
    }

    res.status(201).json({ ok: true, alreadyJoined: false })
  } catch (err) {
    console.error("Failed to save waitlist signup:", err)
    res.status(500).json({ error: "Unable to join the waitlist. Please try again." })
  }
})
