import { Firestore } from "firebase-admin/firestore"
import { collections } from "./firestore"

/**
 * A donor can log in via email one session and phone another. Both point at
 * the same person, so resolve to a single profile doc by whichever identity
 * matches — session target, its email field, or its phone field.
 */
export async function findDonorProfileDoc(db: Firestore, identity: string, extraPhone?: string | null) {
  const trimmed = identity.trim()
  const isEmail = trimmed.includes("@")
  const email = isEmail ? trimmed.toLowerCase() : null
  const phone = isEmail ? null : trimmed.replace(/\D/g, "")

  const byTarget = await db.collection(collections.donorProfiles).where("target", "==", trimmed).limit(1).get()
  if (!byTarget.empty) return byTarget.docs[0]

  if (email) {
    const byEmail = await db.collection(collections.donorProfiles).where("email", "==", email).limit(1).get()
    if (!byEmail.empty) return byEmail.docs[0]
  }
  if (phone) {
    const byPhone = await db.collection(collections.donorProfiles).where("phone", "==", phone).limit(1).get()
    if (!byPhone.empty) return byPhone.docs[0]
  }
  if (extraPhone && extraPhone !== phone) {
    const byExtraPhone = await db.collection(collections.donorProfiles).where("phone", "==", extraPhone).limit(1).get()
    if (!byExtraPhone.empty) return byExtraPhone.docs[0]
  }
  return null
}
