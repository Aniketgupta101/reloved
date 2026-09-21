import type { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore"
import { collections, getDb } from "./firestore"
import { findDonorProfileDoc } from "./donorIdentity"

export type DonorMatchKeys = {
  identities: Set<string>
  phones: Set<string>
  target: string
}

/** Same identity rules as GET /submissions — phone/email linked accounts own their drops. */
export async function collectDonorMatchKeys(
  db: ReturnType<typeof getDb>,
  target: string
): Promise<DonorMatchKeys> {
  const profileDoc = await findDonorProfileDoc(db, target)
  const profile = profileDoc?.data() || null
  const identities = new Set(
    [target, profile?.phone, profile?.email, typeof target === "string" && target.includes("@") ? target : null]
      .filter((v): v is string => Boolean(v))
      .map((v) => v.trim().toLowerCase())
  )
  const phones = new Set(
    [profile?.phone, typeof target === "string" && !target.includes("@") ? target : null]
      .filter((v): v is string => Boolean(v))
      .map((v) => String(v).replace(/\D/g, "").slice(-10))
      .filter((v) => v.length >= 10)
  )

  // Phones used on take-requests for this account often match earlier drops
  // that weren't linked (before donorTarget existed).
  const reqSnap = await db
    .collection(collections.itemRequests)
    .where("requesterTarget", "==", target)
    .limit(30)
    .get()
  for (const r of reqSnap.docs) {
    const p = String(r.data().requesterPhone || "").replace(/\D/g, "").slice(-10)
    if (p.length >= 10) phones.add(p)
  }

  return { identities, phones, target }
}

export function submissionOwnedByDonor(data: DocumentData, keys: DonorMatchKeys): boolean {
  const donorTarget = String(data.donorTarget || "").trim()
  if (donorTarget && (donorTarget === keys.target || keys.identities.has(donorTarget.toLowerCase()))) {
    return true
  }
  const donorDigits = donorTarget.replace(/\D/g, "").slice(-10)
  if (donorDigits.length >= 10 && keys.phones.has(donorDigits)) return true
  const email = String(data.email || "").trim().toLowerCase()
  if (email && keys.identities.has(email)) return true
  const phone = String(data.phone || "").replace(/\D/g, "").slice(-10)
  if (phone && keys.phones.has(phone)) return true
  return false
}

/**
 * Indexed lookups instead of scanning donationSubmissions.
 * Covers donorTarget / email / phone identity variants.
 */
export async function fetchOwnedSubmissionDocs(
  db: ReturnType<typeof getDb>,
  keys: DonorMatchKeys
): Promise<QueryDocumentSnapshot[]> {
  const byId = new Map<string, QueryDocumentSnapshot>()

  const addSnap = async (field: string, value: string) => {
    const v = String(value || "").trim()
    if (!v) return
    const snap = await db.collection(collections.donationSubmissions).where(field, "==", v).limit(50).get()
    for (const d of snap.docs) byId.set(d.id, d)
  }

  const tasks: Promise<void>[] = [addSnap("donorTarget", keys.target)]

  for (const id of keys.identities) {
    if (id !== keys.target.toLowerCase()) tasks.push(addSnap("donorTarget", id))
    if (id.includes("@")) tasks.push(addSnap("email", id))
  }

  for (const phone of keys.phones) {
    tasks.push(addSnap("phone", phone))
    tasks.push(addSnap("donorTarget", phone))
  }

  await Promise.all(tasks)

  return [...byId.values()].filter((d) => submissionOwnedByDonor(d.data(), keys))
}

/** Item ids owned by this giver (via their submissions). */
export async function fetchOwnedItemIds(
  db: ReturnType<typeof getDb>,
  submissionIds: string[]
): Promise<Map<string, string>> {
  const itemIdToSubmissionId = new Map<string, string>()
  await Promise.all(
    submissionIds.map(async (sid) => {
      const snap = await db
        .collection(collections.items)
        .where("submissionId", "==", sid)
        .limit(20)
        .get()
      for (const doc of snap.docs) itemIdToSubmissionId.set(doc.id, sid)
    })
  )
  return itemIdToSubmissionId
}
