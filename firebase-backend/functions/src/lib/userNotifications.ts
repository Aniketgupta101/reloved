import { FieldValue } from "firebase-admin/firestore"
import { collections, getDb } from "./firestore"
import { findDonorProfileDoc } from "./donorIdentity"

export type UserNotificationRole = "giver" | "claimer"
export type UserNotificationType =
  | "item_claimed"
  | "claim_sent"
  | "claim_accepted"
  | "claim_declined"
  | "new_message"
  | "address_shared"
  | "handed_over"
  | "received"

export async function notificationIdentityKeys(uid: string): Promise<string[]> {
  const ids = new Set<string>([uid])
  const profile = await findDonorProfileDoc(getDb(), uid)
  const data = profile?.data()
  const email = String(data?.email || "").trim().toLowerCase()
  const phone = String(data?.phone || "").replace(/\D/g, "").slice(-10)
  if (email) ids.add(email)
  if (phone) ids.add(phone)
  return [...ids]
}

export async function pushUserNotification(opts: {
  donorTarget: string | null | undefined
  role: UserNotificationRole
  type: UserNotificationType
  title: string
  body: string
  href: string
  itemTitle?: string
  requestId?: string
}): Promise<void> {
  const donorTarget = String(opts.donorTarget || "").trim()
  if (!donorTarget) return
  await getDb()
    .collection(collections.userNotifications)
    .add({
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
