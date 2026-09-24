/**
 * MSG91 Flow SMS (DLT-mapped Reloved Digital templates).
 * OTP uses Flow too via MSG91_SMS_TEMPLATE_ID + ##OTP## in otp.ts.
 * User-facing lifecycle SMS only — ops triage is email (see notifications.ts).
 *
 * Kept triggers:
 * - Item claimed → giver
 * - Delivery initiated (rider coming) → giver
 * - Delivery completed → claimer
 * - Delivery failed → giver or claimer
 */
import { normalizePhoneDigits } from "./donorIdentity"

const FLOW_URL = "https://control.msg91.com/api/v5/flow"

/** Env keys for MSG91 Flow template IDs (hex from MSG91 Templates list). */
export const MSG91_TEMPLATE_ENV = {
  itemClaimed: "MSG91_TPL_ITEM_CLAIMED",
  riderComing: "MSG91_TPL_DELIVERY_RIDER_COMING",
  deliveredClaimer: "MSG91_TPL_DELIVERY_DELIVERED_CLAIMER",
  failed: "MSG91_TPL_DELIVERY_FAILED",
} as const

export type Msg91TemplateEnvKey = (typeof MSG91_TEMPLATE_ENV)[keyof typeof MSG91_TEMPLATE_ENV]

export function toMsg91Mobile(phone: string | null | undefined): string | null {
  const ten = normalizePhoneDigits(phone)
  return ten ? `91${ten}` : null
}

function authKey(): string | null {
  const key = String(process.env.MSG91_AUTH_KEY || "").trim()
  return key || null
}

function templateId(envKey: string): string | null {
  const id = String(process.env[envKey] || "").trim()
  return id || null
}

/** Truncate item titles so DLT variable length stays safe. */
export function smsVar(value: string | null | undefined, max = 40): string {
  const s = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
  if (!s) return "your item"
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export function smsFirstName(value: string | null | undefined): string {
  const s = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
  if (!s || s.toLowerCase() === "there") return "there"
  return smsVar(s.split(" ")[0], 24)
}

/**
 * Send one Flow SMS. No-ops (returns skipped) if auth or template id missing.
 * Variable keys must match MSG91 ##name## / ##item## exactly (case-sensitive).
 */
export async function sendMsg91FlowSms(opts: {
  templateEnvKey: string
  phone: string | null | undefined
  vars?: Record<string, string>
  /** Optional sender override; defaults to RELOVD via template. */
  sender?: string
}): Promise<"sent" | "skipped" | "failed"> {
  const authkey = authKey()
  const tpl = templateId(opts.templateEnvKey)
  const mobile = toMsg91Mobile(opts.phone)
  if (!authkey || !tpl || !mobile) {
    if (!tpl && authkey) {
      console.warn(`[msg91] skip SMS — unset ${opts.templateEnvKey}`)
    }
    return "skipped"
  }

  const recipient: Record<string, string> = { mobiles: mobile, ...(opts.vars || {}) }
  const payload: Record<string, unknown> = {
    template_id: tpl,
    short_url: "0",
    recipients: [recipient],
  }
  // Always include sender RELOVD so DLT header matches STPL (avoids silent rejects).
  payload.sender = opts.sender || String(process.env.MSG91_OTP_SENDER || "RELOVD").trim() || "RELOVD"

  try {
    const res = await fetch(FLOW_URL, {
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
      console.error(`[msg91] Flow send failed (${opts.templateEnvKey}):`, res.status, text)
      return "failed"
    }
    return "sent"
  } catch (err) {
    console.error(`[msg91] Flow send error (${opts.templateEnvKey}):`, err)
    return "failed"
  }
}

export async function smsItemClaimedToGiver(
  phone: string | null | undefined,
  name?: string | null,
  itemTitle?: string | null
): Promise<"sent" | "skipped" | "failed"> {
  return sendMsg91FlowSms({
    templateEnvKey: MSG91_TEMPLATE_ENV.itemClaimed,
    phone,
    vars: { name: smsFirstName(name), item: smsVar(itemTitle) },
  })
}

export async function smsRiderComing(
  phone: string | null | undefined,
  name: string | null | undefined,
  itemTitle: string | null | undefined
): Promise<void> {
  await sendMsg91FlowSms({
    templateEnvKey: MSG91_TEMPLATE_ENV.riderComing,
    phone,
    vars: { name: smsFirstName(name), item: smsVar(itemTitle) },
  })
}

export async function smsDeliveredClaimer(
  phone: string | null | undefined,
  itemTitle: string | null | undefined
): Promise<void> {
  await sendMsg91FlowSms({
    templateEnvKey: MSG91_TEMPLATE_ENV.deliveredClaimer,
    phone,
    vars: { item: smsVar(itemTitle) },
  })
}

export async function smsDeliveryFailed(
  phone: string | null | undefined,
  name: string | null | undefined,
  itemTitle: string | null | undefined
): Promise<void> {
  await sendMsg91FlowSms({
    templateEnvKey: MSG91_TEMPLATE_ENV.failed,
    phone,
    vars: { name: smsFirstName(name), item: smsVar(itemTitle) },
  })
}
