import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { z } from "zod"
import { collections, db } from "../lib/firestore"

export const waitlistRouter = Router()

const waitlistSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional().nullable(),
  locality: z.string().max(120).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
})

waitlistRouter.post("/", async (req, res) => {
  try {
    const parsed = waitlistSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid waitlist payload", details: parsed.error.flatten() })
      return
    }

    const ref = await db.collection(collections.waitlistSignups).add({
      ...parsed.data,
      phone: parsed.data.phone ?? null,
      locality: parsed.data.locality ?? null,
      note: parsed.data.note ?? null,
      createdAt: FieldValue.serverTimestamp(),
    })

    res.status(201).json({ ok: true, id: ref.id })
  } catch (err) {
    console.error("POST /waitlist", err)
    res.status(500).json({ error: "Failed to save waitlist signup" })
  }
})
