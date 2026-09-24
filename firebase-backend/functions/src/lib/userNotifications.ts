import { FieldValue } from "firebase-admin/firestore"
import { collections, getDb } from "./firestore"
import { findDonorProfileDoc, normalizeEmail, normalizePhoneDigits } from "./donorIdentity"

export type UserNotificationRole = "giver" | "claimer"
export type UserNotificationType =
  | "item_dropped"
  | "item_claimed"
  | "claim_sent"
  | "claim_accepted"
  | "claim_declined"
  | "new_message"
  | "address_shared"
  | "address_confirmed"
  | "schedule_proposed"
  | "schedule_agreed"
  | "schedule_reschedule"
  | "handed_over"
  | "received"

/** All login identities that should see the same inbox (session uid + email + phone + linked emails). */
export async function notificationIdentityKeys(uid: string): Promise<string[]> {
  const ids = new Set<string>()
  const raw = String(uid || "").trim()
  if (raw) ids.add(raw)

  const email = normalizeEmail(raw)
  if (email) ids.add(email)
  const phoneFromUid = normalizePhoneDigits(raw)
  if (phoneFromUid) ids.add(phoneFromUid)

  const profile = await findDonorProfileDoc(getDb(), uid)
  const data = profile?.data()
  const profileEmail = normalizeEmail(data?.email as string | undefined)
  const profilePhone = normalizePhoneDigits(data?.phone as string | undefined)
  const profileTarget = String(data?.target || "").trim()
  if (profileEmail) ids.add(profileEmail)
  if (profilePhone) ids.add(profilePhone)
  if (profileTarget) ids.add(profileTarget)
  if (Array.isArray(data?.linkedEmails)) {
    for (const e of data!.linkedEmails) {
      const linked = normalizeEmail(e)
      if (linked) ids.add(linked)
    }
  }
  return [...ids].filter(Boolean)
}

/**
 * Write one alert per identity key so phone-login and email-login see the same inbox.
 * Idempotent per (target, type, role, requestId).
 */
export async function pushUserNotification(opts: {
  donorTarget: string | null | undefined
  /** Extra emails/phones/uids that should also receive this alert (e.g. submission.email). */
  alsoTargets?: Array<string | null | undefined>
  role: UserNotificationRole
  type: UserNotificationType
  title: string
  body: string
  href: string
  itemTitle?: string
  requestId?: string
}): Promise<void> {
  const seed = String(opts.donorTarget || "").trim()
  const extras = (opts.alsoTargets || []).map((t) => String(t || "").trim()).filter(Boolean)
  if (!seed && extras.length === 0) return

  const db = getDb()
  const targets = new Set<string>()
  for (const s of [seed, ...extras]) {
    if (!s) continue
    for (const id of await notificationIdentityKeys(s)) targets.add(id)
    targets.add(s)
    const email = normalizeEmail(s)
    if (email) targets.add(email)
    const phone = normalizePhoneDigits(s)
    if (phone) targets.add(phone)
  }

  for (const donorTarget of targets) {
    try {
      if (opts.requestId) {
        const existing = await db
          .collection(collections.userNotifications)
          .where("donorTarget", "==", donorTarget)
          .where("type", "==", opts.type)
          .where("role", "==", opts.role)
          .where("requestId", "==", opts.requestId)
          .limit(1)
          .get()
        if (!existing.empty) continue
      }

      await db.collection(collections.userNotifications).add({
        donorTarget,
        role: opts.role,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        href: opts.href,
        itemTitle: opts.itemTitle || null,
        requestId: opts.requestId || null,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      console.error("pushUserNotification write failed", { donorTarget, type: opts.type, err })
    }
  }
}

export function serializeUserNotification(
  id: string,
  data: FirebaseFirestore.DocumentData
) {
  return {
    id,
    role: data.role || "claimer",
    type: data.type || "item_claimed",
    title: data.title || "Update",
    body: data.body || "",
    href: data.href || "/account",
    itemTitle: data.itemTitle || null,
    requestId: data.requestId || null,
    read: Boolean(data.read),
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
  }
}
