import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { z } from "zod"
import { collections, getDb } from "../lib/firestore"
import { isMultipart, parseMultipart } from "../lib/multipart"
import { analyzePhotosViaLightsail } from "../lib/photoAnalyze"
import { requireAdmin } from "../middleware/adminAuth"

export const adminRouter = Router()
adminRouter.use(requireAdmin)

function serializeDoc(id: string, data: Record<string, unknown>) {
  const out: Record<string, unknown> = { id, ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === "object" && typeof (v as { toDate?: () => Date }).toDate === "function") {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString()
    }
  }
  return out
}

adminRouter.get("/metrics", async (_req, res) => {
  try {
    const db = getDb()
    const [subs, items, requests, partners, messages] = await Promise.all([
      db.collection(collections.donationSubmissions).limit(500).get(),
      db.collection(collections.items).limit(500).get(),
      db.collection(collections.itemRequests).limit(500).get(),
      db.collection(collections.partnerApplications).limit(500).get(),
      db.collection(collections.contactMessages).limit(500).get(),
    ])

    const pendingSubmissions = subs.docs.filter((d) =>
      ["submitted", "pending_review", "pending"].includes(String(d.data().status || ""))
    ).length
    const approvedInventory = items.docs.filter((d) => d.data().status === "approved").length
    const pendingClaims = requests.docs.filter((d) => d.data().status === "pending").length
    const activePartners = partners.docs.filter((d) => d.data().status === "approved").length

    res.json({
      completedDonations: items.docs.filter((d) => d.data().publicStatus === "reloved").length,
      pendingSubmissions,
      approvedInventory,
      activePartners,
      activeAllocations: 0,
      pendingClaims,
      openMessages: messages.docs.filter((d) => d.data().status === "new").length,
    })
  } catch (err) {
    console.error("admin metrics", err)
    res.status(500).json({ error: "Failed to load metrics" })
  }
})

adminRouter.get("/submissions", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const snap = await getDb().collection(collections.donationSubmissions).limit(200).get()
    const submissions = []
    for (const doc of snap.docs) {
      const data = doc.data()
      if (status && data.status !== status) continue
      const itemsSnap = await getDb()
        .collection(collections.items)
        .where("submissionId", "==", doc.id)
        .limit(20)
        .get()
      submissions.push({
        ...serializeDoc(doc.id, data),
        items: itemsSnap.docs.map((i) => serializeDoc(i.id, i.data())),
      })
    }
    submissions.sort((a: any, b: any) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")))
    res.json({ submissions })
  } catch (err) {
    console.error("admin submissions", err)
    res.status(500).json({ error: "Failed to load submissions" })
  }
})

adminRouter.patch("/submissions/:id", async (req, res) => {
  try {
    const { status, internalNotes } = req.body as { status?: string; internalNotes?: string }
    const ref = getDb().collection(collections.donationSubmissions).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    await ref.set(
      {
        ...(status ? { status } : {}),
        ...(internalNotes !== undefined ? { internalNotes } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    const updated = await ref.get()
    res.json({ submission: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch submission", err)
    res.status(500).json({ error: "Failed to update submission" })
  }
})

adminRouter.get("/items", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const snap = await getDb().collection(collections.items).limit(300).get()
    let items = snap.docs.map((d) => serializeDoc(d.id, d.data()))
    if (status) items = items.filter((i: any) => i.status === status)
    items.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ items })
  } catch (err) {
    console.error("admin items", err)
    res.status(500).json({ error: "Failed to load items" })
  }
})

adminRouter.patch("/items/:id", async (req, res) => {
  try {
    const allowed = [
      "status",
      "publicStatus",
      "publicVisibility",
      "approvedQuantity",
      "rejectionReason",
      "title",
      "description",
      "category",
      "condition",
      "size",
      "quantity",
    ] as const
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key]
    }
    const ref = getDb().collection(collections.items).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    await ref.set(patch, { merge: true })
    const updated = await ref.get()
    res.json({ item: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch item", err)
    res.status(500).json({ error: "Failed to update item" })
  }
})

adminRouter.get("/item-requests", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const snap = await getDb().collection(collections.itemRequests).limit(200).get()
    let requests = snap.docs.map((d) => {
      const data = d.data()
      return {
        ...serializeDoc(d.id, data),
        item: {
          id: data.itemId,
          slug: data.itemSlug,
          title: data.itemTitle,
          images: data.itemImages || [],
        },
      }
    })
    if (status) requests = requests.filter((r: any) => r.status === status)
    requests.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ requests })
  } catch (err) {
    console.error("admin item-requests", err)
    res.status(500).json({ error: "Failed to load item requests" })
  }
})

