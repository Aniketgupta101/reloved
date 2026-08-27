import { createHash, randomInt } from "crypto"
import { Router } from "express"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { z } from "zod"
import { collections, getDb } from "../lib/firestore"

export const otpRouter = Router()

const OTP_TTL_MINUTES = 10

const otpRequestSchema = z.object({
  channel: z.enum(["sms", "email"]),
  target: z.string().min(3).max(120),
})

const otpVerifySchema = z.object({
  channel: z.enum(["sms", "email"]),
  target: z.string().min(3).max(120),
  code: z.string().length(6),
})

const otpWidgetVerifySchema = z.object({
  target: z.string().min(3).max(120),
  accessToken: z.string().min(1),
})

function hashOtp(code: string) {
  return createHash("sha256").update(code).digest("hex")
}

async function sendOtpEmailViaRelay(email: string, code: string): Promise<void> {
  const relayUrl = process.env.EMAIL_RELAY_URL
  const relaySecret = process.env.EMAIL_RELAY_SECRET
  if (!relayUrl || !relaySecret) {
    throw new Error("EMAIL_RELAY_URL / EMAIL_RELAY_SECRET not configured")
  }
  const res = await fetch(relayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-relay-secret": relaySecret,
    },
    body: JSON.stringify({ email, code }),
  })
  if (!res.ok) {
    throw new Error(`Email relay failed: ${res.status} ${await res.text()}`)
  }
}

async function sendOtpEmailViaBrevo(email: string, code: string): Promise<void> {
  const key = process.env.BREVO_API_KEY
  if (!key) {
    throw new Error("BREVO_API_KEY is not configured")
  }

  const templateId = process.env.BREVO_OTP_TEMPLATE_ID
  const payload = templateId
    ? {
        to: [{ email }],
        templateId: Number(templateId),
        params: { OTP: code },
      }
    : {
        sender: {
          email: process.env.BREVO_SENDER_EMAIL || "no-reply@reloved.local",
          name: process.env.BREVO_SENDER_NAME || "reloved",
        },
        to: [{ email }],
        subject: "Your reloved verification code",
        htmlContent: `<p>Your verification code is <strong>${code}</strong>. It expires in ${OTP_TTL_MINUTES} minutes.</p>`,
      }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": key,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`Brevo email failed: ${res.status} ${await res.text()}`)
  }
}

/** Prefer Lightsail relay (stable Brevo-allowlisted IP). Fall back to direct Brevo. */
async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (process.env.EMAIL_RELAY_URL && process.env.EMAIL_RELAY_SECRET) {
    await sendOtpEmailViaRelay(email, code)
    return
  }
  await sendOtpEmailViaBrevo(email, code)
}

otpRouter.post("/request", async (req, res) => {
  const parsed = otpRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { channel, target } = parsed.data
  if (channel === "sms") {
    // SMS send/verify is owned by the MSG91 widget on the client.
    res.status(400).json({ error: "Use the SMS widget to request a phone code." })
    return
  }
  const db = getDb()

  try {
    // Avoid composite-index wait: filter recent requests in memory.
    const recentSnap = await db
      .collection(collections.otpCodes)
      .where("target", "==", target)
      .limit(20)
      .get()
    const recentCount = recentSnap.docs.filter((d) => {
      const data = d.data()
      if (data.channel !== channel) return false
      const created = data.createdAt?.toMillis?.() ?? 0
      return created >= Date.now() - 10 * 60 * 1000
    }).length
    if (recentCount >= 3) {
      res.status(429).json({ error: "Too many OTP requests. Try again later." })
      return
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
    await db.collection(collections.otpCodes).add({
      channel,
      target,
      codeHash: hashOtp(code),
      attempts: 0,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)),
      verifiedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    })

    await sendOtpEmail(target, code)
    res.json({ ok: true })
  } catch (err) {
    console.error("Failed to send OTP:", err)
    res.status(502).json({ error: "Couldn't send the code right now. Please try again shortly." })
  }
})

otpRouter.post("/verify", async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { channel, target, code } = parsed.data
  const db = getDb()

  try {
    const snap = await db
      .collection(collections.otpCodes)
      .where("target", "==", target)
      .limit(20)
      .get()

    const now = Date.now()
    const record = snap.docs
      .filter((d) => {
        const data = d.data()
        if (data.channel !== channel) return false
        if (data.verifiedAt) return false
        const exp = data.expiresAt?.toMillis?.() ?? 0
        return exp > now
      })
      .sort((a, b) => {
        const ac = a.data().createdAt?.toMillis?.() ?? 0
        const bc = b.data().createdAt?.toMillis?.() ?? 0
        return bc - ac
      })[0]

    if (!record) {
      res.status(400).json({ error: "No pending OTP for this target. Request a new one." })
      return
    }

    const data = record.data()
    if ((data.attempts || 0) >= 5) {
      res.status(429).json({ error: "Too many incorrect attempts. Request a new code." })
      return
    }

    if (data.codeHash !== hashOtp(code)) {
      await record.ref.update({ attempts: (data.attempts || 0) + 1 })
      res.status(400).json({ error: "Incorrect code." })
      return
    }

    await record.ref.update({ verifiedAt: FieldValue.serverTimestamp() })
    res.json({ ok: true })
  } catch (err) {
    console.error("Failed to verify OTP:", err)
    res.status(500).json({ error: "Something went wrong verifying that code. Please try again." })
  }
})

otpRouter.post("/verify-widget", async (req, res) => {
  const parsed = otpWidgetVerifySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { target, accessToken } = parsed.data
  const authkey = process.env.MSG91_AUTH_KEY

  try {
    if (!authkey) {
      res.status(502).json({ error: "SMS verification isn't configured on the server yet." })
      return
    }

    const verifyRes = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authkey, "access-token": accessToken }),
    })
    const body = (await verifyRes.json().catch(() => ({}))) as { type?: string }
    if (!verifyRes.ok || body?.type !== "success") {
      res.status(400).json({ error: "Incorrect code." })
      return
    }

    await getDb().collection(collections.otpCodes).add({
      channel: "sms",
      target,
      codeHash: hashOtp(accessToken.slice(0, 32)),
      attempts: 0,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)),
      verifiedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    })
    res.json({ ok: true })
  } catch (err) {
    console.error("MSG91 widget token verify failed:", err)
    res.status(500).json({ error: "Something went wrong verifying that code. Please try again." })
  }
})
