import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore"
import {
  BORZO_SUBSIDY_DOC,
  BORZO_SUBSIDY_LIMIT,
  type BorzoSubsidySnapshot,
} from "./borzoSubsidy"

export type BookingProvider = "borzo" | "shiprocket" | "shadowfax"

export type ProviderCancellationResult =
  | { status: "canceled"; subsidy: BorzoSubsidySnapshot | null }
  | { status: "already_canceled" | "stale" | "not_found"; subsidy: null }

type ProviderFields = {
  identityFields: string[]
  statusField: string
  canceledStatus: string
  canceledAtField: string
  updatedAtField: string
}

const providerFields: Record<BookingProvider, ProviderFields> = {
  borzo: {
    identityFields: ["borzoOrderId"],
    statusField: "borzoStatus",
    canceledStatus: "canceled",
    canceledAtField: "borzoCanceledAt",
    updatedAtField: "borzoUpdatedAt",
  },
  shiprocket: {
    identityFields: ["shiprocketOrderId"],
    statusField: "shiprocketStatus",
    canceledStatus: "CANCELED",
    canceledAtField: "shiprocketCanceledAt",
    updatedAtField: "shiprocketUpdatedAt",
  },
  shadowfax: {
    identityFields: ["shadowfaxAwb", "shadowfaxOrderId"],
    statusField: "shadowfaxStatus",
    canceledStatus: "CANCELED",
    canceledAtField: "shadowfaxCanceledAt",
    updatedAtField: "shadowfaxUpdatedAt",
  },
}

function normalizedIdentity(value: unknown): string {
  return String(value ?? "").trim()
}

function subsidySnapshot(limit: number, usedCount: number): BorzoSubsidySnapshot {
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
 * Completes a vendor-confirmed cancellation only if the same provider order is
 * still current. Claim mutation and subsidy release share one transaction.
 */
export async function completeProviderCancellation(
  db: Firestore,
  claimRef: DocumentReference,
  opts: { provider: BookingProvider; orderIdentity: string }
): Promise<ProviderCancellationResult> {
  const expectedIdentity = normalizedIdentity(opts.orderIdentity)
  const fields = providerFields[opts.provider]

  return db.runTransaction(async (tx) => {
    const claimSnap = await tx.get(claimRef)
    if (!claimSnap.exists) return { status: "not_found" as const, subsidy: null }
    const claim = claimSnap.data()!
    const identityMatches = fields.identityFields.some(
      (field) => normalizedIdentity(claim[field]) === expectedIdentity
    )
    if (!expectedIdentity || !identityMatches) {
      return { status: "stale" as const, subsidy: null }
    }
    if (String(claim[fields.statusField] || "").toUpperCase() === "CANCELED") {
      return { status: "already_canceled" as const, subsidy: null }
    }

    const shouldReleaseSubsidy =
      claim.borzoPaidBy === "reloved_subsidy" && !claim.borzoSubsidyReleased
    const subsidyRef = db.doc(BORZO_SUBSIDY_DOC)
    const subsidyDoc = shouldReleaseSubsidy ? await tx.get(subsidyRef) : null
    let releasedSnapshot: BorzoSubsidySnapshot | null = null

    if (shouldReleaseSubsidy) {
      const subsidyData = subsidyDoc?.exists ? subsidyDoc.data() || {} : {}
      const limit = Number(subsidyData.limit) > 0
        ? Number(subsidyData.limit)
        : BORZO_SUBSIDY_LIMIT
      const usedCount = Math.max(0, (Number(subsidyData.usedCount) || 0) - 1)
      releasedSnapshot = subsidySnapshot(limit, usedCount)
      if (subsidyDoc?.exists) {
        tx.set(
          subsidyRef,
          {
            usedCount,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }
    }

    const now = FieldValue.serverTimestamp()
    tx.set(
      claimRef,
      {
        [fields.statusField]: fields.canceledStatus,
        [fields.canceledAtField]: now,
        [fields.updatedAtField]: now,
        ...(shouldReleaseSubsidy ? { borzoSubsidyReleased: true } : {}),
        ...(opts.provider === "borzo"
          ? {
              deliveryStatus: "failed",
              deliveryUpdatedAt: now,
            }
          : {}),
        updatedAt: now,
      },
      { merge: true }
    )

    return { status: "canceled" as const, subsidy: releasedSnapshot }
  })
}
