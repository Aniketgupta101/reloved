import { createHmac, timingSafeEqual } from "crypto"
import { Router } from "express"
import { toIndia10Digit } from "../lib/callMasking"

export const edesyInboundRouter = Router()

function digitsOnly(phone: string): string {
  return String(phone || "").replace(/\D/g, "")
}

/** Ops phone that answers public customer-care calls to the Edesy DID. */
function customerCareForwardPhone(): string {
  return (
    toIndia10Digit(process.env.CUSTOMER_CARE_FORWARD_PHONE || "") ||
    toIndia10Digit(process.env.RELOVED_OPS_PRIMARY_PHONE || "") ||
    toIndia10Digit(process.env.BORZO_OPS_PHONE || "")
  )
}

function publicMaskDid(): string {
  const d = digitsOnly(process.env.EDESY_MASKED_NUMBER_HINT || "9429397422")
  if (d.length === 10) return `91${d}`
  if (d.startsWith("91") && d.length >= 12) return d.slice(0, 12)
  return d
}

function verifyEdesySignature(rawBody: string, header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`
  try {
    const a = Buffer.from(header)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Edesy Masking dynamic routing webhook.
 * When someone dials the public Reloved DID, connect them to ops (customer care).
 * Docs: https://edesy.in/docs/number-masking/sessions/dynamic-routing
 */
edesyInboundRouter.post("/inbound-route", (req, res) => {
  const secret = process.env.EDESY_INBOUND_WEBHOOK_SECRET?.trim()
  if (secret) {
    const rawBuf = (req as { rawBody?: Buffer }).rawBody
    const raw = rawBuf ? rawBuf.toString("utf8") : JSON.stringify(req.body ?? {})
    const header = String(req.header("X-Edesy-Signature") || req.header("x-edesy-signature") || "")
    if (!verifyEdesySignature(raw, header, secret)) {
      console.warn("[edesy inbound] bad signature")
      res.status(401).json({ error: "invalid signature" })
      return
    }
  }

  const target10 = customerCareForwardPhone()
  if (!target10 || target10.length !== 10) {
    console.error("[edesy inbound] CUSTOMER_CARE_FORWARD_PHONE / ops phone not configured")
    res.status(200).json({
      action: "reject",
      reject_reason: "Reloved support is temporarily unavailable. Please email hello@reloved.digital.",
    })
    return
  }

  const inboundCaller = toIndia10Digit(String((req.body as { caller?: string })?.caller || ""))
  const targetWithCc = `91${target10}`
  // Show the real customer number on ops phone so support can see who called.
  // (Customer still dialed the public Reloved DID — their number is not published.)
  const callerIdForOps = inboundCaller ? `91${inboundCaller}` : publicMaskDid()

  console.log("[edesy inbound] route", {
    caller: inboundCaller || (req.body as { caller?: string })?.caller,
    masked: (req.body as { masked_number?: string })?.masked_number,
    target: targetWithCc,
    callerIdShownToOps: callerIdForOps,
  })

  res.status(200).json({
    action: "connect",
    target_number: targetWithCc,
    caller_id: callerIdForOps,
  })
})

/** Health / readiness for portal testing (no secrets). */
edesyInboundRouter.get("/inbound-route", (_req, res) => {
  const target10 = customerCareForwardPhone()
  res.json({
    ok: true,
    configured: Boolean(target10 && target10.length === 10),
    publicDid: publicMaskDid(),
    forwardConfigured: Boolean(target10),
  })
})
