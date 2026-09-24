import { FieldValue, Firestore } from "firebase-admin/firestore"
import { findDonorProfileDoc } from "./donorIdentity"
import { collections } from "./firestore"

export type ThreadSubjectType = "donation" | "claim" | "peer" | "support"

/** Canned quick-questions shown as buttons on the donor/claimer side of a thread. */
export const THREAD_QUICK_QUESTIONS: Record<ThreadSubjectType, { key: string; label: string }[]> = {
  donation: [
    { key: "where_item", label: "Where is my item now?" },
    { key: "who_pays", label: "Who pays for delivery?" },
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
  support: [],
}

function subjectCollection(subjectType: ThreadSubjectType) {
  if (subjectType === "support") {
    throw new Error("support threads do not use a subject collection")
  }
  return subjectType === "donation" ? collections.donationSubmissions : collections.itemRequests
}

/** Auto-post a templated reply for a recognised quick-question, keyed off live subject/item status. Returns null for free-text messages or unknown keys — those wait for a human. */
export const FREE_TEXT_ACK =
  "Got it — Reloved will reply here shortly. Our team has been notified."

export async function autoReplyText(
  db: Firestore,
  subjectType: ThreadSubjectType,
  subjectId: string,
  quickKey: string | undefined
): Promise<string | null> {
  if (!quickKey) return null

  // Peer threads are giver ↔ receiver only — never auto-reply as Reloved.
  if (subjectType === "peer" || subjectType === "support") {
    return null
  }

  if (subjectType === "donation") {
    const itemSnap = await db
      .collection(collections.items)
      .where("submissionId", "==", subjectId)
      .limit(1)
      .get()
    const item = itemSnap.docs[0]?.data() || {}
    const publicStatus = String(item.publicStatus || "")
    const subSnap = await db.collection(collections.donationSubmissions).doc(subjectId).get()
    const logistics = String(item.giverLogistics || subSnap.data()?.giverLogistics || "")
    switch (quickKey) {
      case "where_item":
        if (publicStatus === "reloved") return "Your item has been claimed and handed over — thank you for giving!"
        if (publicStatus === "claimed") return "Matched! Accept happened — arrange handover, then tap Handed over on your gift page."
        if (publicStatus === "being_matched") return "Someone wants to Relove your item. Open the gift page to Accept or Decline."
        if (publicStatus === "available") return "Your item is live on the Wall of Kindness, waiting to be claimed."
        return "We've got your donation and it's in review. We'll update this thread once it's live on the Wall."
      case "who_pays":
        if (logistics === "receiver_collects") {
          return "No courier fee — the claimer collects from your building gate. The item stays ₹0 free."
        }
        if (logistics === "giver_sends" || logistics === "personal_driver") {
          return "You're sending it yourself (or with your driver) — no Reloved courier fee. The item stays ₹0 free."
        }
        if (logistics === "porter_arranged") {
          return "For the first 500 Shiprocket rides, Reloved covers the prepaid fee (no COD). After that, the receiver reimburses Reloved once (~₹40–80). The item stays ₹0 free."
        }
        return "Handover fees depend on how you chose to give. Open your gift page for the exact next steps — the item itself stays ₹0 free."
      case "change_pickup":
        return "Reply here with the new building or landmark (no flat or wing) and our team will update it before any rider booking."
      case "handover_how":
        if (logistics === "receiver_collects") {
          return "Leave the bag at your building's main gate for the claimer to collect. Confirm timing in chat if you want — no courier rider."
        }
        if (logistics === "giver_sends" || logistics === "personal_driver") {
          return "Arrange delivery yourself or with your driver. Hand over at the building gate — don't ask anyone to come up to a flat. Mark Handed over on your gift page when the bag leaves."
        }
        if (logistics === "porter_arranged") {
          return "Pack the item in a bag and leave it at your building's main gate security. The Shiprocket rider collects from security only — please don't ask them to call up to a flat."
        }
        return "Open your gift page for handover steps that match how you chose to give. Prefer building gate / landmark — never share a flat number."
      default:
        return null
    }
  }

  const reqSnap = await db.collection(collections.itemRequests).doc(subjectId).get()
  const reqData = reqSnap.data() || {}
  const status = String(reqData.status || "")
  const paidBy = String(reqData.borzoPaidBy || "")
  const logistics = String(reqData.giverLogistics || "")
  switch (quickKey) {
    case "where_order":
      if (status === "approved") {
        if (logistics === "porter_arranged") {
          return "Your claim is approved. Book Shiprocket from your claim page (gate to gate). We'll update you here when the rider is on the way."
        }
        if (logistics === "receiver_collects") {
          return "Your claim is approved. Pick up at the giver’s building gate — the pickup location is on your claim page (or chat the giver if it’s missing)."
        }
        if (logistics === "giver_sends" || logistics === "personal_driver") {
          return "Your claim is approved. The giver is sending it to your saved building. Confirm your delivery building on your claim page if needed."
        }
        return "Your claim is approved. Open your claim page for handover next steps, or chat Reloved if anything looks unclear."
      }
      if (status === "rejected")
        return "We couldn't match you this time — distance or timing may not have worked. The item is back on the Wall if you'd like to browse nearby."
      return "Your request is with the giver. You'll hear when they Accept or Decline."
    case "delivery_cost":
      if (logistics === "receiver_collects") {
        return "No courier for this claim — you collect from the giver’s gate. The item stays ₹0 free."
      }
      if (logistics === "giver_sends" || logistics === "personal_driver") {
        return "The giver is sending it themselves — no Reloved courier fee. The item stays ₹0 free."
      }
      if (paidBy === "reloved_subsidy") {
        return "Reloved is covering this Shiprocket ride under the first-500 program. No COD — prepaid. The item stays ₹0 free."
      }
      if (paidBy === "receiver") {
        return "Reloved's first-500 cover is used for this ride. You reimburse Reloved once (~₹40–80). Still no COD — prepaid wallet."
      }
      if (logistics === "porter_arranged") {
        return "For the first 500 Shiprocket rides, Reloved covers delivery. After that, the receiver reimburses Reloved once (~₹40–80). No COD. Estimate on your claim page before booking."
      }
      return "Open your claim page for handover costs for this match — the item itself stays ₹0 free."
    case "change_address":
      if (logistics === "receiver_collects") {
        return "This claim is pickup at the giver’s gate — there’s no delivery address to change. Chat the giver if you need to reschedule pickup."
      }
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
  giverName?: string | null
  claimerName?: string | null
  submissionId?: string | null
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

/** Stable Firestore-safe id for Ask Reloved (support) threads keyed by session target. */
export function supportSubjectKey(ownerTarget: string): string {
  return String(ownerTarget || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "anonymous"
}

/**
 * Ask Reloved floating help — one thread per signed-in user.
 * Admin replies appear in the same popup (not email-only).
 */
export async function getOrCreateSupportThread(
  db: Firestore,
  sessionUid: string
): Promise<{ id: string; data: ThreadDoc } | { error: "FORBIDDEN" }> {
  const identities = await identitySet(db, sessionUid)
  if (identities.size === 0 && !sessionUid) return { error: "FORBIDDEN" }

  const profileDoc = await findDonorProfileDoc(db, sessionUid)
  const profile = profileDoc?.data() || null
  const ownerTarget = String(sessionUid)
  const ownerEmail =
    (profile?.email && String(profile.email)) ||
    (ownerTarget.includes("@") ? ownerTarget : null)
  const ownerName =
    String(profile?.username || profile?.firstName || profile?.name || "").trim() ||
    (ownerEmail ? ownerEmail.split("@")[0] : "Visitor")
  const subjectId = supportSubjectKey(ownerTarget)
  const ref = db.collection(collections.messageThreads).doc(threadDocId("support", subjectId))
  const existing = await ref.get()
  if (existing.exists) {
    const data = existing.data() as ThreadDoc
    const patch: Record<string, unknown> = {}
    if (!data.ownerEmail && ownerEmail) patch.ownerEmail = ownerEmail
    if (!data.ownerName && ownerName) patch.ownerName = ownerName
    if (data.ownerTarget !== ownerTarget) patch.ownerTarget = ownerTarget
    if (Object.keys(patch).length > 0) {
      await ref.set(patch, { merge: true })
      return { id: ref.id, data: { ...data, ...patch } as ThreadDoc }
    }
    return { id: ref.id, data }
  }

  const doc: ThreadDoc = {
    subjectType: "support",
    subjectId,
    itemTitle: "Ask Reloved",
    ownerTarget,
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
  if (subjectType === "support" || subjectType === "peer") {
    return { error: "NOT_FOUND" }
  }
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
  const raw = [
    uid,
    profile?.data()?.email,
    profile?.data()?.phone,
    profile?.data()?.target,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim())
  const out = new Set<string>()
  for (const v of raw) {
    out.add(v.toLowerCase())
    const digits = v.replace(/\D/g, "")
    if (digits.length >= 10) out.add(digits)
  }
  return out
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
  if (existing.exists) {
    const data = existing.data() as ThreadDoc
    // Patch sparse targets so later peerPartyForSession / canAccess still work.
    const patch: Record<string, string> = {}
    if (!data.giverTarget && giverTarget) patch.giverTarget = giverTarget
    if (!data.claimerTarget && claimerTarget) patch.claimerTarget = claimerTarget
    if (!data.submissionId && submissionId) patch.submissionId = submissionId
    if (Object.keys(patch).length > 0) {
      await ref.set(patch, { merge: true })
      return { id: ref.id, data: { ...data, ...patch }, party }
    }
    return { id: ref.id, data, party }
  }

  const doc: ThreadDoc = {
    subjectType: "peer",
    subjectId: claimId,
    itemTitle: String(claim.itemTitle || item.title || "your item"),
    ownerTarget: claimerTarget,
    ownerName: String(claim.requesterName || "there"),
    ownerEmail: claimerTarget.includes("@") ? claimerTarget : null,
    giverTarget,
    claimerTarget,
    submissionId: submissionId || null,
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

  // Fallback: resolve against live claim/item when thread targets were empty/stale.
  const claimId = String(thread.subjectId || "")
  if (!claimId) return null
  const resolved = await getOrCreatePeerThread(db, claimId, sessionUid)
  if ("error" in resolved) return null
  return resolved.party
}

export async function canAccessThread(
  db: Firestore,
  thread: FirebaseFirestore.DocumentData,
  sessionUid: string
): Promise<boolean> {
  if (thread.subjectType === "peer") {
    return (await peerPartyForSession(db, thread, sessionUid)) != null
  }
  if (thread.subjectType === "support") {
    const identities = await identitySet(db, sessionUid)
    return inSet(identities, thread.ownerTarget) || thread.ownerTarget === sessionUid
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
          // Surface peer activity on admin Peer Chats (abuse / safety monitor).
          unreadForAdmin: msg.senderRole === "donor" || msg.senderRole === "claimer",
        }
      : null
  // Reloved threads: owner message marks unread for admin. System ack must NOT clear that.
  // Admin reply clears admin unread and pings the owner.
  const relovedUnread =
    subjectType === "peer"
      ? null
      : isFromOwner
        ? { unreadForAdmin: true, unreadForOwner: false }
        : msg.senderRole === "admin"
          ? { unreadForAdmin: false, unreadForOwner: true }
          : {}
  await ref.set(
    {
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessagePreview: msg.text.slice(0, 140),
      ...(peerUnread || relovedUnread || {}),
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
    giverTarget: data.giverTarget || null,
    claimerTarget: data.claimerTarget || null,
    giverName: data.giverName || null,
    claimerName: data.claimerName || data.ownerName || null,
    submissionId: data.submissionId || null,
    lastMessageAt: toIso(data.lastMessageAt),
    lastMessagePreview: data.lastMessagePreview,
    unreadForAdmin: !!data.unreadForAdmin,
    unreadForOwner: !!data.unreadForOwner,
    unreadForGiver: !!data.unreadForGiver,
    unreadForClaimer: !!data.unreadForClaimer,
  }
}

/**
 * Ops opens a peer (giver ↔ claimer) thread for monitoring without being a party.
 * Creates the shell if the matched claim exists but nobody has opened chat yet.
 */
export async function getOrCreatePeerThreadForAdmin(
  db: Firestore,
  claimId: string
): Promise<{ id: string; data: ThreadDoc } | { error: "NOT_FOUND" | "NOT_APPROVED" }> {
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

  const giverTarget = String(sub?.donorTarget || sub?.email || sub?.phone || item.donorTarget || "")
  const claimerTarget = String(claim.requesterTarget || claim.requesterPhone || "")
  const giverName = String(sub?.firstName || sub?.name || "Giver")
  const claimerName = String(claim.requesterName || "Claimer")

  const ref = db.collection(collections.messageThreads).doc(threadDocId("peer", claimId))
  const existing = await ref.get()
  if (existing.exists) {
    const data = existing.data() as ThreadDoc
    const patch: Record<string, string> = {}
    if (!data.giverTarget && giverTarget) patch.giverTarget = giverTarget
    if (!data.claimerTarget && claimerTarget) patch.claimerTarget = claimerTarget
    if (!data.submissionId && submissionId) patch.submissionId = submissionId
    if (!data.giverName && giverName) patch.giverName = giverName
    if (!data.claimerName && claimerName) patch.claimerName = claimerName
    if (Object.keys(patch).length > 0) {
      await ref.set(patch, { merge: true })
      return { id: ref.id, data: { ...data, ...patch } }
    }
    return { id: ref.id, data }
  }

  const doc: ThreadDoc = {
    subjectType: "peer",
    subjectId: claimId,
    itemTitle: String(claim.itemTitle || item.title || "your item"),
    ownerTarget: claimerTarget,
    ownerName: claimerName,
    ownerEmail: claimerTarget.includes("@") ? claimerTarget : null,
    giverTarget,
    claimerTarget,
    giverName,
    claimerName,
    submissionId: submissionId || null,
    lastMessageAt: FieldValue.serverTimestamp(),
    lastMessagePreview: "",
    unreadForAdmin: false,
    unreadForOwner: false,
    unreadForGiver: false,
    unreadForClaimer: false,
    createdAt: FieldValue.serverTimestamp(),
  }
  await ref.set(doc)
  return { id: ref.id, data: doc }
}
