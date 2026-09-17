/**
 * Shared privacy checks for peer chat and related copy.
 * Peer threads: hard-reject phones / emails / flat-wing detail.
 * Reloved↔user threads: callers soft-warn on the client only.
 */

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const HOUSING_RE = /\b(flat|wing|apt\.?|apartment|floor\s*\d|#\s*\d+)\b/i

export const PEER_CHAT_BLOCK_MESSAGE =
  "Share building or landmark only — no phone, flat, or wing."

export type PrivacyHit = "phone" | "email" | "housing" | null

function hasIndianMobile(text: string): boolean {
  const compact = String(text || "").replace(/[\s\-().]/g, "")
  return /(?:\+?91)?[6-9]\d{9}/.test(compact)
}

export function detectSensitiveChatText(text: string): PrivacyHit {
  const raw = String(text || "")
  if (!raw.trim()) return null
  if (hasIndianMobile(raw)) return "phone"
  if (EMAIL_RE.test(raw)) return "email"
  if (HOUSING_RE.test(raw)) return "housing"
  return null
}

/** True when peer chat must reject this message. */
export function peerChatTextBlocked(text: string): boolean {
  return detectSensitiveChatText(text) != null
}

/** Strip Gemini/Vertex/provider detail from client-facing errors. */
export function sanitizePublicError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : ""
  const lower = msg.toLowerCase()
  if (
    !msg ||
    lower.includes("gemini") ||
    lower.includes("vertex") ||
    lower.includes("api key") ||
    lower.includes("resource_exhausted") ||
    lower.includes("generativelanguage") ||
    /\b(429|500|502|503)\b/.test(msg) ||
    lower.includes("quota") ||
    msg.length > 160
  ) {
    return fallback
  }
  // Allow short, already-friendly product copy through.
  if (/^[A-Za-z0-9 ,.'’!?-]{8,160}$/.test(msg) && !lower.includes("http")) {
    return msg
  }
  return fallback
}

export const PHOTO_ANALYZE_PUBLIC_ERROR =
  "Photo AI is busy right now. You can continue and fill details manually."
