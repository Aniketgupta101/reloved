/**
 * One-off: pull profile pincodes for giver/claimer emails and stamp them onto
 * the open Shiprocket claim + item pickup so Book Shiprocket can succeed.
 *
 * Usage: npx ts-node src/scripts/patchClaimPincodes.ts
 *    or: npm run build && node lib/scripts/patchClaimPincodes.js
 */
import { ensureFirebaseApp } from "../lib/firebaseApp"
import { collections, getDb } from "../lib/firestore"
import { findDonorProfileDoc } from "../lib/donorIdentity"
import { extractIndiaPincode, withIndiaPincode } from "../lib/shiprocket"

const CLAIMER_EMAIL = "aniketg266@gmail.com"
const GIVER_EMAILS = ["relovedtotem@gmail.com", "relovetotem@gmail.com"]

async function main() {
  ensureFirebaseApp()
  const db = getDb()

  const claimerDoc = await findDonorProfileDoc(db, CLAIMER_EMAIL)
  if (!claimerDoc) {
    console.error("No profile for", CLAIMER_EMAIL)
    process.exit(1)
  }
  const claimer = claimerDoc.data() || {}
  const claimerPin =
    extractIndiaPincode(String(claimer.pincode || "")) ||
    extractIndiaPincode(String(claimer.address || ""))
  console.log("Claimer profile", claimerDoc.id, {
    address: claimer.address,
    pincode: claimer.pincode,
    resolvedPin: claimerPin,
  })

  let giverDoc = null as Awaited<ReturnType<typeof findDonorProfileDoc>>
  for (const email of GIVER_EMAILS) {
    giverDoc = await findDonorProfileDoc(db, email)
    if (giverDoc) {
      console.log("Giver profile via", email, giverDoc.id)
      break
    }
  }
  if (!giverDoc) {
    console.error("No profile for", GIVER_EMAILS.join(" / "))
    process.exit(1)
  }
  const giver = giverDoc.data() || {}
  const giverPin =
    extractIndiaPincode(String(giver.pincode || "")) ||
    extractIndiaPincode(String(giver.address || ""))
  console.log("Giver profile", {
    address: giver.address,
    pincode: giver.pincode,
    resolvedPin: giverPin,
  })

  if (!claimerPin || !giverPin) {
    console.error(
      "Missing pin on profile(s). Claimer pin:",
      claimerPin,
      "Giver pin:",
      giverPin,
      "\nUpdate Account → address with a 6-digit pincode (e.g. 400053), then re-run."
    )
    process.exit(1)
  }

  // Find recent approved claims involving this claimer.
  const claimsSnap = await db
    .collection(collections.itemRequests)
    .where("requesterTarget", "==", CLAIMER_EMAIL)
    .limit(20)
    .get()

  // Also search by linked targets if needed
  let claims = claimsSnap.docs
  if (claims.length === 0) {
    const all = await db.collection(collections.itemRequests).orderBy("createdAt", "desc").limit(40).get()
    claims = all.docs.filter((d) => {
      const t = String(d.data().requesterTarget || "").toLowerCase()
      return t.includes("aniketg266")
    })
  }

  console.log("Claims found:", claims.length)
  for (const doc of claims) {
    const data = doc.data()
    console.log("-", doc.id, data.status, data.itemTitle, "addr:", data.requesterAddress)
  }

  const target =
    claims.find((d) => String(d.data().status) === "approved") ||
    claims.find((d) => String(d.data().itemTitle || "").toLowerCase().includes("boss")) ||
    claims[0]

  if (!target) {
    console.error("No claim to patch")
    process.exit(1)
  }

  const claim = target.data()
  const newDrop = withIndiaPincode(String(claim.requesterAddress || claimer.address || "Mumbai"), claimerPin)
  await target.ref.set({ requesterAddress: newDrop, updatedAt: new Date() }, { merge: true })
  console.log("Patched claim drop →", newDrop)

  if (claim.itemId) {
    const itemRef = db.collection(collections.items).doc(String(claim.itemId))
    const itemSnap = await itemRef.get()
    if (itemSnap.exists) {
      const item = itemSnap.data() || {}
      const newPickup = withIndiaPincode(
        String(item.pickupLocality || claim.pickupLocality || giver.address || "Mumbai"),
        giverPin
      )
      await itemRef.set({ pickupLocality: newPickup }, { merge: true })
      console.log("Patched item pickup →", newPickup)

      if (item.submissionId) {
        await db
          .collection(collections.donationSubmissions)
          .doc(String(item.submissionId))
          .set({ pickupLocality: newPickup, locality: newPickup }, { merge: true })
        console.log("Patched submission pickup")
      }
    }
  }

  // Also stamp claim.pickupLocality
  await target.ref.set(
    {
      pickupLocality: withIndiaPincode(String(claim.pickupLocality || giver.address || "Mumbai"), giverPin),
    },
    { merge: true }
  )

  console.log("Done. Retry Book Shiprocket.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
