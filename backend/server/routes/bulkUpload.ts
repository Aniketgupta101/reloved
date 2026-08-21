import { Router } from "express"
import multer from "multer"
import { prisma } from "../lib/prisma.js"
import { removeBackgroundToWhite } from "../lib/bgRemoval.js"
import { suggestItemDetails, CATEGORIES, CONDITIONS } from "../lib/gemini.js"
import { saveImage } from "../lib/storage.js"
import { logAudit } from "../lib/audit.js"
import { slugify } from "../lib/ref.js"
import { bulkUploadCommitSchema } from "../../../shared/schemas.js"

export const bulkUploadRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 20 },
})

// One shared "house" submission every admin-uploaded item attaches to —
// these aren't donor submissions, there's no donor to attribute them to,
// but the schema's items.submission_id FK still needs a parent row.
async function getOrCreateAdminIntakeSubmission(actorEmail: string | null) {
  const reference = "ADMIN-BULK-INTAKE"
  const existing = await prisma.donationSubmission.findUnique({ where: { reference } })
  if (existing) return existing

  return prisma.donationSubmission.create({
    data: {
      reference,
      donorFirstName: "reloved",
      donorLastName: "Admin",
      phone: "0000000000",
      email: actorEmail,
      locality: "Mumbai",
      status: "approved",
      recognitionPreference: "anonymous",
    },
  })
}

// ---- Analyze: process images, get AI suggestions, don't touch the DB yet ----

bulkUploadRouter.post("/analyze", upload.array("photos", 20), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (files.length === 0) {
    res.status(400).json({ error: "No photos uploaded" })
    return
  }

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const whiteBg = await removeBackgroundToWhite(file.buffer, file.mimetype)
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
        console.error(`Bulk upload analysis failed for ${file.originalname}:`, err)
        return { ok: false as const, originalName: file.originalname, error: "Processing failed" }
      }
    })
  )

  res.json({ results, categories: CATEGORIES, conditions: CONDITIONS })
})

// ---- Commit: admin has reviewed/edited suggestions, create the real items ----

bulkUploadRouter.post("/commit", async (req, res) => {
  const parsed = bulkUploadCommitSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { items } = parsed.data

  try {
    const submission = await getOrCreateAdminIntakeSubmission(req.admin!.email)

    const created = await Promise.all(
      items.map((item) =>
        prisma.item.create({
          data: {
            submissionId: submission.id,
            slug: slugify(item.title),
            title: item.title,
            category: item.category,
            description: item.description,
            condition: item.condition,
            brand: item.brand || null,
            size: item.size || null,
            quantity: item.quantity || 1,
            locality: item.locality,
            status: "approved",
            publicStatus: "available",
            publicVisibility: true,
            donorRecognition: "reloved team",
            images: { create: [{ storagePath: item.storagePath, sortOrder: 0 }] },
          },
          include: { images: true },
        })
      )
    )

    await logAudit({
      actorId: req.admin!.uid,
      entityType: "item",
      entityId: "bulk",
      action: "bulk_create",
      newState: { count: created.length, titles: created.map((i) => i.title) },
    })

    res.status(201).json({ items: created })
  } catch (err) {
    console.error("Bulk upload commit failed:", err)
    res.status(500).json({ error: "Failed to save items" })
  }
})
