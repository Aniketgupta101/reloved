import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore"
import { collections } from "./firestore"

export type AdminClaimDecisionStatus = "approved" | "rejected"

export type AdminClaimDecisionResult =
  | {
      ok: true
      accept: boolean
      claim: DocumentData
      item: DocumentData
      itemId: string
      logistics: string
    }
  | { ok: false; error: string; status: 404 | 409 }

function acceptedHandoverStage(logistics: string, requesterAddress: unknown): string {
  if (logistics === "porter_arranged") return "awaiting_schedule"
  const needsAddress =
    logistics === "giver_sends" ||
    logistics === "porter_arranged" ||
    logistics === "personal_driver"
  if (needsAddress && !String(requesterAddress || "").trim()) {
    return "awaiting_delivery_address"
  }
  return "awaiting_handover"
}

/** Commits an admin claim decision from the latest claim and item snapshots. */
export async function commitAdminClaimDecision(
  db: Firestore,
  claimRef: DocumentReference,
  status: AdminClaimDecisionStatus
): Promise<AdminClaimDecisionResult> {
  const accept = status === "approved"
  return db.runTransaction(async (tx) => {
    const claimSnap = await tx.get(claimRef)
    if (!claimSnap.exists) {
      return { ok: false as const, error: "Claim not found", status: 404 as const }
    }
    const claim = claimSnap.data()!
    if (claim.status !== "pending") {
      return {
        ok: false as const,
        error: "This claim is no longer waiting for a decision.",
        status: 409 as const,
      }
    }

    const itemId = String(claim.itemId || "")
    const itemRef = db.collection(collections.items).doc(itemId)
    const itemSnap = await tx.get(itemRef)
    if (!itemSnap.exists) {
      return { ok: false as const, error: "Item not found", status: 404 as const }
    }
    const item = itemSnap.data()!
    if (accept && item.publicStatus === "claimed") {
      return {
        ok: false as const,
        error: "Another claim has already been accepted for this item.",
        status: 409 as const,
      }
    }

    const logistics = String(claim.giverLogistics || item.giverLogistics || "")
    const handoverStage = accept
      ? acceptedHandoverStage(logistics, claim.requesterAddress)
      : "pending_giver"

    tx.set(
      claimRef,
      {
        status,
        handoverStage,
        reviewedBy: "admin",
        reviewedAt: FieldValue.serverTimestamp(),
        declineReason: accept ? FieldValue.delete() : "ops_decline",
        updatedAt: FieldValue.serverTimestamp(),
        ...(accept && logistics === "porter_arranged"
          ? {
              pickupAddressConfirmedByGiver: false,
              dropAddressConfirmedByClaimer: false,
              opsBookingStatus: "pending_schedule",
            }
          : {}),
      },
      { merge: true }
    )
    tx.set(
      itemRef,
      {
        publicStatus: accept ? "claimed" : "available",
        publicVisibility: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return { ok: true as const, accept, claim, item, itemId, logistics }
  })
}
