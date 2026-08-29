import { Router } from "express"
import multer from "multer"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import { isRecentlyVerified } from "../lib/otp.js"
import { signAdminToken } from "../lib/auth.js"
import { requireRole } from "../middleware/session.js"
import { saveImage, imageFileFilter } from "../lib/storage.js"
import { sendClaimConfirmation, sendClaimAdminAlert } from "../lib/notifications.js"
import { donorSessionSchema, donorProfileSchema, itemRequestSchema } from "../../../shared/schemas.js"
import { ITEM_GENDERS } from "../../../shared/taxonomy.js"

export const donorRouter = Router()
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || ""

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 }, fileFilter: imageFileFilter })

function loginEmailFromTarget(target: string): string | null {
  return target.includes("@") ? target.trim().toLowerCase() : null
}

const profilePatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9._]+$/, "Username can only use letters, numbers, . and _")
    .optional(),
  gender: z.enum([...ITEM_GENDERS, "kids"] as [string, ...string[]]).optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number").optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional().nullable(),
  addressLabel: z.enum(["home", "office", "other"]).optional().nullable(),
  pincode: z.string().max(20).optional().nullable(),
})

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
  const target = req.session!.uid
  let profile = await prisma.donorProfile.findUnique({ where: { target } })
  // Persist login email onto the profile when it was never stored at onboarding.
  const loginEmail = loginEmailFromTarget(target)
  if (profile && !profile.email && loginEmail) {
    profile = await prisma.donorProfile.update({
      where: { target },
      data: { email: loginEmail },
    })
  }
  res.json({ profile })
})

donorRouter.post("/profile", requireRole("donor"), async (req, res) => {
  const parsed = donorProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { name, username, gender, phone, address, addressLabel, pincode, latitude, longitude } = parsed.data
  const target = req.session!.uid
  const email = loginEmailFromTarget(target)

  const profile = await prisma.donorProfile.upsert({
    where: { target },
    create: {
      target,
      name,
      username: username.trim(),
      gender,
      phone,
      email,
      address,
      addressLabel,
      pincode,
      latitude,
      longitude,
      onboardedAt: new Date(),
    },
    update: {
      name,
      username: username.trim(),
      gender,
      phone,
      ...(email ? { email } : {}),
      address,
      addressLabel,
      pincode,
      latitude,
      longitude,
      onboardedAt: new Date(),
    },
  })

  res.json({ profile })
})

donorRouter.patch("/profile", requireRole("donor"), async (req, res) => {
  const parsed = profilePatchSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const target = req.session!.uid
  const current = await prisma.donorProfile.findUnique({ where: { target } })
  if (!current) {
    res.status(404).json({ error: "Profile not found. Complete onboarding first." })
    return
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.username !== undefined) data.username = parsed.data.username.replace(/^@/, "")
  if (parsed.data.gender !== undefined) data.gender = parsed.data.gender
  if (parsed.data.address !== undefined) data.address = parsed.data.address
  if (parsed.data.addressLabel !== undefined) data.addressLabel = parsed.data.addressLabel
  if (parsed.data.pincode !== undefined) data.pincode = parsed.data.pincode

  if (parsed.data.phone !== undefined) {
    const nextPhone = parsed.data.phone
    const prevPhone = String(current.phone || "").replace(/\D/g, "")
    if (nextPhone !== prevPhone) {
      const verified = await isRecentlyVerified(nextPhone)
      if (!verified) {
        res.status(403).json({ error: "Verify the new mobile number with an OTP before saving." })
        return
      }
      data.phone = nextPhone
    }
  }

  if (parsed.data.email !== undefined) {
    const nextEmail = (parsed.data.email || "").trim().toLowerCase()
    const prevEmail = String(current.email || "").trim().toLowerCase()
    if (nextEmail && nextEmail !== prevEmail) {
      const verified = await isRecentlyVerified(nextEmail)
      if (!verified) {
        res.status(403).json({ error: "Verify the new email with an OTP before saving." })
        return
      }
      data.email = nextEmail
    } else if (!nextEmail) {
      data.email = null
    }
  }

  const profile = await prisma.donorProfile.update({ where: { target }, data })
  res.json({ profile })
})

// Every submission whose phone OR email matches any identity on file for
// this donor — covers submissions made before the donor ever logged in
// (no separate donor account table to link retroactively), and also a
// donor who logged in via email but dropped an item using only their
// phone (or vice versa): the session target alone isn't enough to find
// it, so this also checks the phone/email saved on their onboarded profile.
donorRouter.get("/submissions", requireRole("donor"), async (req, res) => {
  const target = req.session!.uid

  const profile = await prisma.donorProfile.findUnique({ where: { target } })
  const identities = [target, profile?.phone, profile?.email].filter((v): v is string => Boolean(v))

  const submissions = await prisma.donationSubmission.findMany({
    where: { OR: [{ phone: { in: identities } }, { email: { in: identities } }] },
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

  // Atomically claim: only succeed if the item is still available, then mark
  // being_matched so it leaves hero/browse and cannot be claimed again.
  let request
  let itemTitle = ""
  try {
    request = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findFirst({
        where: { id: itemId, publicVisibility: true, publicStatus: "available" },
      })
      if (!item) {
        throw Object.assign(new Error("UNAVAILABLE"), { code: "UNAVAILABLE" })
      }
      itemTitle = item.title
      const created = await tx.itemRequest.create({
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
      await tx.item.update({
        where: { id: itemId },
        data: { publicStatus: "being_matched" },
      })
      return created
    })
  } catch (err: any) {
    if (err?.code === "UNAVAILABLE" || err?.message === "UNAVAILABLE") {
      res.status(409).json({ error: "This item is no longer available to request." })
      return
    }
    throw err
  }

  // Claim allocation stays operator-in-the-loop by design ("we cannot just
  // have somebody take it automatically") — the admin needs to actually be
  // told a request came in, not discover it by checking the dashboard.
  if (ADMIN_NOTIFY_EMAIL) {
    await sendClaimAdminAlert(ADMIN_NOTIFY_EMAIL, {
      requesterName,
      itemTitle,
      requesterPhone,
    }).catch((err) => console.error("Failed to send admin new-claim notification:", err))
  }

  // Requester-facing confirmation temporarily disabled — admin alert + OTP
  // emails only for now. Re-enable by uncommenting below.
  // const requesterEmail = req.session!.uid
  // if (requesterEmail.includes("@")) {
  //   await sendClaimConfirmation(requesterEmail, { requesterName, itemTitle }).catch((err) =>
  //     console.error("Failed to send claim confirmation email:", err)
  //   )
  // }

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
