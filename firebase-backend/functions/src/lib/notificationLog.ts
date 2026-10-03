import { FieldValue, type Firestore } from "firebase-admin/firestore"
import { collections } from "./firestore"
import { normalizePhoneDigits } from "./donorIdentity"

export type NotificationChannel = "email" | "sms"
export type NotificationAudience = "giver" | "claimer" | "ops"
export type NotificationStatus = "sent" | "skipped" | "failed"

export type NotificationTemplateKey =
  | "rider_coming_giver"
  | "order_dispatched_claimer"
  | "delivered_claimer"
  | "delivered_giver"
  | "handover_success_claimer"
  | "handover_success_giver"
  | "delivery_failed"

export type NotificationEventInput = {
  claimId: string
  channel: NotificationChannel
  templateKey: NotificationTemplateKey
  audience: NotificationAudience
  to: string | null | undefined
  subject: string
  previewBody: string
  params?: Record<string, string>
  status: NotificationStatus
  providerId?: string | null
  error?: string | null
}

/** Mask phone for admin display (keep last 4). */
export function maskNotifDestination(raw: string | null | undefined, channel: NotificationChannel): string {
  const s = String(raw || "").trim()
  if (!s) return "—"
  if (channel === "email") {
    const [user, domain] = s.split("@")
    if (!domain) return s.slice(0, 3) + "…"
    const u = user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "***"
    return `${u}@${domain}`
  }
  const digits = normalizePhoneDigits(s) || s.replace(/\D/g, "")
  if (digits.length < 4) return "****"
  return `******${digits.slice(-4)}`
}

