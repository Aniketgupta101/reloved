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

function extractCaller(body: Record<string, unknown>): string {
  const candidates = [
    body.caller,
    body.from,
    body.From,
    body.caller_number,
    body.callerNumber,
    (body.data as Record<string, unknown> | undefined)?.from,
    (body.data as Record<string, unknown> | undefined)?.caller_number,
  ]
  for (const c of candidates) {
    const ten = toIndia10Digit(String(c || ""))
    if (ten.length === 10) return ten
  }
  return ""
}

function isVoiceCallHook(body: Record<string, unknown>, pathHint: string): boolean {
  if (pathHint.includes("voice")) return true
  if (body.event === "masking.route") return false
  // Jambonz / Edesy Voice call-hook payloads commonly include call_sid + from/to
  // without the masking.route event name.
  if (body.verb || body.call_hook || Array.isArray(body)) return true
  if ((body.call_sid || body.callSid || body.CallSid) && (body.from || body.From || body.to || body.To)) {
    return !body.masked_number && body.event !== "masking.route"
  }
  return false
}

/**
 * Edesy inbound webhook for the public Reloved DID (+91 94293 97422).
 * Supports:
 * 1) Number Masking dynamic routing → { action, target_number, caller_id }
 * 2) Voice / Jambonz call-hook → Dial verb JSON array
 * Docs: https://edesy.in/docs/number-masking/sessions/dynamic-routing
 */
function handleInbound(req: any, res: any) {
  const secret = process.env.EDESY_INBOUND_WEBHOOK_SECRET?.trim()
  const header = String(req.header("X-Edesy-Signature") || req.header("x-edesy-signature") || "")
  // Only enforce HMAC when Edesy actually sends a signature header.
  // Voice phone-number routing often POSTs without one; rejecting those 401s
  // breaks the website footer customer-care line.
  if (secret && header) {
    const rawBuf = (req as { rawBody?: Buffer }).rawBody
    const raw = rawBuf ? rawBuf.toString("utf8") : JSON.stringify(req.body ?? {})
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

  const body = (req.body || {}) as Record<string, unknown>
  const inboundCaller = extractCaller(body)
  const targetWithCc = `91${target10}`
  const targetE164 = `+91${target10}`
  const callerIdForOps = inboundCaller ? `91${inboundCaller}` : publicMaskDid()

  console.log("[edesy inbound] route", {
    path: req.path,
    event: body.event,
    caller: inboundCaller || body.caller || body.from || body.From,
    masked: body.masked_number,
    target: targetWithCc,
    callerIdShownToOps: callerIdForOps,
    hasSignature: Boolean(header),
  })

  // Voice / Jambonz call-hook: return Dial instructions
  if (isVoiceCallHook(body, String(req.path || ""))) {
    res.status(200).json([
      {
        verb: "dial",
        callerId: `+${publicMaskDid()}`,
        target: [
          {
            type: "phone",
            number: targetE164,
          },
        ],
      },
    ])
    return
  }

  // Masking dynamic routing
  res.status(200).json({
    action: "connect",
    target_number: targetWithCc,
    caller_id: callerIdForOps,
  })
}

edesyInboundRouter.post("/inbound-route", handleInbound)
edesyInboundRouter.post("/voice-hook", handleInbound)

/** Health / readiness for portal testing (no secrets). */
edesyInboundRouter.get("/inbound-route", (_req, res) => {
  const target10 = customerCareForwardPhone()
  res.json({
    ok: true,
    configured: Boolean(target10 && target10.length === 10),
    publicDid: publicMaskDid(),
    forwardConfigured: Boolean(target10),
    forwardLast4: target10 ? target10.slice(-4) : null,
  })
})
