import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { z } from "zod"
import { collections, getDb } from "../lib/firestore"
import { sendWaitlistWelcomeEmail } from "../lib/notifications"

function waitlistFirstName(fullName: string, email: string): string {
  const fromName = fullName.trim().split(/\s+/).filter(Boolean)[0]
  if (fromName) return fromName
  const local = email.split("@")[0]?.trim()
  return local || "there"
}

async function sendWaitlistWelcomeSafe(
  email: string,
  fullName: string,
  intent: "donate" | "claim"
): Promise<boolean> {
  try {
    await sendWaitlistWelcomeEmail(email, { firstName: waitlistFirstName(fullName, email), intent })
    return true
  } catch (err) {
    console.error("waitlist welcome email failed", err)
    return false
  }
}

export const waitlistRouter = Router()

const PHONE_REGEX = /^[6-9]\d{9}$/

/** Matches the coming-soon form on reloved.digital: email + 10-digit mobile, name optional, donate/claim. */
const waitlistSchema = z.object({
  fullName: z.string().max(120).trim().optional().or(z.literal("")),
  name: z.string().max(120).trim().optional().or(z.literal("")),
  email: z.string().email().max(160).trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, "").slice(-10))
    .refine((v) => PHONE_REGEX.test(v), "Enter a valid 10-digit mobile number"),
  intent: z.enum(["donate", "claim"]),
})

waitlistRouter.post("/", async (req, res) => {
  try {
    const parsed = waitlistSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid waitlist payload", details: parsed.error.flatten() })
      return
    }

    const db = getDb()
    const fullName = (parsed.data.fullName || parsed.data.name || "").trim()
    const { email, phone, intent } = parsed.data

    const [byEmail, byPhone] = await Promise.all([
      db.collection(collections.waitlistSignups).where("email", "==", email).limit(1).get(),
      db.collection(collections.waitlistSignups).where("phone", "==", phone).limit(1).get(),
    ])
    const existing = byEmail.docs[0] || byPhone.docs[0]
    if (existing) {
      const alreadySent = Boolean(existing.data().welcomeEmailSent)
      let emailSent = alreadySent
      if (!alreadySent) {
        emailSent = await sendWaitlistWelcomeSafe(email, fullName || String(existing.data().fullName || ""), intent)
        if (emailSent) {
          await existing.ref.update({
            welcomeEmailSent: true,
            welcomeEmailSentAt: FieldValue.serverTimestamp(),
          })
        }
      }
      res.status(200).json({
        ok: true,
        alreadyJoined: true,
        id: existing.id,
        emailSent,
        message: emailSent
          ? "You're already on the list. We sent (or previously sent) your waitlist welcome email."
          : "You're already on the list. We'll be in touch when we open.",
      })
      return
    }

    const ref = await db.collection(collections.waitlistSignups).add({
      fullName: fullName || null,
      email,
      phone,
      intent,
      createdAt: FieldValue.serverTimestamp(),
      welcomeEmailSent: false,
    })

    const emailSent = await sendWaitlistWelcomeSafe(email, fullName, intent)
    if (emailSent) {
      await ref.update({
        welcomeEmailSent: true,
        welcomeEmailSentAt: FieldValue.serverTimestamp(),
      })
    }

    res.status(201).json({
      ok: true,
      alreadyJoined: false,
      id: ref.id,
      emailSent,
      message: emailSent
        ? "Welcome to the waitlist. Check your inbox for a confirmation email."
        : "Welcome to the waitlist. We'll be in touch when Reloved opens.",
    })
  } catch (err) {
    console.error("POST /waitlist", err)
    res.status(500).json({ error: "Failed to save waitlist signup" })
  }
})
