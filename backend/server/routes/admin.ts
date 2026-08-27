import { Router } from "express"
import multer from "multer"
import { randomBytes } from "crypto"
import { prisma } from "../lib/prisma.js"
import { requireAdmin } from "../middleware/adminAuth.js"
import { logAudit } from "../lib/audit.js"
import { saveImage, imageFileFilter } from "../lib/storage.js"
import { sendEmail } from "../lib/notifications.js"
import { generateReference } from "../lib/ref.js"
import { hashPassword } from "../lib/auth.js"
import { bulkUploadRouter } from "./bulkUpload.js"

export const adminRouter = Router()
adminRouter.use(requireAdmin)
adminRouter.use("/bulk-upload", bulkUploadRouter)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 5 }, fileFilter: imageFileFilter })

// ---- Metrics ----

adminRouter.get("/metrics", async (_req, res) => {
  const [completedDonations, pendingSubmissions, approvedInventory, activePartners, activeAllocations] =
    await Promise.all([
      prisma.allocationItem.count({ where: { completedQuantity: { gt: 0 } } }),
      prisma.donationSubmission.count({ where: { status: "submitted" } }),
      prisma.item.count({ where: { status: "approved" } }),
      prisma.partner.count({ where: { active: true } }),
      prisma.allocation.count({ where: { status: { in: ["confirmed", "in_progress"] } } }),
    ])

  res.json({ completedDonations, pendingSubmissions, approvedInventory, activePartners, activeAllocations })
})

// ---- Submissions ----

adminRouter.get("/submissions", async (req, res) => {
  const { status } = req.query as Record<string, string | undefined>
  const submissions = await prisma.donationSubmission.findMany({
    where: status ? { status } : {},
    include: { items: { include: { images: true } } },
    orderBy: { submittedAt: "desc" },
  })
  res.json({ submissions })
})

adminRouter.patch("/submissions/:id", async (req, res) => {
  const { status, internalNotes } = req.body as { status?: string; internalNotes?: string }
  const before = await prisma.donationSubmission.findUnique({ where: { id: req.params.id } })
  if (!before) { res.status(404).json({ error: "Not found" }); return }

  const updated = await prisma.donationSubmission.update({
    where: { id: req.params.id },
    data: { ...(status ? { status } : {}), ...(internalNotes !== undefined ? { internalNotes } : {}) },
  })

  await logAudit({
    actorId: req.admin!.uid, entityType: "donation_submission", entityId: updated.id,
    action: "update", previousState: before, newState: updated,
  })

  res.json({ submission: updated })
})

// ---- Items ----

adminRouter.get("/items", async (req, res) => {
  const { status } = req.query as Record<string, string | undefined>
  const items = await prisma.item.findMany({
    where: status ? { status } : {},
    include: { images: true, submission: true },
    orderBy: { createdAt: "desc" },
  })
  res.json({ items })
})

adminRouter.patch("/items/:id", async (req, res) => {
  const allowed = [
    "status", "publicStatus", "publicVisibility", "approvedQuantity", "rejectionReason",
    "title", "description", "category", "condition", "size", "quantity",
  ] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) if (key in req.body) patch[key] = req.body[key]

  const before = await prisma.item.findUnique({ where: { id: req.params.id } })
  if (!before) { res.status(404).json({ error: "Not found" }); return }

  const updated = await prisma.item.update({ where: { id: req.params.id }, data: patch })

  await logAudit({
    actorId: req.admin!.uid, entityType: "item", entityId: updated.id,
    action: "update", previousState: before, newState: updated,
  })

  res.json({ item: updated })
})

// ---- Partner applications ----

adminRouter.get("/partner-applications", async (req, res) => {
  const { status } = req.query as Record<string, string | undefined>
  const applications = await prisma.partnerApplication.findMany({
    where: status ? { status } : {},
    include: { partner: true },
    orderBy: { createdAt: "desc" },
  })
  res.json({ applications })
})

adminRouter.patch("/partner-applications/:id", async (req, res) => {
  const { status, verificationNotes } = req.body as { status?: string; verificationNotes?: string }
  const before = await prisma.partnerApplication.findUnique({ where: { id: req.params.id } })
  if (!before) { res.status(404).json({ error: "Not found" }); return }

  const updated = await prisma.partnerApplication.update({
    where: { id: req.params.id },
    data: { ...(status ? { status } : {}), ...(verificationNotes !== undefined ? { verificationNotes } : {}) },
  })

  let createdPartner = null
  if (status === "approved") {
    const existing = await prisma.partner.findUnique({ where: { applicationId: updated.id } })
    // Only mint a portal password for a genuinely new partner — re-approving
    // an already-onboarded partner shouldn't silently reset their login.
    const tempPassword = existing ? null : randomBytes(9).toString("base64url")

    createdPartner = await prisma.partner.upsert({
      where: { applicationId: updated.id },
      create: {
        applicationId: updated.id,
        organisationName: updated.organisationName,
        organisationType: updated.organisationType,
        primaryContact: updated.contactName,
        phone: updated.phone,
        email: updated.email,
        locality: updated.locality,
        passwordHash: tempPassword ? await hashPassword(tempPassword) : null,
      },
      update: {},
    })

    const emailBody = tempPassword
      ? `${updated.organisationName} is now a verified reloved distribution partner. You can now log in to request items at our partner portal.\n\nEmail: ${updated.email}\nTemporary password: ${tempPassword}\n\nPlease keep this safe — there's no self-service password reset yet, contact us if you need it changed.`
      : `${updated.organisationName} is now a verified reloved distribution partner. Your existing portal login still works.`

    await sendEmail(updated.email, "Your reloved partner application was approved", emailBody)
      .catch((err) => console.error("Failed to send partner approval email:", err))
  }

  await logAudit({
    actorId: req.admin!.uid, entityType: "partner_application", entityId: updated.id,
    action: "update", previousState: before, newState: updated,
  })

  res.json({ application: updated, partner: createdPartner })
})

