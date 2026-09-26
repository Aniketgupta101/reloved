/**
 * MSG91 Flow SMS (DLT-mapped Reloved Digital templates).
 * OTP uses Flow too via MSG91_SMS_TEMPLATE_ID + ##OTP## in otp.ts.
 * User-facing lifecycle SMS (see EMAIL_FLOWS.md 8-step product flow).
 *
 * Env templates must be registered on STPL + mapped in MSG91 before they send.
 * Missing env → skip (no throw).
 */
import { normalizePhoneDigits } from "./donorIdentity"

const FLOW_URL = "https://control.msg91.com/api/v5/flow"

/** Env keys for MSG91 Flow template IDs (hex from MSG91 Templates list). */
export const MSG91_TEMPLATE_ENV = {
  itemClaimed: "MSG91_TPL_ITEM_CLAIMED",
  claimMatched: "MSG91_TPL_CLAIM_MATCHED",
  deliveryReadyGiver: "MSG91_TPL_DELIVERY_READY_GIVER",
  scheduleSet: "MSG91_TPL_SCHEDULE_SET",
  riderComing: "MSG91_TPL_DELIVERY_RIDER_COMING",
  orderDispatchedClaimer: "MSG91_TPL_ORDER_DISPATCHED_CLAIMER",
  deliveredClaimer: "MSG91_TPL_DELIVERY_DELIVERED_CLAIMER",
  feedbackThanks: "MSG91_TPL_FEEDBACK_THANKS",
  failed: "MSG91_TPL_DELIVERY_FAILED",
} as const

/**
 * Verified MSG91 Flow IDs (hex from MSG91 SMS → Templates).
 * Env overrides these; fallbacks keep IDs even if .env is stale.
 */
export const MSG91_TEMPLATE_DEFAULTS: Record<Msg91TemplateEnvKey, string> = {
  MSG91_TPL_ITEM_CLAIMED: "6ab39dd637af69ca760d4a12",
  MSG91_TPL_CLAIM_MATCHED: "6ab7bcc530f8c2c952096872",
  MSG91_TPL_DELIVERY_READY_GIVER: "6ab7bcc7652e9bd35a0ce442",
  MSG91_TPL_SCHEDULE_SET: "6ab7bcc8f9d5ae814f0adc32",
  MSG91_TPL_DELIVERY_RIDER_COMING: "6ab39e4ae2f8b9b6da0921f3",
  MSG91_TPL_ORDER_DISPATCHED_CLAIMER: "6ab39e646121ca1dd50947b3",
  MSG91_TPL_DELIVERY_DELIVERED_CLAIMER: "6ab39ea41235cf02ba092fd5",
  MSG91_TPL_FEEDBACK_THANKS: "6ab7bcce5531eb781f0c7cd2",
  MSG91_TPL_DELIVERY_FAILED: "6ab39eb99efa25974d0a9b32",
}

/**
 * Templates confirmed Active in MSG91 (getTemplateVersions status=1).
 * Others still return Flow API "success" then fail with MSG91 #401
 * (Flow Not Yet Approved) or #400 — skip until approved in MSG91 dashboard.
 */
export const MSG91_TEMPLATE_LIVE: ReadonlySet<Msg91TemplateEnvKey> = new Set([
  "MSG91_TPL_ITEM_CLAIMED",
  "MSG91_TPL_DELIVERY_RIDER_COMING",
  "MSG91_TPL_ORDER_DISPATCHED_CLAIMER",
  "MSG91_TPL_DELIVERY_DELIVERED_CLAIMER",
  "MSG91_TPL_DELIVERY_FAILED",
])

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
  const fromEnv = String(process.env[envKey] || "").trim()
  if (fromEnv) return fromEnv
  const fallback = MSG91_TEMPLATE_DEFAULTS[envKey as Msg91TemplateEnvKey]
  return fallback || null
}

