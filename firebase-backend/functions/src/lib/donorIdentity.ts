import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore"
import { collections } from "./firestore"

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = String(value || "")
    .trim()
    .toLowerCase()
  return email.includes("@") ? email : null
}

/** Last 10 digits ù Indian mobiles; ignores +91 / formatting. */
export function normalizePhoneDigits(value: string | null | undefined): string | null {
  const digits = String(value || "").replace(/\D/g, "")
  if (digits.length < 10) return null
  return digits.slice(-10)
}

function createdAtMs(doc: DocumentSnapshot): number {
  const v = doc.data()?.createdAt
  const ms = v?.toMillis?.() ?? (Date.parse(String(v || "")) || 0)
  return Number.isFinite(ms) ? ms : 0
}

/** Prefer the oldest profile when several match (first account wins). */
function pickFirstAccount(docs: DocumentSnapshot[]): DocumentSnapshot | null {
  if (!docs.length) return null
  return [...docs].sort((a, b) => createdAtMs(a) - createdAtMs(b) || a.id.localeCompare(b.id))[0]
}

async function findProfilesByPhone(db: Firestore, phoneRaw: string): Promise<DocumentSnapshot[]> {
  const phone = normalizePhoneDigits(phoneRaw)
  if (!phone) return []
  const [byPhone, byTarget] = await Promise.all([
    db.collection(collections.donorProfiles).where("phone", "==", phone).limit(20).get(),
    db.collection(collections.donorProfiles).where("target", "==", phone).limit(20).get(),
  ])
  const map = new Map<string, DocumentSnapshot>()
  for (const snap of [byPhone, byTarget]) {
    for (const doc of snap.docs) map.set(doc.id, doc)
  }
  return [...map.values()]
}

/**
 * Resolve the donor profile for a session identity.
 *
 * Rules:
 * - Email is unique. Phone is unique.
 * - Login via email OR phone that belong to the same person ? that one account.
 * - If several docs somehow share a phone, return the **first** (oldest) account.
 */
export async function findDonorProfileDoc(db: Firestore, identity: string, extraPhone?: string | null) {
  const trimmed = String(identity || "").trim()
  if (!trimmed) return null

  const email = normalizeEmail(trimmed)
  const phone = email ? null : normalizePhoneDigits(trimmed)

  const byTarget = await db.collection(collections.donorProfiles).where("target", "==", trimmed).limit(1).get()
  if (!byTarget.empty) return byTarget.docs[0]

  if (email && email !== trimmed) {
    const byTargetEmail = await db.collection(collections.donorProfiles).where("target", "==", email).limit(1).get()
    if (!byTargetEmail.empty) return byTargetEmail.docs[0]
  }

  if (email) {
    const byEmail = await db.collection(collections.donorProfiles).where("email", "==", email).limit(5).get()
    if (!byEmail.empty) return pickFirstAccount(byEmail.docs)

    // Secondary Google emails stored on the primary profile.
    const byLinked = await db
      .collection(collections.donorProfiles)
      .where("linkedEmails", "array-contains", email)
      .limit(5)
      .get()
    if (!byLinked.empty) return pickFirstAccount(byLinked.docs)
  }

  if (phone) {
    const phoneDocs = await findProfilesByPhone(db, phone)
    const first = pickFirstAccount(phoneDocs)
    if (first) return first
  }

  if (extraPhone) {
    const phoneDocs = await findProfilesByPhone(db, extraPhone)
    const first = pickFirstAccount(phoneDocs)
    if (first) return first
  }

  return null
}

/** First (oldest) profile that already owns this phone, if any. */
export async function findFirstProfileByPhone(db: Firestore, phoneRaw: string) {
  return pickFirstAccount(await findProfilesByPhone(db, phoneRaw))
}

export async function isEmailTakenByOtherProfile(
  db: Firestore,
  emailRaw: string,
  exceptDocId?: string | null
): Promise<boolean> {
  const email = normalizeEmail(emailRaw)
  if (!email) return false

  const [byEmail, byTarget, byLinked] = await Promise.all([
    db.collection(collections.donorProfiles).where("email", "==", email).limit(5).get(),
    db.collection(collections.donorProfiles).where("target", "==", email).limit(5).get(),
    db.collection(collections.donorProfiles).where("linkedEmails", "array-contains", email).limit(5).get(),
  ])

  for (const snap of [byEmail, byTarget, byLinked]) {
    for (const doc of snap.docs) {
      if (exceptDocId && doc.id === exceptDocId) continue
      return true
    }
  }
  return false
}

export async function isPhoneTakenByOtherProfile(
  db: Firestore,
  phoneRaw: string,
  exceptDocId?: string | null
): Promise<boolean> {
  const docs = await findProfilesByPhone(db, phoneRaw)
  return docs.some((doc) => !exceptDocId || doc.id !== exceptDocId)
}

export const PHONE_ALREADY_EXISTS_MESSAGE =
  "This number already exists. Use another number for further process."
