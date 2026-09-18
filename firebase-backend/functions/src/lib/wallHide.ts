import { FieldValue, type Firestore } from "firebase-admin/firestore"
import { findDonorProfileDoc, normalizeEmail, normalizePhoneDigits } from "./donorIdentity"
import { collections } from "./firestore"

/** Stable identity keys used to hide a Wall item from a declined claimer. */
export function claimerHideKeys(opts: {
  target?: string | null
  phone?: string | null
  email?: string | null
}): string[] {
  const keys = new Set<string>()
  const target = String(opts.target || "").trim()
  if (target) keys.add(target)
  const email = normalizeEmail(opts.email) || normalizeEmail(target)
  if (email) keys.add(email)
  const phone = normalizePhoneDigits(opts.phone) || normalizePhoneDigits(target)
  if (phone) keys.add(phone)
  return [...keys]
}

/** Expand the logged-in donor into all identity keys we may have stored on decline. */
export async function resolveViewerHideKeys(db: Firestore, sessionUid: string): Promise<Set<string>> {
  const keys = new Set<string>(claimerHideKeys({ target: sessionUid }))
  try {
    const profileDoc = await findDonorProfileDoc(db, sessionUid)
    const profile = profileDoc?.data()
    if (profile) {
      for (const k of claimerHideKeys({
        target: String(profile.target || sessionUid),
        phone: profile.phone != null ? String(profile.phone) : null,
        email: profile.email != null ? String(profile.email) : null,
      })) {
        keys.add(k)
      }
      const linked = Array.isArray(profile.linkedEmails) ? profile.linkedEmails : []
      for (const e of linked) {
        const email = normalizeEmail(String(e || ""))
        if (email) keys.add(email)
      }
    }
  } catch (err) {
    console.warn("resolveViewerHideKeys", err)
  }
  return keys
}

export function itemHiddenForViewer(
  itemData: { wallHiddenForTargets?: unknown } | null | undefined,
  viewerKeys: Set<string>,
): boolean {
  if (!viewerKeys.size) return false
  const hidden = Array.isArray(itemData?.wallHiddenForTargets)
    ? (itemData!.wallHiddenForTargets as unknown[]).map((v) => String(v || "").trim()).filter(Boolean)
    : []
  return hidden.some((k) => viewerKeys.has(k))
}

/**
 * Persist decline → Wall hide: item field for fast list filter + wallHides audit row.
 */
export async function recordWallHideForDeclinedClaimer(
  db: Firestore,
  params: {
    itemId: string
    itemSlug?: string | null
    itemTitle?: string | null
    claimId: string
    claimerTarget?: string | null
    claimerPhone?: string | null
    claimerName?: string | null
    reason?: string | null
  },
): Promise<string[]> {
  const keys = claimerHideKeys({
    target: params.claimerTarget,
    phone: params.claimerPhone,
  })
  if (!keys.length) return []

  const itemRef = db.collection(collections.items).doc(params.itemId)
  await itemRef.set(
    {
      wallHiddenForTargets: FieldValue.arrayUnion(...keys),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  const hideRef = db.collection(collections.wallHides).doc()
  await hideRef.set({
    itemId: params.itemId,
    itemSlug: params.itemSlug || null,
    itemTitle: params.itemTitle || null,
    claimId: params.claimId,
    claimerTarget: params.claimerTarget || null,
    claimerPhone: normalizePhoneDigits(params.claimerPhone) || null,
    claimerName: params.claimerName || null,
    claimerKeys: keys,
    reason: params.reason || null,
    createdAt: FieldValue.serverTimestamp(),
  })

  return keys
}

/** Item IDs this viewer was declined for (covers declines before wallHiddenForTargets existed). */
export async function loadDeclinedItemIdsForViewer(
  db: Firestore,
  sessionUid: string,
  viewerKeys: Set<string>,
): Promise<Set<string>> {
  const ids = new Set<string>()
  const targets = new Set<string>([sessionUid, ...viewerKeys].filter(Boolean))
  const queries = [...targets].slice(0, 8).map((target) =>
    db
      .collection(collections.itemRequests)
      .where("requesterTarget", "==", target)
      .limit(120)
      .get()
      .catch((err) => {
        console.warn("loadDeclinedItemIdsForViewer", target, err)
        return null
      }),
  )
  const snaps = await Promise.all(queries)
  for (const snap of snaps) {
    if (!snap) continue
    for (const doc of snap.docs) {
      if (String(doc.data()?.status || "") !== "rejected") continue
      const itemId = String(doc.data()?.itemId || "")
      if (itemId) ids.add(itemId)
    }
  }
  return ids
}