/** Which lifecycle SMS templates resolve and are live to send. No secrets. */
export function msg91LifecycleTemplateStatus(): Record<string, boolean | string> {
  const out: Record<string, boolean | string> = {}
  for (const key of Object.values(MSG91_TEMPLATE_ENV)) {
    const id = templateId(key)
    out[key] = Boolean(id)
    out[`${key}_live`] = Boolean(id) && MSG91_TEMPLATE_LIVE.has(key)
  }
  out.MSG91_AUTH_KEY = Boolean(authKey())
  out.MSG91_SMS_TEMPLATE_ID = Boolean(String(process.env.MSG91_SMS_TEMPLATE_ID || "").trim())
  return out
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
 * Variable keys must match MSG91 ##name## / ##item## / ##slot## exactly (case-sensitive).
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

  // Do not hit Flow API for unapproved templates — MSG91 accepts then emails #401/#400.
  const forceSend = String(process.env.MSG91_FORCE_UNAPPROVED || "").trim() === "1"
  if (!forceSend && !MSG91_TEMPLATE_LIVE.has(opts.templateEnvKey as Msg91TemplateEnvKey)) {
    console.warn(
      `[msg91] skip SMS — ${opts.templateEnvKey} not Active in MSG91 yet (prevents #401 Flow Not Yet Approved)`
    )
    return "skipped"
  }

  const recipient: Record<string, string> = { mobiles: mobile, ...(opts.vars || {}) }
  // Do NOT override sender — template already has RELOVD; forcing sender can trigger #400.
  const payload: Record<string, unknown> = {
    template_id: tpl,
    short_url: "0",
    recipients: [recipient],
  }
  if (opts.sender) payload.sender = opts.sender

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

/** Flow #2 — someone claimed → giver */
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

/** Flow #3 — matched / approved → claimer */
export async function smsClaimMatched(
  phone: string | null | undefined,
  name?: string | null,
  itemTitle?: string | null
): Promise<"sent" | "skipped" | "failed"> {
  return sendMsg91FlowSms({
    templateEnvKey: MSG91_TEMPLATE_ENV.claimMatched,
    phone,
    vars: { name: smsFirstName(name), item: smsVar(itemTitle) },
  })
}

/** Flow #4 — delivery ready, be ready with item → giver */
export async function smsDeliveryReadyGiver(
  phone: string | null | undefined,
  name?: string | null,
  itemTitle?: string | null
): Promise<"sent" | "skipped" | "failed"> {
  return sendMsg91FlowSms({
    templateEnvKey: MSG91_TEMPLATE_ENV.deliveryReadyGiver,
    phone,
    vars: { name: smsFirstName(name), item: smsVar(itemTitle) },
  })
}

/** Flow #5 — date/time set → giver or claimer (DLT: keep vars short; link lives in email). */
export async function smsScheduleSet(
  phone: string | null | undefined,
  name?: string | null,
  itemTitle?: string | null,
  slotLabel?: string | null
): Promise<"sent" | "skipped" | "failed"> {
  // Prefer slot when template supports ##slot##; otherwise MSG91 may ignore extra keys.
  // Body intent (STPL): date/time set — check email to modify / contact us.
  return sendMsg91FlowSms({
    templateEnvKey: MSG91_TEMPLATE_ENV.scheduleSet,
    phone,
    vars: {
      name: smsFirstName(name),
      item: smsVar(itemTitle),
      slot: smsVar(slotLabel || "see email", 48),
    },
  })
}

/** Flow #6a — rider coming → giver (bag at gate) */
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

/** Flow #6b — order dispatched → claimer */
export async function smsOrderDispatchedClaimer(
  phone: string | null | undefined,
  name?: string | null,
  itemTitle?: string | null
): Promise<"sent" | "skipped" | "failed"> {
  return sendMsg91FlowSms({
    templateEnvKey: MSG91_TEMPLATE_ENV.orderDispatchedClaimer,
    phone,
    vars: { name: smsFirstName(name), item: smsVar(itemTitle) },
  })
}

/** Flow #7 — delivered → claimer */
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

/** Flow #8 — thank you / feedback → claimer */
export async function smsFeedbackThanks(
  phone: string | null | undefined,
  name?: string | null,
  itemTitle?: string | null
): Promise<"sent" | "skipped" | "failed"> {
  return sendMsg91FlowSms({
    templateEnvKey: MSG91_TEMPLATE_ENV.feedbackThanks,
    phone,
    vars: { name: smsFirstName(name), item: smsVar(itemTitle) },
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
