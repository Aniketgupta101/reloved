/**
 * Identities excluded from admin Analytics (internal / QA testers).
 * Match is case-insensitive on email, phone, username, display name, targets.
 */
const TESTER_EMAILS = new Set([
  "relovedtotem@gmail.com",
  "relovetotem@gmail.com",
  "aniketgupta83003@gmail.com",
  "aniketg266@gmail.com",
  "aniket@toteminteractive.in",
  "d59521117@gmail.com",
  "developersweberex@gmail.com",
  "pradeeptotem@gmail.com",
  "prajapatipradeep14602@gmail.com",
  "totemisnottaken@gmail.com",
  "totemistaken@gmail.com", // legacy — keep filtered from analytics
])

const TESTER_PHONES = new Set([
  "7304382922", // relovedtotem / Aniket Gupta test
  "9819530225", // aniketg266
  "7400399677", // developersweberex
  "9004819557", // Pradeep Totem E2E
])

/** Substring hits on name / username / email local-part. */
const TESTER_NAME_PARTS = ["aniket", "warrior", "reloved_totem", "reloved totem", "relovedtotem"]

function phone10(v: unknown): string {
  const d = String(v || "").replace(/\D/g, "")
  return d.length >= 10 ? d.slice(-10) : d
}

function norm(v: unknown): string {
  return String(v || "")
    .trim()
    .toLowerCase()
}

/**
 * True if any identity field looks like a known tester.
 * Pass whatever you have (email, phone, username, name, donorTarget, etc.).
 */
export function isTesterIdentity(...parts: unknown[]): boolean {
  for (const part of parts) {
    if (part == null) continue
    if (Array.isArray(part)) {
      if (part.some((p) => isTesterIdentity(p))) return true
      continue
    }
    const s = norm(part)
    if (!s) continue

    if (s.includes("@")) {
      if (TESTER_EMAILS.has(s)) return true
      // any +alias under aniket* / warrior*
      const local = s.split("@")[0] || ""
      if (local.startsWith("aniket") || local.includes("warrior") || local.includes("relovedtotem")) {
        return true
      }
    }

    const phone = phone10(s)
    if (phone && TESTER_PHONES.has(phone)) return true

    if (TESTER_NAME_PARTS.some((p) => s.includes(p))) return true
  }
  return false
}

/** Collect all identity strings from a Firestore-ish doc for tester matching. */
export function identityPartsFromDoc(data: Record<string, unknown>): unknown[] {
  return [
    data.email,
    data.donorEmail,
    data.requesterEmail,
    data.phone,
    data.donorPhone,
    data.requesterPhone,
    data.target,
    data.donorTarget,
    data.requesterTarget,
    data.username,
    data.name,
    data.donorFirstName,
    data.requesterName,
    data.displayName,
    data.linkedEmails,
  ]
}

export function isTesterDoc(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return false
  return isTesterIdentity(...identityPartsFromDoc(data))
}
