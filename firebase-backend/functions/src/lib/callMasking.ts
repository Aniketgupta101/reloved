/**
 * Edesy number masking � Uber/Rapido-style privacy calls for Reloved logistics.
 * Docs: https://edesy.in/docs/number-masking/api-reference/initiate-call
 * API: POST https://voice-api.edesy.in/v1/masking/calls
 *
 * Party A rings first (ops), then Party B (giver/claimer). Both see a masked caller ID.
 */

function digitsOnly(phone: string): string {
  return String(phone || "").replace(/\D/g, "")
}

/** Edesy expects 10-digit Indian mobiles (no +91). */
export function toIndia10Digit(phone: string): string {
  const d = digitsOnly(phone)
  if (!d) return ""
  if (d.length === 10) return d
  if (d.startsWith("91") && d.length >= 12) return d.slice(-10)
  if (d.length > 10) return d.slice(-10)
  return d
}

/** Kept for callers that still expect E.164 (logs / future providers). */
export function toE164India(phone: string): string {
  const ten = toIndia10Digit(phone)
  return ten ? `+91${ten}` : ""
}

export function callMaskingConfigured(): boolean {
  return (
    process.env.CALL_MASKING_ENABLED === "true" &&
    Boolean(process.env.EDESY_API_KEY?.trim())
  )
}

export function callMaskingStatus() {
  return {
    enabled: process.env.CALL_MASKING_ENABLED === "true",
    configured: callMaskingConfigured(),
    provider: "edesy",
    tenantId: process.env.EDESY_TENANT_ID || null,
    maskedNumberHint: process.env.EDESY_MASKED_NUMBER_HINT || null,
    opsPrimary: process.env.RELOVED_OPS_PRIMARY_PHONE || null,
    opsBackup: process.env.RELOVED_OPS_BACKUP_PHONE || null,
    message: callMaskingConfigured()
      ? "Edesy masking ready"
      : "Set CALL_MASKING_ENABLED=true and EDESY_API_KEY (vp_...). Create key at masking.edesy.in",
  }
}

export type MaskParty = "giver" | "claimer" | "ops"

/**
 * Bridge two phones via Edesy click-to-call masking.
 * fromPhone = Party A (dialed first), toPhone = Party B (bridged after A answers).
 */
export async function connectMaskedCall(opts: {
  fromPhone: string
  toPhone: string
  /** Stored on our side only; Edesy has no customField equivalent. */
  customField?: string
  record?: boolean
  timeLimitSec?: number
}): Promise<{ callSid: string; status: string; maskedNumber: string | null; raw: unknown }> {
  if (!callMaskingConfigured()) {
    throw new Error("Call masking is not configured (EDESY_API_KEY / CALL_MASKING_ENABLED)")
  }

  const apiKey = process.env.EDESY_API_KEY!.trim()
  const base = (process.env.EDESY_API_BASE || "https://voice-api.edesy.in/v1").replace(/\/$/, "")

  const partyA = toIndia10Digit(opts.fromPhone)
  const partyB = toIndia10Digit(opts.toPhone)
  if (!partyA || partyA.length !== 10) throw new Error("fromPhone must be a valid 10-digit India mobile")
  if (!partyB || partyB.length !== 10) throw new Error("toPhone must be a valid 10-digit India mobile")
  if (partyA === partyB) throw new Error("Party A and Party B cannot be the same number")

  const body: Record<string, string | number> = {
    party_a: partyA,
    party_b: partyB,
  }
  if (opts.timeLimitSec && opts.timeLimitSec >= 10) {
    body.max_duration_sec = Math.min(opts.timeLimitSec, 7200)
  }

  const res = await fetch(`${base}/masking/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let json: any = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Edesy non-JSON (${res.status}): ${text.slice(0, 300)}`)
  }

  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.error?.code ||
      (typeof json?.error === "string" ? json.error : null) ||
      text.slice(0, 300)
    throw new Error(`Edesy ${res.status}: ${msg}`)
  }

  const data = json.data || json
  return {
    callSid: String(data.call_sid || data.callSid || ""),
    status: String(data.status || "initiated"),
    maskedNumber: data.masked_number ? String(data.masked_number) : null,
    raw: json,
  }
}

/** Resolve Reloved ops phone for “Call user from Reloved” (primary, else backup). */
export function relovedOpsDialPhone(): string {
  return (
    digitsOnly(process.env.RELOVED_OPS_PRIMARY_PHONE || "") ||
    digitsOnly(process.env.RELOVED_OPS_BACKUP_PHONE || "") ||
    digitsOnly(process.env.BORZO_OPS_PHONE || "")
  )
}