adminRouter.patch("/item-requests/:id", async (req, res) => {
  try {
    const { status } = req.body as { status: string }
    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "status must be approved or rejected" })
      return
    }
    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const data = before.data()!
    await ref.set(
      {
        status,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    await db
      .collection(collections.items)
      .doc(data.itemId)
      .set(
        {
          publicStatus: status === "approved" ? "reloved" : "available",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    const updated = await ref.get()
    res.json({ request: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch item-request", err)
    res.status(500).json({ error: "Failed to update item request" })
  }
})

adminRouter.get("/contact-messages", async (_req, res) => {
  try {
    const snap = await getDb().collection(collections.contactMessages).limit(200).get()
    const messages = snap.docs
      .map((d) => serializeDoc(d.id, d.data()))
      .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ messages })
  } catch (err) {
    console.error("admin contact-messages", err)
    res.status(500).json({ error: "Failed to load messages" })
  }
})

adminRouter.patch("/contact-messages/:id", async (req, res) => {
  try {
    const { status } = req.body as { status: string }
    const ref = getDb().collection(collections.contactMessages).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    await ref.set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    const updated = await ref.get()
    res.json({ message: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch contact", err)
    res.status(500).json({ error: "Failed to update message" })
  }
})

adminRouter.get("/partner-applications", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const snap = await getDb().collection(collections.partnerApplications).limit(200).get()
    let applications = snap.docs.map((d) => serializeDoc(d.id, d.data()))
    if (status) applications = applications.filter((a: any) => a.status === status)
    applications.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ applications })
  } catch (err) {
    console.error("admin partner-applications", err)
    res.status(500).json({ error: "Failed to load partner applications" })
  }
})

adminRouter.patch("/partner-applications/:id", async (req, res) => {
  try {
    const { status } = req.body as { status: string }
    const ref = getDb().collection(collections.partnerApplications).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    await ref.set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    const updated = await ref.get()
    res.json({ application: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch partner-application", err)
    res.status(500).json({ error: "Failed to update application" })
  }
})

/** Stubs so admin UI tabs that aren't fully ported yet don't 404. */
adminRouter.get("/partners", async (_req, res) => {
  res.json({ partners: [] })
})

adminRouter.get("/allocations", async (_req, res) => {
  res.json({ allocations: [] })
})

adminRouter.get("/partner-needs", async (_req, res) => {
  res.json({ needs: [] })
})

adminRouter.post("/partner-needs", async (_req, res) => {
  res.status(501).json({ error: "Partner needs aren't available on the Firebase backend yet." })
})

adminRouter.post("/allocations", async (_req, res) => {
  res.status(501).json({ error: "Partner allocations aren't available on the Firebase backend yet." })
})

adminRouter.patch("/allocations/:id", async (_req, res) => {
  res.status(501).json({ error: "Partner allocations aren't available on the Firebase backend yet." })
})

adminRouter.patch("/allocation-items/:id", async (_req, res) => {
  res.status(501).json({ error: "Partner allocations aren't available on the Firebase backend yet." })
})

const bulkCommitSchema = z.object({
  items: z
    .array(
      z.object({
        storagePath: z.string().min(1),
        title: z.string().min(2).max(120),
        category: z.enum(["Clothing", "Footwear", "Bags"]),
        gender: z.enum(["men", "women", "unisex", "kids"]).default("unisex"),
        description: z.string().min(1).max(2000),
        condition: z.string().min(1),
        brand: z.string().max(80).optional().nullable(),
        size: z.string().max(60).optional().nullable(),
        quantity: z.coerce.number().int().min(1).max(50).optional(),
        locality: z.string().min(2).max(120),
      })
    )
    .min(1)
    .max(20),
})

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
  return `${base || "item"}-${Date.now().toString(36)}`
}

adminRouter.post("/bulk-upload/analyze", async (req, res) => {
  try {
    if (!isMultipart(req)) {
      res.status(400).json({ error: "Expected multipart photo upload" })
      return
    }
    const { files } = await parseMultipart(req, { fileSize: 15 * 1024 * 1024, files: 20 })
    const photos = files.filter((f) => f.fieldname === "photos" || f.fieldname === "photo")
    const payload = await analyzePhotosViaLightsail(photos)
    res.json(payload)
  } catch (err: any) {
    console.error("bulk-upload analyze", err)
    res.status(err?.status || 500).json({ error: err?.message || "Failed to analyze photos" })
  }
})

adminRouter.post("/bulk-upload/commit", async (req, res) => {
  const parsed = bulkCommitSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  try {
    const db = getDb()
    const created = []
    for (const item of parsed.data.items) {
      const ref = await db.collection(collections.items).add({
        submissionId: null,
        slug: slugify(item.title),
        title: item.title,
        category: item.category,
        gender: item.gender || "unisex",
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
        images: [
          {
            storagePath: item.storagePath,
            imageType: "product",
            sortOrder: 0,
          },
        ],
        source: "admin-bulk-upload",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      const doc = await ref.get()
      created.push({ id: doc.id, ...doc.data() })
    }
    res.status(201).json({ items: created })
  } catch (err) {
    console.error("bulk-upload commit", err)
    res.status(500).json({ error: "Failed to save items" })
  }
})
