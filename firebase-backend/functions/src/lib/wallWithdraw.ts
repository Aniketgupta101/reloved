import { FieldValue, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore"
import { collections } from "./firestore"

/** Fields that take an item off Wall of Kindness, map, and public/admin live lists. */
export function wallWithdrawFields(extra?: Record<string, unknown>) {
  return {
    publicVisibility: false,
    publicStatus: "withdrawn" as const,
    status: "withdrawn" as const,
    withdrawnAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...extra,
  }
}

export type WallWithdrawBlock =
  | { ok: true }
  | { ok: false; error: string; code: "RELOVED" | "CLAIMED" }

/**
 * Reloved stays forever. Claimed / being_matched can still be force-hidden from the
 * Wall when the giver (or ops) insists — public must not keep showing them.
 */
export function assertWallWithdrawAllowed(
  publicStatus: string,
  opts?: { allowClaimed?: boolean }
): WallWithdrawBlock {
  const ps = String(publicStatus || "")
  if (ps === "reloved") {
    return {
      ok: false,
      code: "RELOVED",
      error: "This item is already Reloved, so it can't be removed.",
    }
  }
  if (!opts?.allowClaimed && (ps === "claimed" || ps === "being_matched")) {
    return {
      ok: false,
      code: "CLAIMED",
      error:
        "Someone has claimed this item, so it can't be removed. Accept or decline the request instead.",
    }
  }
  return { ok: true }
}

/** Every item id linked to a donation submission (itemIds + submissionId query). */
export async function collectSubmissionItemIds(
  db: Firestore,
  submissionId: string,
  itemIdsFromDoc?: unknown
): Promise<string[]> {
  const ids = new Set<string>(
    (Array.isArray(itemIdsFromDoc) ? itemIdsFromDoc : []).map(String).filter(Boolean)
  )
  // Paginate — bulk drops can exceed a single page (old code used limit 20 and left orphans on the Wall).
  let last: QueryDocumentSnapshot | undefined
  for (let page = 0; page < 20; page++) {
    let q = db
      .collection(collections.items)
      .where("submissionId", "==", submissionId)
      .limit(100)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    for (const doc of snap.docs) ids.add(doc.id)
    last = snap.docs[snap.docs.length - 1]
    if (snap.size < 100) break
  }
  return [...ids]
}

/** Cancel open claims so a withdrawn Wall item isn't still actionable for claimers. */
export async function cancelOpenClaimsForItem(
  db: Firestore,
  itemId: string,
  reason = "giver_removed_from_wall"
): Promise<number> {
  const snap = await db.collection(collections.itemRequests).where("itemId", "==", itemId).limit(30).get()
  let n = 0
  for (const doc of snap.docs) {
    const st = String(doc.data().status || "")
    if (st !== "pending" && st !== "approved") continue
    await doc.ref.set(
      {
        status: "cancelled",
        cancelReason: reason,
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    n++
  }
  return n
}
