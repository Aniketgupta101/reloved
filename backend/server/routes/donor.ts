import { Router } from "express"
import multer from "multer"
import { prisma } from "../lib/prisma.js"
import { isRecentlyVerified } from "../lib/otp.js"
import { signAdminToken } from "../lib/auth.js"
import { requireRole } from "../middleware/session.js"
import { saveImage, imageFileFilter } from "../lib/storage.js"
import { donorSessionSchema, donorProfileSchema, itemRequestSchema } from "../../../shared/schemas.js"

export const donorRouter = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 }, fileFilter: imageFileFilter })

// Passwordless — donor requests/verifies an OTP via the existing
// /api/otp/request + /api/otp/verify endpoints, then exchanges that
// verification for a session here. No separate password to manage.
donorRouter.post("/session", async (req, res) => {
  const parsed = donorSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { target } = parsed.data

  const verified = await isRecentlyVerified(target)
  if (!verified) {
    res.status(403).json({ error: "Verify your phone/email with an OTP first." })
    return
  }

  const token = await signAdminToken({ uid: target, email: target, role: "donor" })
  res.json({ token, target })
})

// One-time onboarding info — name, phone, address, optionally a location the
// browser reported. `onboardedAt` is what tells the frontend whether to show
// the onboarding form or skip straight to the dashboard.
donorRouter.get("/profile", requireRole("donor"), async (req, res) => {
  const profile = await prisma.donorProfile.findUnique({ where: { target: req.session!.uid } })
  res.json({ profile })
})

donorRouter.post("/profile", requireRole("donor"), async (req, res) => {
  const parsed = donorProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { name, phone, address, latitude, longitude } = parsed.data
  const target = req.session!.uid

  const profile = await prisma.donorProfile.upsert({
    where: { target },
    create: { target, name, phone, address, latitude, longitude, onboardedAt: new Date() },
    update: { name, phone, address, latitude, longitude, onboardedAt: new Date() },
  })

  res.json({ profile })
})

// Every submission whose phone OR email matches the session target —
// covers submissions made before the donor ever logged in, since there's
// no separate donor account table to link retroactively.
donorRouter.get("/submissions", requireRole("donor"), async (req, res) => {
  const target = req.session!.uid

  const submissions = await prisma.donationSubmission.findMany({
    where: { OR: [{ phone: target }, { email: target }] },
    include: { items: { include: { images: true } } },
    orderBy: { submittedAt: "desc" },
  })

  res.json({ submissions })
})

// ---- Take an item directly (separate from the partner/allocation system) ----

donorRouter.post("/item-requests", requireRole("donor"), upload.single("photo"), async (req, res) => {
  const parsed = itemRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { itemId, requesterName, requesterPhone, requesterAddress, note } = parsed.data
  const file = req.file as Express.Multer.File | undefined

  const item = await prisma.item.findFirst({
    where: { id: itemId, publicVisibility: true, publicStatus: "available" },
  })
  if (!item) {
    res.status(409).json({ error: "This item is no longer available to request." })
    return
  }

  let photoStoragePath: string | null = null
  if (file) {
    try {
      const saved = await saveImage(file.buffer, "item-requests")
      photoStoragePath = saved.path
    } catch (err) {
      console.error("Invalid photo on item request:", err)
      res.status(400).json({ error: "That file isn't a valid image. Please upload a JPEG, PNG, or WEBP photo." })
      return
    }
  }

  const request = await prisma.itemRequest.create({
    data: {
      itemId,
      requesterTarget: req.session!.uid,
      requesterName,
      requesterPhone,
      requesterAddress,
      note: note || null,
      photoStoragePath,
    },
  })

  // Same pattern as partner self-requests: take it off the wall while pending
  // so nobody else can request the same item in the meantime.
  await prisma.item.update({ where: { id: itemId }, data: { publicStatus: "being_matched" } })

  res.status(201).json({ request })
})

donorRouter.get("/item-requests", requireRole("donor"), async (req, res) => {
  const requests = await prisma.itemRequest.findMany({
    where: { requesterTarget: req.session!.uid },
    include: { item: { include: { images: true } } },
    orderBy: { createdAt: "desc" },
  })
  res.json({ requests })
})
