import { Router } from "express"
import { prisma } from "../lib/prisma.js"
import { verifyPassword, signAdminToken } from "../lib/auth.js"
import { requireRole } from "../middleware/session.js"
import { generateReference } from "../lib/ref.js"
import { logAudit } from "../lib/audit.js"
import { partnerLoginSchema, partnerRequestSchema } from "../../../shared/schemas.js"

export const partnerRouter = Router()

const MONTHLY_ITEM_LIMIT = 3

partnerRouter.post("/login", async (req, res) => {
  const parsed = partnerLoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { email, password } = parsed.data

  const partner = await prisma.partner.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (!partner || !partner.active || !partner.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" })
    return
  }

  const valid = await verifyPassword(password, partner.passwordHash)
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" })
    return
  }

  const token = await signAdminToken({ uid: partner.id, email: partner.email, role: "partner" })
  res.json({ token, partner: { id: partner.id, organisationName: partner.organisationName, email: partner.email } })
})

partnerRouter.use(requireRole("partner"))

partnerRouter.get("/me", async (req, res) => {
  const partner = await prisma.partner.findUnique({ where: { id: req.session!.uid } })
  if (!partner) {
    res.status(404).json({ error: "Not found" })
    return
  }
  res.json({ partner })
})

async function monthlyUsage(partnerId: string): Promise<number> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const allocations = await prisma.allocation.findMany({
    where: { partnerId, createdAt: { gte: startOfMonth } },
    include: { items: true },
  })

  return allocations.reduce((sum, alloc) => sum + alloc.items.reduce((s, i) => s + i.allocatedQuantity, 0), 0)
}

// Items an already-verified partner can self-request — approved, public,
// and not already mid-allocation.
partnerRouter.get("/available-items", async (_req, res) => {
  const items = await prisma.item.findMany({
    where: { status: "approved", publicVisibility: true, publicStatus: "available" },
    include: { images: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  res.json({ items })
})

partnerRouter.get("/requests", async (req, res) => {
  const partnerId = req.session!.uid
  const [allocations, used] = await Promise.all([
    prisma.allocation.findMany({
      where: { partnerId },
      include: { items: { include: { item: true } } },
      orderBy: { createdAt: "desc" },
    }),
    monthlyUsage(partnerId),
  ])
  res.json({ allocations, monthlyUsed: used, monthlyLimit: MONTHLY_ITEM_LIMIT })
})

partnerRouter.post("/requests", async (req, res) => {
  const parsed = partnerRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { items } = parsed.data
  const partnerId = req.session!.uid

  const requestedQty = items.reduce((sum, i) => sum + i.quantity, 0)
  const used = await monthlyUsage(partnerId)

  if (used + requestedQty > MONTHLY_ITEM_LIMIT) {
    res.status(429).json({
      error: `Monthly limit reached: ${used}/${MONTHLY_ITEM_LIMIT} items already requested this month. This request (${requestedQty}) would exceed it.`,
    })
    return
  }

  // Confirm every requested item is still actually available before locking it in.
  const dbItems = await prisma.item.findMany({
    where: { id: { in: items.map((i) => i.itemId) }, status: "approved", publicVisibility: true, publicStatus: "available" },
  })
  if (dbItems.length !== items.length) {
    res.status(409).json({ error: "One or more requested items are no longer available." })
    return
  }

  const allocation = await prisma.allocation.create({
    data: {
      reference: generateReference("REQ"),
      partnerId,
      status: "requested",
      createdBy: partnerId,
      items: { create: items.map((i) => ({ itemId: i.itemId, allocatedQuantity: i.quantity })) },
    },
    include: { items: { include: { item: true } } },
  })

  // Mark requested items as being matched so they drop out of the public wall
  // and other partners' available-items list while admin reviews the request.
  await prisma.item.updateMany({
    where: { id: { in: items.map((i) => i.itemId) } },
    data: { publicStatus: "being_matched" },
  })

  await logAudit({
    actorId: partnerId,
    entityType: "allocation",
    entityId: allocation.id,
    action: "partner_self_request",
    newState: allocation,
  })

  res.status(201).json({ allocation })
})