export async function logNotificationEvent(db: Firestore, input: NotificationEventInput): Promise<string> {
  const ref = db.collection(collections.notificationEvents).doc()
  await ref.set({
    claimId: input.claimId,
    channel: input.channel,
    templateKey: input.templateKey,
    audience: input.audience,
    to: maskNotifDestination(input.to, input.channel),
    toRawLast4:
      input.channel === "sms"
        ? (normalizePhoneDigits(input.to) || "").slice(-4) || null
        : null,
    subject: input.subject,
    previewBody: input.previewBody,
    params: input.params || {},
    status: input.status,
    providerId: input.providerId || null,
    error: input.error || null,
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

export type DeliveryTemplateCatalogEntry = {
  key: NotificationTemplateKey
  label: string
  channel: NotificationChannel
  audience: NotificationAudience
  stage: "in_process" | "out_for_delivery" | "delivered" | "failed"
  brevoEnvKey?: string
  msg91EnvKey?: string
  subjectTemplate: string
  bodyTemplate: string
}

/** Static catalog for admin preview (fill {{VAR}} from claim context). */
export const DELIVERY_NOTIFICATION_CATALOG: DeliveryTemplateCatalogEntry[] = [
  {
    key: "rider_coming_giver",
    label: "Rider coming (giver)",
    channel: "email",
    audience: "giver",
    stage: "in_process",
    brevoEnvKey: "BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID",
    msg91EnvKey: "MSG91_TPL_DELIVERY_RIDER_COMING",
    subjectTemplate: "Action required - rider coming for {{ITEM_TITLE}}",
    bodyTemplate:
      "Hi {{FIRST_NAME}}, a courier has been dispatched to your building gate to collect {{ITEM_TITLE}}. 1) Bag the item. 2) Hand it to main gate security now. 3) Tell them a courier is coming to pick it up.",
  },
  {
    key: "order_dispatched_claimer",
    label: "Order dispatched (claimer)",
    channel: "email",
    audience: "claimer",
    stage: "out_for_delivery",
    brevoEnvKey: "BREVO_ORDER_DISPATCHED_CLAIMER_TEMPLATE_ID",
    msg91EnvKey: "MSG91_TPL_ORDER_DISPATCHED_CLAIMER",
    subjectTemplate: "Your order has been dispatched — {{ITEM_TITLE}}",
    bodyTemplate:
      "Hi {{REQUESTER_NAME}}, your Reloved order {{ITEM_TITLE}} has been dispatched. Be available at your building gate.",
  },
  {
    key: "delivered_claimer",
    label: "Delivered (claimer)",
    channel: "email",
    audience: "claimer",
    stage: "delivered",
    brevoEnvKey: "BREVO_DELIVERY_DELIVERED_CLAIMER_TEMPLATE_ID",
    msg91EnvKey: "MSG91_TPL_DELIVERY_DELIVERED_CLAIMER",
    subjectTemplate: "It's yours! ♡ - {{ITEM_TITLE}}",
    bodyTemplate:
      "Hi {{REQUESTER_NAME}}, It's yours! ♡ Thank you for giving this piece a new chapter. It's officially Reloved.",
  },
  {
    key: "delivered_giver",
    label: "Delivered (giver)",
    channel: "email",
    audience: "giver",
    stage: "delivered",
    brevoEnvKey: "BREVO_DELIVERY_DELIVERED_GIVER_TEMPLATE_ID",
    subjectTemplate: "Thank you for passing it on. ♡ - {{ITEM_TITLE}}",
    bodyTemplate: "Hi {{FIRST_NAME}}, Thank you for passing it on. ♡ You just made something Reloved - {{ITEM_TITLE}}.",
  },
  {
    key: "handover_success_claimer",
    label: "Share-a-pic (claimer)",
    channel: "email",
    audience: "claimer",
    stage: "delivered",
    brevoEnvKey: "BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID",
    msg91EnvKey: "MSG91_TPL_FEEDBACK_THANKS",
    subjectTemplate: "Got your Reloved?",
    bodyTemplate:
      "Hi {{REQUESTER_NAME}}, hope {{ITEM_TITLE}} found its new home with you. Send us a pic with your new find!",
  },
  {
    key: "handover_success_giver",
    label: "Handover thank-you (giver)",
    channel: "email",
    audience: "giver",
    stage: "delivered",
    brevoEnvKey: "BREVO_HANDOVER_SUCCESS_GIVER_TEMPLATE_ID",
    subjectTemplate: "Thank you for passing it on. ♡ Your gift was Reloved",
    bodyTemplate:
      "Hi {{FIRST_NAME}}, {{CLAIMER_NAME}} confirmed they received {{ITEM_TITLE}}. You just made something Reloved.",
  },
  {
    key: "delivery_failed",
    label: "Delivery failed",
    channel: "email",
    audience: "claimer",
    stage: "failed",
    brevoEnvKey: "BREVO_DELIVERY_FAILED_TEMPLATE_ID",
    msg91EnvKey: "MSG91_TPL_DELIVERY_FAILED",
    subjectTemplate: "Delivery issue - {{ITEM_TITLE}}",
    bodyTemplate: "Hi {{NAME}}, delivery of {{ITEM_TITLE}} didn't go through. Our team will reach out to reschedule.",
  },
]

export function fillTemplate(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => params[key] ?? "")
}

/** Brevo transactional templates use `{{ params.KEY }}` (and occasionally `{{ KEY }}`). */
export function fillBrevoPlaceholders(template: string, params: Record<string, string>): string {
  return String(template || "")
    .replace(/\{\{\s*params\.(\w+)\s*\}\}/gi, (_, key: string) => params[key] ?? "")
    .replace(/\{\{\s*(\w+)\s*\}\}/gi, (_, key: string) => params[key] ?? "")
}

/** MSG91 DLT bodies use `##name##` / `##item##`. */
export function fillMsg91Placeholders(template: string, vars: Record<string, string>): string {
  return String(template || "").replace(/##(\w+)##/g, (_, key: string) => vars[key] ?? "")
}

const MSG91_SMS_BODY_FALLBACK: Partial<Record<NotificationTemplateKey, string>> = {
  rider_coming_giver:
    "Hi ##name##, a Reloved Digital rider is coming for ##item##. Bag it and leave it with building gate security now.\n- Reloved Digital",
  order_dispatched_claimer:
    "Hi ##name##, your Reloved Digital item ##item## has been picked up and is on the way to you.\n- Reloved Digital",
  delivered_claimer:
    "Your Reloved Digital item ##item## has been delivered. Enjoy thanks for choosing Reloved Digital.\n- Reloved Digital",
  handover_success_claimer:
    "Hi ##name##, hope ##item## found its new home. Send us a pic for the Wall of Love!\n- Reloved Digital",
  delivery_failed:
    "Hi ##name##, delivery of ##item## could not be completed. Reloved Digital will contact you to reschedule.\n- Reloved Digital",
}

function escapeHtmlPreview(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function fallbackEmailHtml(entry: DeliveryTemplateCatalogEntry, params: Record<string, string>): string {
  const subject = fillTemplate(entry.subjectTemplate, params)
  const body = fillTemplate(entry.bodyTemplate, params)
  const badge =
    entry.stage === "in_process"
      ? { label: "Rider coming", bg: "#EC2F9B" }
      : entry.stage === "out_for_delivery"
        ? { label: "Dispatched", bg: "#2563eb" }
        : entry.stage === "failed"
          ? { label: "Issue", bg: "#dc2626" }
          : { label: "Delivered", bg: "#16a34a" }
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EBE7DF;padding:32px 16px;"><tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #111;max-width:540px;">
  <tr><td style="padding:32px 28px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;background:${badge.bg};color:#fff;display:inline-block;padding:6px 12px;">${escapeHtmlPreview(badge.label)}</p>
  <h1 style="margin:16px 0;font-size:22px;line-height:1.2;">${escapeHtmlPreview(subject)}</h1>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.55;white-space:pre-wrap;">${escapeHtmlPreview(body)}</p>
  <p style="margin:24px 0 0;font-size:12px;color:#777;">RE-LOVED · Preloved for Free</p>
  </td></tr></table></td></tr></table></body></html>`
}

async function fetchBrevoTemplate(templateId: string): Promise<{ subject: string; htmlContent: string } | null> {
  const key = process.env.BREVO_API_KEY
  if (!key || !templateId) return null
  try {
    const res = await fetch(`https://api.brevo.com/v3/smtp/templates/${encodeURIComponent(templateId)}`, {
      headers: { "api-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.warn("Brevo template fetch failed", templateId, res.status, await res.text())
      return null
    }
    const data = (await res.json()) as { subject?: string; htmlContent?: string }
    if (!data.htmlContent) return null
    return { subject: String(data.subject || ""), htmlContent: String(data.htmlContent) }
  } catch (err) {
    console.warn("Brevo template fetch error", templateId, err)
    return null
  }
}

async function fetchMsg91SmsBody(templateId: string): Promise<string | null> {
  const authkey = String(process.env.MSG91_AUTH_KEY || "").trim()
  if (!authkey || !templateId) return null
  try {
    const res = await fetch(
      `https://control.msg91.com/api/v5/sms/getTemplateVersions?template_id=${encodeURIComponent(templateId)}`,
      { headers: { authkey, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ template_data?: string }> }
    const body = data.data?.[0]?.template_data
    return body ? String(body) : null
  } catch {
    return null
  }
}

function smsVarsFromParams(params: Record<string, string>): Record<string, string> {
  const name =
    params.name ||
    params.FIRST_NAME ||
    params.REQUESTER_NAME ||
    params.NAME ||
    params.CLAIMER_NAME ||
    "there"
  const item = params.item || params.ITEM_TITLE || "your item"
  return { name, item, ...params }
}

export type AsReceivedPreview = {
  key: NotificationTemplateKey
  label: string
  channel: NotificationChannel
  audience: NotificationAudience
  subject: string
  textBody: string
  /** Full HTML as in inbox when channel=email; null for SMS. */
  htmlBody: string | null
  source: "brevo" | "msg91" | "fallback"
  providerTemplateId: string | null
}

/**
 * Render a delivery notification the way the recipient receives it:
 * email → Brevo HTML (filled), SMS → MSG91 DLT body (filled).
 */
export async function renderAsReceivedPreview(
  key: NotificationTemplateKey,
  channel: NotificationChannel,
  paramsIn: Record<string, string> = {}
): Promise<AsReceivedPreview | null> {
  const entry = DELIVERY_NOTIFICATION_CATALOG.find((t) => t.key === key)
  if (!entry) return null

  const params: Record<string, string> = {
    PROFILE_URL: process.env.PUBLIC_APP_URL
      ? `${String(process.env.PUBLIC_APP_URL).replace(/\/$/, "")}/account`
      : "https://reloved.digital/account",
    ...paramsIn,
  }

  if (channel === "sms") {
    const msg91Id =
      (entry.msg91EnvKey && String(process.env[entry.msg91EnvKey] || "").trim()) || null
    const liveBody = msg91Id ? await fetchMsg91SmsBody(msg91Id) : null
    const tpl = liveBody || MSG91_SMS_BODY_FALLBACK[key] || entry.bodyTemplate
    const vars = smsVarsFromParams(params)
    const textBody = liveBody || MSG91_SMS_BODY_FALLBACK[key]
      ? fillMsg91Placeholders(tpl, vars)
      : fillTemplate(tpl, params)
    return {
      key,
      label: entry.label,
      channel: "sms",
      audience: entry.audience,
      subject: `SMS · ${entry.label}`,
      textBody,
      htmlBody: null,
      source: liveBody ? "msg91" : "fallback",
      providerTemplateId: msg91Id,
    }
  }

  const brevoId =
    (entry.brevoEnvKey && String(process.env[entry.brevoEnvKey] || "").trim()) || null
  const brevo = brevoId ? await fetchBrevoTemplate(brevoId) : null
  if (brevo) {
    return {
      key,
      label: entry.label,
      channel: "email",
      audience: entry.audience,
      subject: fillBrevoPlaceholders(brevo.subject, params) || fillTemplate(entry.subjectTemplate, params),
      textBody: fillTemplate(entry.bodyTemplate, params),
      htmlBody: fillBrevoPlaceholders(brevo.htmlContent, params),
      source: "brevo",
      providerTemplateId: brevoId,
    }
  }

  return {
    key,
    label: entry.label,
    channel: "email",
    audience: entry.audience,
    subject: fillTemplate(entry.subjectTemplate, params),
    textBody: fillTemplate(entry.bodyTemplate, params),
    htmlBody: fallbackEmailHtml(entry, params),
    source: "fallback",
    providerTemplateId: brevoId,
  }
}

export async function listNotificationEventsForClaim(
  db: Firestore,
  claimId: string,
  limit = 50
): Promise<Record<string, unknown>[]> {
  try {
    const snap = await db
      .collection(collections.notificationEvents)
      .where("claimId", "==", claimId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get()
    return snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
      }
    })
  } catch (err) {
    // Missing composite index — fall back to unordered filter.
    console.warn("notificationEvents orderBy fallback", err)
    const snap = await db
      .collection(collections.notificationEvents)
      .where("claimId", "==", claimId)
      .limit(limit)
      .get()
    return snap.docs
      .map((d) => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
        }
      })
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
  }
}

export async function notificationSummaryForClaims(
  db: Firestore,
  claimIds: string[]
): Promise<Record<string, { count: number; lastAt: string | null; lastLabel: string | null }>> {
  const out: Record<string, { count: number; lastAt: string | null; lastLabel: string | null }> = {}
  for (const id of claimIds) {
    out[id] = { count: 0, lastAt: null, lastLabel: null }
  }
  // Firestore 'in' max 30 — batch.
  for (let i = 0; i < claimIds.length; i += 30) {
    const chunk = claimIds.slice(i, i + 30)
    if (!chunk.length) continue
    const snap = await db
      .collection(collections.notificationEvents)
      .where("claimId", "in", chunk)
      .limit(300)
      .get()
    for (const doc of snap.docs) {
      const data = doc.data()
      const cid = String(data.claimId || "")
      if (!out[cid]) out[cid] = { count: 0, lastAt: null, lastLabel: null }
      out[cid].count += 1
      const at = data.createdAt?.toDate?.()?.toISOString?.() || null
      if (at && (!out[cid].lastAt || at > out[cid].lastAt)) {
        out[cid].lastAt = at
        out[cid].lastLabel = String(data.templateKey || data.subject || "")
      }
    }
  }
  return out
}
