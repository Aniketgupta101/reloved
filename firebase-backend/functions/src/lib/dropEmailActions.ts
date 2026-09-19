import { createHmac, timingSafeEqual } from "crypto"

const ACTION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export type OpsEmailAction = "remove_wall" | "decline_claim" | "contact_user"
export type OpsEmailKind = "donation" | "claim" | "contact"

/** @deprecated use OpsEmailAction */
export type DropEmailAction = OpsEmailAction

type ActionPayload = {
  a: OpsEmailAction
  /** Subject kind — omitted on early drop tokens → treated as donation */
  k?: OpsEmailKind
  s: string
  i?: string
  exp: number
}

function secret(): string {
  return process.env.JWT_SECRET || process.env.EMAIL_ACTION_SECRET || "reloved-email-action-dev"
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8")
  return b.toString("base64url")
}

function signRaw(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url")
}

export function signOpsEmailAction(opts: {
  action: OpsEmailAction
  kind: OpsEmailKind
  subjectId: string
  itemId?: string
  ttlMs?: number
}): string {
  const payload: ActionPayload = {
    a: opts.action,
    k: opts.kind,
    s: opts.subjectId,
    i: opts.itemId || "",
    exp: Date.now() + (opts.ttlMs ?? ACTION_TTL_MS),
  }
  const payloadB64 = b64url(JSON.stringify(payload))
  return `${payloadB64}.${signRaw(payloadB64)}`
}

/** Back-compat helper for drop emails (donation + submissionId + itemId). */
export function signDropEmailAction(opts: {
  action: DropEmailAction
  submissionId: string
  itemId: string
  ttlMs?: number
}): string {
  return signOpsEmailAction({
    action: opts.action,
    kind: "donation",
    subjectId: opts.submissionId,
    itemId: opts.itemId,
    ttlMs: opts.ttlMs,
  })
}

export function verifyOpsEmailAction(token: string): (ActionPayload & { k: OpsEmailKind }) | null {
  const [payloadB64, sig] = String(token || "").split(".")
  if (!payloadB64 || !sig) return null
  const expected = signRaw(payloadB64)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as ActionPayload
    if (!payload?.a || !payload?.s || !payload?.exp) return null
    if (Date.now() > payload.exp) return null
    if (payload.a !== "remove_wall" && payload.a !== "decline_claim" && payload.a !== "contact_user") return null
    const k: OpsEmailKind =
      payload.k === "claim" || payload.k === "contact" || payload.k === "donation"
        ? payload.k
        : "donation"
    if (payload.a === "remove_wall" && k !== "donation") return null
    if (payload.a === "decline_claim" && k !== "claim") return null
    return { ...payload, k }
  } catch {
    return null
  }
}

/** @deprecated use verifyOpsEmailAction */
export function verifyDropEmailAction(token: string) {
  return verifyOpsEmailAction(token)
}

export function dropEmailActionUrl(baseUrl: string, token: string): string {
  const root = String(baseUrl || "").replace(/\/$/, "")
  return `${root}/api/ops/drop-action?t=${encodeURIComponent(token)}`
}

export function opsEmailActionUrl(baseUrl: string, token: string): string {
  return dropEmailActionUrl(baseUrl, token)
}
