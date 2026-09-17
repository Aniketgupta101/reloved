/**
 * First-500 Borzo delivery subsidy: Reloved pays from prepaid wallet.
 * After the limit, bookings still use payment_method=balance (no COD);
 * claim is marked receiver-pays so ops can collect offline.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore"

export const BORZO_SUBSIDY_LIMIT = 500
export const BORZO_SUBSIDY_DOC = "config/borzoSubsidy"

export type BorzoPaidBy = "reloved_subsidy" | "receiver"

export type BorzoSubsidySnapshot = {
  limit: number
  usedCount: number
  remaining: number
  exhausted: boolean
  /** Next ride would be covered by Reloved if booked now. */
  nextCoveredByReloved: boolean
}

function emptySnapshot(): BorzoSubsidySnapshot {
  return {
    limit: BORZO_SUBSIDY_LIMIT,
    usedCount: 0,
    remaining: BORZO_SUBSIDY_LIMIT,
    exhausted: false,
    nextCoveredByReloved: true,
  }
}

export async function getBorzoSubsidySnapshot(db: Firestore): Promise<BorzoSubsidySnapshot> {
  const snap = await db.doc(BORZO_SUBSIDY_DOC).get()
  if (!snap.exists) return emptySnapshot()
  const data = snap.data() || {}
  const limit = Number(data.limit) > 0 ? Number(data.limit) : BORZO_SUBSIDY_LIMIT
  const usedCount = Math.max(0, Number(data.usedCount) || 0)
  const remaining = Math.max(0, limit - usedCount)
  return {
    limit,
    usedCount,
    remaining,
    exhausted: remaining <= 0,
    nextCoveredByReloved: remaining > 0,
  }
}

/**
 * Atomically reserves one subsidy slot if available.
 * Returns paidBy + optional subsidyIndex (1-based).
 */
export async function reserveBorzoSubsidy(
  db: Firestore
): Promise<{ paidBy: BorzoPaidBy; subsidyIndex: number | null; snapshot: BorzoSubsidySnapshot }> {
  const ref = db.doc(BORZO_SUBSIDY_DOC)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.exists ? snap.data() || {} : {}
    const limit = Number(data.limit) > 0 ? Number(data.limit) : BORZO_SUBSIDY_LIMIT
    const usedCount = Math.max(0, Number(data.usedCount) || 0)

    if (usedCount >= limit) {
      const remaining = 0
      return {
        paidBy: "receiver" as const,
        subsidyIndex: null,
        snapshot: {
          limit,
          usedCount,
          remaining,
          exhausted: true,
          nextCoveredByReloved: false,
        },
      }
    }

    const nextUsed = usedCount + 1
    tx.set(
      ref,
      {
        limit,
        usedCount: nextUsed,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: snap.exists ? data.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return {
      paidBy: "reloved_subsidy" as const,
      subsidyIndex: nextUsed,
      snapshot: {
        limit,
        usedCount: nextUsed,
        remaining: Math.max(0, limit - nextUsed),
        exhausted: nextUsed >= limit,
        nextCoveredByReloved: nextUsed < limit,
      },
    }
  })
}

/** Release a subsidy slot when a subsidized order is canceled before delivery. */
export async function releaseBorzoSubsidy(
  db: Firestore,
  opts: { paidBy?: string | null; alreadyReleased?: boolean }
): Promise<BorzoSubsidySnapshot | null> {
  if (opts.paidBy !== "reloved_subsidy" || opts.alreadyReleased) return null

  const ref = db.doc(BORZO_SUBSIDY_DOC)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return emptySnapshot()
    const data = snap.data() || {}
    const limit = Number(data.limit) > 0 ? Number(data.limit) : BORZO_SUBSIDY_LIMIT
    const usedCount = Math.max(0, (Number(data.usedCount) || 0) - 1)
    tx.set(
      ref,
      {
        usedCount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    const remaining = Math.max(0, limit - usedCount)
    return {
      limit,
      usedCount,
      remaining,
      exhausted: remaining <= 0,
      nextCoveredByReloved: remaining > 0,
    }
  })
}

export function subsidyUserCopy(snapshot: BorzoSubsidySnapshot): {
  headline: string
  detail: string
  payerLabel: string
} {
  if (snapshot.nextCoveredByReloved) {
    return {
      headline: "Reloved covers this delivery",
      detail: `First ${snapshot.limit} Borzo rides are on Reloved (${snapshot.usedCount}/${snapshot.limit} used). No COD — prepaid wallet.`,
      payerLabel: "Reloved (first-500 cover)",
    }
  }
  return {
    headline: "First-500 cover used up",
    detail: `Reloved covered the first ${snapshot.limit} rides. This ride is prepaid via Reloved's Borzo wallet; the receiver reimburses Reloved (~₹40–80). No COD.`,
    payerLabel: "Receiver reimburses Reloved",
  }
}
