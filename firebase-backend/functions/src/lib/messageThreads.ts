import { FieldValue, Firestore } from "firebase-admin/firestore"
import { collections } from "./firestore"

export type ThreadSubjectType = "donation" | "claim"

/** Canned quick-questions shown as buttons on the donor/claimer side of a thread. */
export const THREAD_QUICK_QUESTIONS: Record<ThreadSubjectType, { key: string; label: string }[]> = {
  donation: [
    { key: "where_item", label: "Where is my item now?" },
    { key: "who_pays", label: "Who pays for Borzo delivery?" },
    { key: "change_pickup", label: "Can I change my pickup building/time?" },
    { key: "handover_how", label: "How do I hand it over?" },
  ],
  claim: [
    { key: "where_order", label: "Where is my order?" },
    { key: "delivery_cost", label: "How much will delivery cost?" },
    { key: "change_address", label: "Can I change my delivery address?" },
  ],
}

function subjectCollection(subjectType: ThreadSubjectType) {
  return subjectType === "donation" ? collections.donationSubmissions : collections.itemRequests
}

/** Auto-post a templated reply for a recognised quick-question, keyed off live subject/item status. Returns null for free-text messages or unknown keys — those wait for a human. */
export async function autoReplyText(
  db: Firestore,
  subjectType: ThreadSubjectType,
  subjectId: string,
  quickKey: string | undefined
): Promise<string | null> {
  if (!quickKey) return null

  if (subjectType === "donation") {
    const itemSnap = await db
      .collection(collections.items)
      .where("submissionId", "==", subjectId)
      .limit(1)
      .get()
    const publicStatus = String(itemSnap.docs[0]?.data()?.publicStatus || "")
    switch (quickKey) {
      case "where_item":
        if (publicStatus === "reloved") return "Your item has been claimed and handed over — thank you for giving!"
        if (publicStatus === "being_matched") return "Someone has requested your item. Our team is arranging Borzo pickup — we'll confirm the rider here."
        if (publicStatus === "available") return "Your item is live on the Wall of Kindness, waiting to be claimed."
        return "We've got your donation and it's in review. We'll update this thread once it's live on the Wall."
      case "who_pays":
        return "You (the giver) pay Borzo once for that ride — typically ₹40–80 in Mumbai. Reloved doesn't take a cut. Flow is giver → Borzo → claimer."
      case "change_pickup":
        return "Reply here with the new building or landmark (no flat or wing) and our team will update it before booking the rider."
      case "handover_how":
        return "Pack the item in a bag and hand it to your building's main gate security. Our rider collects from security only — please don't ask them to call up to a flat."
      default:
        return null
    }
  }

  const reqSnap = await db.collection(collections.itemRequests).doc(subjectId).get()
  const status = String(reqSnap.data()?.status || "")
  switch (quickKey) {
    case "where_order":
      if (status === "approved") return "Your claim is approved. Our team is coordinating Borzo with the giver — pickup from their building gate to yours. We'll update you here when the rider is on the way."
      if (status === "rejected") return "This claim wasn't approved. Check the Wall for other available items."
      return "Your request is still under review (24-48h). We'll update this thread as soon as it's decided."
    case "delivery_cost":
      return "You don't pay delivery. The item and Borzo ride are covered by the giver (typically ₹40–80 once). Reloved doesn't take any money in between — it's giver → Borzo → you."
    case "change_address":
      return "Reply here with your updated building or landmark (no flat or wing) and our team will update the delivery booking."
    default:
      return null
  }
}

interface ThreadDoc {
  subjectType: ThreadSubjectType
  subjectId: string
  itemTitle: string
  ownerTarget: string
  ownerName: string
  ownerEmail: string | null
  lastMessageAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue
  lastMessagePreview: string
  unreadForAdmin: boolean
  unreadForOwner: boolean
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue
}

/** Deterministic id so concurrent opens on the same subject can't spawn duplicate threads. */
export function threadDocId(subjectType: ThreadSubjectType, subjectId: string): string {
  return `${subjectType}_${subjectId}`
}

/**
 * Fetches (or lazily creates) the single thread for a donation/claim subject.
 * `requireOwnerTarget`, when set, must match the subject's owner or a 403-worthy
 * mismatch is thrown — callers on the donor side pass the session uid; admin
 * callers omit it since ops can open any thread.
 */