// ---- Partners ----

adminRouter.get("/partners", async (_req, res) => {
  const partners = await prisma.partner.findMany({ include: { needs: true }, orderBy: { createdAt: "desc" } })
  res.json({ partners })
})

adminRouter.patch("/partners/:id", async (req, res) => {
  const allowed = ["organisationName", "primaryContact", "phone", "email", "locality", "verificationStatus", "publicVisibility", "active"] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) if (key in req.body) patch[key] = req.body[key]

  const updated = await prisma.partner.update({ where: { id: req.params.id }, data: patch })
  await logAudit({ actorId: req.admin!.uid, entityType: "partner", entityId: updated.id, action: "update", newState: updated })
  res.json({ partner: updated })
})

// ---- Partner needs ----

adminRouter.get("/partner-needs", async (req, res) => {
  const { partnerId } = req.query as Record<string, string | undefined>
  const needs = await prisma.partnerNeed.findMany({
    where: partnerId ? { partnerId } : {},
    include: { partner: true },
    orderBy: { createdAt: "desc" },
  })
  res.json({ needs })
})

adminRouter.post("/partner-needs", async (req, res) => {
  const { partnerId, category, itemType, quantityRequired, size, ageGroup, urgency, notes } = req.body
  const need = await prisma.partnerNeed.create({
    data: { partnerId, category, itemType, quantityRequired: Number(quantityRequired), size, ageGroup, urgency, notes },
  })
  await logAudit({ actorId: req.admin!.uid, entityType: "partner_need", entityId: need.id, action: "create", newState: need })
  res.status(201).json({ need })
})

adminRouter.patch("/partner-needs/:id", async (req, res) => {
  const allowed = ["quantityRequired", "quantityFulfilled", "status", "notes", "urgency"] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) if (key in req.body) patch[key] = req.body[key]

  const updated = await prisma.partnerNeed.update({ where: { id: req.params.id }, data: patch })
  await logAudit({ actorId: req.admin!.uid, entityType: "partner_need", entityId: updated.id, action: "update", newState: updated })
  res.json({ need: updated })
})

// ---- Allocations (item <-> partner matching) ----

adminRouter.get("/allocations", async (req, res) => {
  const { status } = req.query as Record<string, string | undefined>
  const allocations = await prisma.allocation.findMany({
    where: status ? { status } : {},
    include: { partner: true, items: { include: { item: true } } },
    orderBy: { createdAt: "desc" },
  })
  res.json({ allocations })
})

adminRouter.post("/allocations", async (req, res) => {
  const { partnerId, items } = req.body as { partnerId: string; items: { itemId: string; quantity: number }[] }
  if (!partnerId || !items?.length) { res.status(400).json({ error: "partnerId and items are required" }); return }

  const allocation = await prisma.allocation.create({
    data: {
      reference: generateReference("ALLOC"),
      partnerId,
      createdBy: req.admin!.uid,
      status: "proposed",
      items: { create: items.map((i) => ({ itemId: i.itemId, allocatedQuantity: i.quantity })) },
    },
    include: { items: true },
  })

  await logAudit({ actorId: req.admin!.uid, entityType: "allocation", entityId: allocation.id, action: "create", newState: allocation })
  res.status(201).json({ allocation })
})

adminRouter.patch("/allocations/:id", async (req, res) => {
  const allowed = ["status", "operationalNotes", "confirmedAt", "completedAt"] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) if (key in req.body) patch[key] = req.body[key]

  const updated = await prisma.allocation.update({ where: { id: req.params.id }, data: patch })
  await logAudit({ actorId: req.admin!.uid, entityType: "allocation", entityId: updated.id, action: "update", newState: updated })
  res.json({ allocation: updated })
})

adminRouter.patch("/allocation-items/:id", async (req, res) => {
  const { completedQuantity } = req.body as { completedQuantity: number }
  const allocationItem = await prisma.allocationItem.update({
    where: { id: req.params.id },
    data: { completedQuantity },
    include: { item: true },
  })

  // If the whole allocated quantity for this item is done, mark it reloved on the public Wall of Love.
  if (allocationItem.completedQuantity >= allocationItem.allocatedQuantity) {
    await prisma.item.update({ where: { id: allocationItem.itemId }, data: { publicStatus: "reloved" } })
  }

  await logAudit({ actorId: req.admin!.uid, entityType: "allocation_item", entityId: allocationItem.id, action: "update", newState: allocationItem })
  res.json({ allocationItem })
})

