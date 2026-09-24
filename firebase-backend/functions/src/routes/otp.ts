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
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 4_000)
  try {
    const res = await fetch(relayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-relay-secret": relaySecret,
      },
      body: JSON.stringify({ email, code }),
      signal: ac.signal,
    })
    if (!res.ok) {
      throw new Error(`Email relay failed: ${res.status} ${await res.text()}`)
    }
  } finally {
    clearTimeout(timer)
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
          email: process.env.BREVO_SENDER_EMAIL || "mail@reloved.digital",
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
    try {
      await sendOtpEmailViaRelay(email, code)
      return
    } catch (err) {
      console.error("OTP email relay failed; falling back to Brevo:", err)
    }
  }
  await sendOtpEmailViaBrevo(email, code)
}

/**
 * Server-side SMS OTP via MSG91 Flow API.
 *
 * Reloved's RELOVED_OTP_LOGIN lives under MSG91 → SMS → Templates (DLT hex id,
 * ##OTP## var) — same list as claim/delivery Flow templates. Calling the OTP
 * product API (/api/v5/otp) without an OTP-section template yields Error 400
 * "Template ID Missing or Invalid Template" in MSG91 Error Logs (seen 23 Sep).
 *
 * Falls back to 2Factor only when MSG91 auth is unset. If neither can send and
 * OTP_VENDOR_FALLBACK_LOG=true, returns "dev" so the UI can show the code.
 */
async function sendOtpSms(phone: string, code: string): Promise<"sent" | "dev"> {
  const digits = phone.replace(/\D/g, "")
  const mobile91 = digits.startsWith("91") && digits.length === 12 ? digits : `91${digits}`
  if (!/^\d{12}$/.test(mobile91)) {
    throw new Error("Invalid mobile for SMS OTP")
  }

  const authkey = String(process.env.MSG91_AUTH_KEY || "").trim()
  const templateId = String(process.env.MSG91_SMS_TEMPLATE_ID || "").trim()
  const sender = String(process.env.MSG91_OTP_SENDER || "RELOVD").trim() || "RELOVD"

  if (authkey) {
    if (!templateId) {
      throw new Error(
        "MSG91_SMS_TEMPLATE_ID is required for Reloved OTP SMS (use RELOVED_OTP_LOGIN hex id from SMS → Templates)"
      )
    }
    // Flow API — template_id + ##OTP## (case-sensitive). Do not use /api/v5/otp here.
    const payload: Record<string, unknown> = {
      template_id: templateId,
      short_url: "0",
      recipients: [{ mobiles: mobile91, OTP: code }],
      sender,
    }
    const res = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey },
      body: JSON.stringify(payload),
    })
    const text = await res.text()
    let body: { type?: string; message?: string } = {}
    try {
      body = JSON.parse(text) as { type?: string; message?: string }
    } catch {
      /* non-JSON */
    }
    if (!res.ok || (body.type && body.type !== "success")) {
      const hint =
        res.status === 400 || /template/i.test(text)
          ? " — MSG91 #400: confirm MSG91_SMS_TEMPLATE_ID is the RELOVED_OTP_LOGIN id from SMS → Templates (Verified by DLT), header RELOVD."
          : ""
      throw new Error(`MSG91 SMS send failed: ${res.status} ${text}${hint}`)
    }
    return "sent"
  }

  const twoFactorKey = process.env.TWO_FACTOR_API_KEY
  if (twoFactorKey) {
    const target = `+${mobile91}`
    const res = await fetch(`https://2factor.in/API/V1/${twoFactorKey}/SMS/${target}/${code}`, {
      method: "POST",
    })
    if (!res.ok) {
      throw new Error(`2Factor SMS send failed: ${res.status} ${await res.text()}`)
    }
    const body = (await res.json()) as { Status?: string }
    if (body.Status !== "Success") {
      throw new Error(`2Factor SMS send failed: ${JSON.stringify(body)}`)
    }
    return "sent"
  }

  if (process.env.OTP_VENDOR_FALLBACK_LOG === "true") {
    console.log(`[dev] SMS OTP to ${phone}: ${code}`)
    return "dev"
  }

  throw new Error(
    "SMS OTP isn't configured (need MSG91 auth key + MSG91_SMS_TEMPLATE_ID, 2Factor, or OTP_VENDOR_FALLBACK_LOG)"
  )
}

otpRouter.post("/request", async (req, res) => {
  const parsed = otpRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  let { channel, target } = parsed.data
  const db = getDb()

  try {
    // Normalize + hard-validate before any vendor call (MSG91 #101 = mobile missing).
    if (channel === "sms") {
      const digits = String(target || "").replace(/\D/g, "").slice(-10)
      if (!/^[6-9]\d{9}$/.test(digits)) {
        res.status(400).json({ error: "Enter a valid 10-digit Indian mobile number." })
        return
      }
      target = digits
    } else {
      target = String(target || "").trim().toLowerCase()
      if (!target.includes("@") || target.length < 5) {
        res.status(400).json({ error: "Enter a valid email address." })
        return
      }
    }

    // Avoid composite-index wait: filter recent requests in memory.
    const recentSnap = await db
      .collection(collections.otpCodes)
      .where("target", "==", target)
      .limit(20)
      .get()
    const recentForChannel = recentSnap.docs.filter((d) => {
      const data = d.data()
      if (data.channel !== channel) return false
      const created = data.createdAt?.toMillis?.() ?? 0
      return created >= Date.now() - 10 * 60 * 1000
    })
    // One OTP send per target+channel per 10 minutes — no resend / multi-trigger.
    if (recentForChannel.length >= 1) {
      res.status(429).json({
        error:
          channel === "sms"
            ? "A login code was already sent to this number. Wait up to 10 minutes, or use email / Google."
            : "A login code was already sent to this email. Wait up to 10 minutes, or try Google sign-in.",
      })
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

    if (channel === "email") {
      await sendOtpEmail(target, code)
      res.json({ ok: true })
      return
    }

    const smsMode = await sendOtpSms(target, code)
    // When no SMS vendor can deliver, surface the code so production testing
    // still works (same idea as local console logging on the Express backend).
    res.json(smsMode === "dev" ? { ok: true, devCode: code } : { ok: true })
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
