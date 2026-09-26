/**
 * Repair Wall publicArea:
 * 1) Prefer this drop's pickupLocality suburb (where the item actually is)
 * 2) Fall back to giver profile address when pickup has no recognisable suburb
 */
import { FieldValue } from "firebase-admin/firestore"
import { collections, getDb } from "../lib/firestore"
import { ensureFirebaseApp } from "../lib/firebaseApp"
import { isRecognisablePublicArea, toPublicArea } from "../lib/geo"

function argFlag(name: string): boolean {
  return process.argv.includes(name)
}

async function main() {
  const dryRun = argFlag("--dry-run")
  ensureFirebaseApp()
  const db = getDb()

  const profiles = await db.collection(collections.donorProfiles).get()
  const addressByTarget = new Map<string, string>()
  for (const doc of profiles.docs) {
    const d = doc.data()
    const target = String(d.target || "").trim().toLowerCase()
    const address = String(d.address || "").trim()
    if (!target || address.length < 2) continue
    addressByTarget.set(target, address)
    const email = String(d.email || "").trim().toLowerCase()
    if (email.includes("@")) addressByTarget.set(email, address)
  }

  const items = await db.collection(collections.items).limit(2000).get()
  let checked = 0
  let changed = 0

  for (const doc of items.docs) {
    checked++
    const data = doc.data()
    const target = String(data.donorTarget || data.donorEmail || "")
      .trim()
      .toLowerCase()
    const pickup = String(data.pickupLocality || "").trim()
    const profileAddress = target ? addressByTarget.get(target) : undefined

    const fromProfile = profileAddress ? toPublicArea(profileAddress) : ""
    const fromPickup = pickup ? toPublicArea(pickup) : ""
    let next = ""
    if (isRecognisablePublicArea(fromPickup)) next = fromPickup
    else if (isRecognisablePublicArea(fromProfile)) next = fromProfile
    else next = fromPickup || fromProfile || toPublicArea(String(data.locality || ""))

    const prev = String(data.publicArea || data.locality || "").trim()
    if (!next || prev === next) continue

    console.log(`${doc.id} · ${String(data.title || "").slice(0, 40)}`)
    console.log(
      `  ${prev} → ${next}${isRecognisablePublicArea(fromPickup) ? " (pickup)" : " (profile)"}`,
    )

    if (!dryRun) {
      await doc.ref.set(
        {
          locality: next,
          publicArea: next,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      const sid = String(data.submissionId || "").trim()
      if (sid) {
        await db
          .collection(collections.donationSubmissions)
          .doc(sid)
          .set({ publicArea: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      }
    }
    changed++
  }

  console.log(JSON.stringify({ checked, changed, dryRun }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