// ---- Item requests (individual "take this item directly" — separate from partner allocations) ----

adminRouter.get("/item-requests", async (req, res) => {
  const { status } = req.query as Record<string, string | undefined>
  const requests = await prisma.itemRequest.findMany({
    where: status ? { status } : {},
    include: { item: { include: { images: true } } },
    orderBy: { createdAt: "desc" },
  })
  res.json({ requests })
})

adminRouter.patch("/item-requests/:id", async (req, res) => {
  const { status } = req.body as { status: string }
  if (!["approved", "rejected"].includes(status)) { res.status(400).json({ error: "status must be approved or rejected" }); return }

  const before = await prisma.itemRequest.findUnique({ where: { id: req.params.id } })
  if (!before) { res.status(404).json({ error: "Not found" }); return }

  const updated = await prisma.itemRequest.update({
    where: { id: req.params.id },
    data: { status, reviewedAt: new Date() },
  })

  // Approving hands the item to this requester (marks it reloved, off the wall for good).
  // Rejecting releases it back onto the wall so someone else can request/be matched with it.
  const item = await prisma.item.update({
    where: { id: before.itemId },
    data: { publicStatus: status === "approved" ? "reloved" : "available" },
  })

  // "We cannot just have somebody take it automatically" cuts both ways —
  // the requester shouldn't be left checking their dashboard to find out
  // either. requesterTarget is a donor session id, which can be a phone
  // number (SMS login) — only email it when it actually looks like one.
  if (before.requesterTarget.includes("@")) {
    const message =
      status === "approved"
        ? `Great news — your request to claim "${item.title}" was approved. Our team will be in touch to coordinate handover.`
        : `Your request to claim "${item.title}" wasn't approved this time. Keep browsing the Wall of Kindness for other items.`
    await sendEmail(before.requesterTarget, `Your claim request — ${item.title}`, message)
      .catch((err) => console.error("Failed to send claim status email:", err))
  }

  await logAudit({
    actorId: req.admin!.uid, entityType: "item_request", entityId: updated.id,
    action: "update", previousState: before, newState: updated,
  })

  res.json({ request: updated })
})

// ---- Evidence ----

adminRouter.post("/evidence", upload.single("photo"), async (req, res) => {
  const { allocationId, evidenceType, minorInvolved, guardianOrInstitutionConsent, completionNote } = req.body
  const file = req.file as Express.Multer.File | undefined
  if (!file) { res.status(400).json({ error: "A photo is required" }); return }

  let saved: Awaited<ReturnType<typeof saveImage>>
  try {
    saved = await saveImage(file.buffer, "evidence")
  } catch (err) {
    console.error("Invalid evidence photo:", err)
    res.status(400).json({ error: "That file isn't a valid image. Please upload a JPEG, PNG, or WEBP photo." })
    return
  }

  const isMinorInvolved = minorInvolved === "true" || minorInvolved === true
  const hasConsent = guardianOrInstitutionConsent === "true" || guardianOrInstitutionConsent === true

  // Safeguarding rule: evidence involving minors can never be public without guardian/institution consent.
  const publicVisibility = isMinorInvolved ? hasConsent : true

  const record = await prisma.evidenceRecord.create({
    data: {
      allocationId,
      storagePath: saved.path,
      evidenceType: evidenceType || "completion",
      consentStatus: hasConsent ? "given" : "pending",
      publicVisibility,
      minorInvolved: isMinorInvolved,
      guardianOrInstitutionConsent: hasConsent,
      completionNote: completionNote || null,
      capturedAt: new Date(),
    },
  })

  await logAudit({ actorId: req.admin!.uid, entityType: "evidence_record", entityId: record.id, action: "create", newState: record })
  res.status(201).json({ evidence: record })
})

// ---- Contact messages ----

adminRouter.get("/contact-messages", async (req, res) => {
  const { status } = req.query as Record<string, string | undefined>
  const messages = await prisma.contactMessage.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
  })
  res.json({ messages })
})

adminRouter.patch("/contact-messages/:id", async (req, res) => {
  const { status } = req.body as { status: string }
  const updated = await prisma.contactMessage.update({ where: { id: req.params.id }, data: { status } })
  await logAudit({ actorId: req.admin!.uid, entityType: "contact_message", entityId: updated.id, action: "update", newState: updated })
  res.json({ message: updated })
})

// ---- Waitlist ----

adminRouter.get("/waitlist", async (_req, res) => {
  const signups = await prisma.waitlistSignup.findMany({
    orderBy: { createdAt: "desc" },
  })
  res.json({ signups, count: signups.length })
})

// ---- Audit log ----

adminRouter.get("/audit-events", async (_req, res) => {
  const events = await prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 200 })
  res.json({ events })
})
