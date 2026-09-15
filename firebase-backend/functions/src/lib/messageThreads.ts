import { FieldValue, Firestore } from "firebase-admin/firestore"
import { findDonorProfileDoc } from "./donorIdentity"
import { collections } from "./firestore"

export type ThreadSubjectType = "donation" | "claim" | "peer"

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
  peer: [
    { key: "handover_when", label: "When can we do the handover?" },
    { key: "at_gate", label: "I'm at the building gate" },
    { key: "share_landmark", label: "Here's a landmark to find me" },
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

  // Peer threads are giver ↔ receiver only — never auto-reply as Reloved.
  if (subjectType === "peer") {
    switch (quickKey) {
      case "handover_when":
        return null
      case "at_gate":
        return null
      case "share_landmark":
        return null
      default:
        return null
    }
  }

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
        if (publicStatus === "claimed") return "Matched! Accept happened — arrange handover, then tap Handed over on your gift page."
        if (publicStatus === "being_matched") return "Someone wants to Relove your item. Open the gift page to Accept or Decline."
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
  giverTarget?: string | null
  claimerTarget?: string | null
  lastMessageAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue
  lastMessagePreview: string
  unreadForAdmin: boolean
  unreadForOwner: boolean
  unreadForGiver?: boolean
  unreadForClaimer?: boolean
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

async function identitySet(db: Firestore, uid: string): Promise<Set<string>> {
  const profile = await findDonorProfileDoc(db, uid)
  return new Set(
    [uid, profile?.data()?.email, profile?.data()?.phone, profile?.data()?.target]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase())
  )
}

function inSet(identities: Set<string>, value: unknown): boolean {
  const raw = String(value || "").trim()
  if (!raw) return false
  if (identities.has(raw.toLowerCase())) return true
  const digits = raw.replace(/\D/g, "")
  return digits.length >= 10 && [...identities].some((id) => id.replace(/\D/g, "") === digits)
}

export type PeerParty = "giver" | "claimer"

/**
 * Giver ↔ receiver thread for an accepted (matched) claim.
 * Reloved ops is not a participant — they use donation/claim threads instead.
 */
export async function getOrCreatePeerThread(
  db: Firestore,
  claimId: string,
  sessionUid: string
): Promise<
  | { id: string; data: ThreadDoc; party: PeerParty }
  | { error: "NOT_FOUND" | "FORBIDDEN" | "NOT_APPROVED" }
> {
  const claimSnap = await db.collection(collections.itemRequests).doc(claimId).get()
  if (!claimSnap.exists) return { error: "NOT_FOUND" }
  const claim = claimSnap.data()!
  if (String(claim.status) !== "approved") return { error: "NOT_APPROVED" }

  const itemSnap = await db.collection(collections.items).doc(String(claim.itemId)).get()
  if (!itemSnap.exists) return { error: "NOT_FOUND" }
  const item = itemSnap.data()!
  const submissionId = String(item.submissionId || "")
  const subSnap = submissionId ? await db.collection(collections.donationSubmissions).doc(submissionId).get() : null
  const sub = subSnap?.exists ? subSnap.data()! : null

  const identities = await identitySet(db, sessionUid)
  const isClaimer = inSet(identities, claim.requesterTarget) || inSet(identities, claim.requesterPhone)
  const isGiver =
    inSet(identities, sub?.donorTarget) ||
    inSet(identities, sub?.email) ||
    inSet(identities, sub?.phone) ||
    // Item may also store giver linkage when submission is sparse
    inSet(identities, item.donorTarget) ||
    inSet(identities, item.donorEmail)

  if (!isClaimer && !isGiver) return { error: "FORBIDDEN" }

  const giverTarget = String(sub?.donorTarget || sub?.email || sub?.phone || item.donorTarget || "")
  const claimerTarget = String(claim.requesterTarget || claim.requesterPhone || "")
  const party: PeerParty = isGiver && !isClaimer ? "giver" : isClaimer ? "claimer" : "giver"

  const ref = db.collection(collections.messageThreads).doc(threadDocId("peer", claimId))
  const existing = await ref.get()
  if (existing.exists) return { id: ref.id, data: existing.data() as ThreadDoc, party }

  const doc: ThreadDoc = {
    subjectType: "peer",
    subjectId: claimId,
    itemTitle: String(claim.itemTitle || item.title || "your item"),
    ownerTarget: claimerTarget,
    ownerName: String(claim.requesterName || "there"),
    ownerEmail: claimerTarget.includes("@") ? claimerTarget : null,
    giverTarget,
    claimerTarget,
    lastMessageAt: FieldValue.serverTimestamp(),
    lastMessagePreview: "",
    unreadForAdmin: false,
    unreadForOwner: false,
    unreadForGiver: false,
    unreadForClaimer: false,
    createdAt: FieldValue.serverTimestamp(),
  }
  await ref.set(doc)
  return { id: ref.id, data: doc, party }
}

export async function peerPartyForSession(
  db: Firestore,
  thread: FirebaseFirestore.DocumentData,
  sessionUid: string
): Promise<PeerParty | null> {
  if (thread.subjectType !== "peer") return null
  const identities = await identitySet(db, sessionUid)
  if (inSet(identities, thread.giverTarget)) return "giver"
  if (inSet(identities, thread.claimerTarget) || inSet(identities, thread.ownerTarget)) return "claimer"
  return null
}

export async function canAccessThread(
  db: Firestore,
  thread: FirebaseFirestore.DocumentData,
  sessionUid: string
): Promise<boolean> {
  if (thread.subjectType === "peer") {
    return (await peerPartyForSession(db, thread, sessionUid)) != null
  }
  if (thread.ownerTarget === sessionUid) return true
  const identities = await identitySet(db, sessionUid)
  return inSet(identities, thread.ownerTarget)
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
  const threadSnap = await ref.get()
  const subjectType = String(threadSnap.data()?.subjectType || "")
  const peerUnread =
    subjectType === "peer"
      ? {
          unreadForGiver: msg.senderRole === "claimer",
          unreadForClaimer: msg.senderRole === "donor",
          unreadForOwner: msg.senderRole === "donor",
          unreadForAdmin: false,
        }
      : {
          unreadForAdmin: isFromOwner,
          unreadForOwner: !isFromOwner,
        }
  await ref.set(
    {
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessagePreview: msg.text.slice(0, 140),
      ...peerUnread,
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
    unreadForGiver: !!data.unreadForGiver,
    unreadForClaimer: !!data.unreadForClaimer,
  }
}
