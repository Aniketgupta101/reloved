import { toPublicArea } from "./geo"
import { findDonorProfileDoc } from "./donorIdentity"
import type { Firestore } from "firebase-admin/firestore"

/** Public landmark shown to the giver before Accept (never flat/wing). */
export function claimerLandmarkForGiver(
  logistics: string,
  rawAddress: string | null | undefined,
  storedLocality?: string | null
): string | null {
  const stored = String(storedLocality || "").trim()
  if (stored) return stored
  const address = String(rawAddress || "").trim()
  if (!address) return null
  // Mirror maskClaimerAddressForGiver — area only until Accept.
  if (logistics === "porter_arranged") {
    const area = toPublicArea(address)
    return area || "Nearby Mumbai"
  }
  return toPublicArea(address) || null
}

export function claimerDisplayName(opts: {
  name?: string | null
  username?: string | null
}): string {
  const user = String(opts.username || "")
    .trim()
    .replace(/^@+/, "")
  if (user) return user
  const name = String(opts.name || "").trim()
  if (!name) return "Someone"
  return name.split(/\s+/)[0] || name
}

export function claimerReloveHeadline(opts: {
  name?: string | null
  username?: string | null
  landmark?: string | null
  itemTitle?: string | null
}): string {
  const who = claimerDisplayName(opts)
  const landmark = String(opts.landmark || "").trim()
  const title = String(opts.itemTitle || "item").trim() || "item"
  if (landmark) return `${who} from ${landmark} wants to Relove your ${title} 💗`
  return `${who} wants to Relove your ${title} 💗`
}

/** Resolve username + landmark for existing claims (profile fallback). */
export async function resolveClaimerPublicIdentity(
  db: Firestore,
  claim: Record<string, unknown>
): Promise<{ username: string | null; name: string | null; landmark: string | null }> {
  let username = String(claim.requesterUsername || "").trim().replace(/^@+/, "") || null
  let name = String(claim.requesterName || "").trim() || null
  const logistics = String(claim.giverLogistics || "")
  let landmark = claimerLandmarkForGiver(
    logistics,
    claim.requesterAddress as string | null,
    (claim.requesterLocality as string | null) || null
  )

  const target = String(claim.requesterTarget || "").trim()
  if (target && (!username || !name || !landmark)) {
    const profile = await findDonorProfileDoc(db, target)
    const pd = profile?.data() || {}
    if (!username) {
      username = String(pd.username || "").trim().replace(/^@+/, "") || null
    }
    if (!name) {
      name = String(pd.name || "").trim() || null
    }
    if (!landmark) {
      landmark =
        claimerLandmarkForGiver(logistics, String(pd.address || ""), String(pd.locality || pd.pickupLocality || "")) ||
        null
    }
  }

  return { username, name, landmark }
}