export async function getOrCreateThread(
  db: Firestore,
  subjectType: ThreadSubjectType,
  subjectId: string,
  requireOwnerTarget?: string
): Promise<{ id: string; data: ThreadDoc } | { error: "NOT_FOUND" | "FORBIDDEN" | "NOT_APPROVED" }> {
  const subjectSnap = await db.collection(subjectCollection(subjectType)).doc(subjectId).get()
  if (!subjectSnap.exists) return { error: "NOT_FOUND" }
  const subject = subjectSnap.data()!

  const ownerTarget = subjectType === "donation" ? String(subject.donorTarget || "") : String(subject.requesterTarget || "")
  const ownerName =
    subjectType === "donation"
      ? String(subject.donorFirstName || "there")
      : String(subject.requesterName || "there")
  const ownerEmail =
    subjectType === "donation"
      ? String(subject.email || "") || null
      : ownerTarget.includes("@")
        ? ownerTarget
        : null

  if (requireOwnerTarget) {
    const owns =
      ownerTarget === requireOwnerTarget ||
      (subjectType === "donation" &&
        String(subject.email || "").trim().toLowerCase() === requireOwnerTarget.trim().toLowerCase())
    if (!owns) return { error: "FORBIDDEN" }
    // Chat is two-way for pending + approved so Reloved can coordinate early.
    const status = String(subject.status || "")
    if (status === "rejected" || status === "cancelled") return { error: "NOT_APPROVED" }
  }

  const itemTitle =
    subjectType === "donation"
      ? String(
          (await db.collection(collections.items).where("submissionId", "==", subjectId).limit(1).get()).docs[0]?.data()
            ?.title || "your donation"
        )
      : String(subject.itemTitle || "your item")

  const ref = db.collection(collections.messageThreads).doc(threadDocId(subjectType, subjectId))
  const existing = await ref.get()
  if (existing.exists) return { id: ref.id, data: existing.data() as ThreadDoc }

  const doc: ThreadDoc = {
    subjectType,
    subjectId,
    itemTitle,
    ownerTarget: ownerTarget || requireOwnerTarget || "",
    ownerName,
    ownerEmail,
    lastMessageAt: FieldValue.serverTimestamp(),
    lastMessagePreview: "",
    unreadForAdmin: false,
    unreadForOwner: false,
    createdAt: FieldValue.serverTimestamp(),
  }
  await ref.set(doc)
  return { id: ref.id, data: doc }
}

export async function listMessages(db: Firestore, threadId: string) {
  const snap = await db
    .collection(collections.messageThreads)
    .doc(threadId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(200)
    .get()
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      senderRole: data.senderRole as string,
      senderName: data.senderName as string,
      text: data.text as string,
      quickReplyKey: (data.quickReplyKey as string | undefined) || null,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
    }
  })
}

export async function postMessage(
  db: Firestore,
  threadId: string,
  msg: { senderRole: "donor" | "claimer" | "admin" | "system"; senderName: string; text: string; quickReplyKey?: string }
) {
  const ref = db.collection(collections.messageThreads).doc(threadId)
  await ref.collection("messages").add({
    senderRole: msg.senderRole,
    senderName: msg.senderName,
    text: msg.text,
    quickReplyKey: msg.quickReplyKey || null,
    createdAt: FieldValue.serverTimestamp(),
  })
  const isFromOwner = msg.senderRole === "donor" || msg.senderRole === "claimer"
  await ref.set(
    {
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessagePreview: msg.text.slice(0, 140),
      unreadForAdmin: isFromOwner ? true : false,
      unreadForOwner: isFromOwner ? false : true,
    },
    { merge: true }
  )
}

export function serializeThread(id: string, data: ThreadDoc) {
  const toIso = (v: any) => v?.toDate?.()?.toISOString?.() || null
  return {
    id,
    subjectType: data.subjectType,
    subjectId: data.subjectId,
    itemTitle: data.itemTitle,
    ownerName: data.ownerName,
    lastMessageAt: toIso(data.lastMessageAt),
    lastMessagePreview: data.lastMessagePreview,
    unreadForAdmin: !!data.unreadForAdmin,
    unreadForOwner: !!data.unreadForOwner,
  }
}
