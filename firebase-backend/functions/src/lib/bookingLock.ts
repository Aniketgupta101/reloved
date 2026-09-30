import { FieldValue, Timestamp, type Firestore, type DocumentReference } from "firebase-admin/firestore"

export type BookingLockResult = "ok" | "not_found" | "already_booked" | "locked"

/**
 * Atomically acquires a 45-second lock on an item request document before booking a courier.
 * Prevents concurrent double-booking across Borzo, Shiprocket, and Shadowfax.
 */
export async function acquireBookingLock(
  db: Firestore,
  ref: DocumentReference,
  lockedBy: string,
  provider: "borzo" | "shiprocket" | "shadowfax"
): Promise<BookingLockResult> {
  return db.runTransaction(async (tx) => {
    const cur = await tx.get(ref)
    if (!cur.exists) return "not_found"
    const d = cur.data()!

    const borzoActive = Boolean(d.borzoOrderId && d.borzoStatus !== "canceled")
    const shiprocketActive = Boolean(
      d.shiprocketOrderId && String(d.shiprocketStatus || "").toUpperCase() !== "CANCELED"
    )
    const shadowfaxActive = Boolean(
      d.shadowfaxOrderId && String(d.shadowfaxStatus || "").toUpperCase() !== "CANCELED"
    )

    if (borzoActive || shiprocketActive || shadowfaxActive) {
      return "already_booked"
    }

    const lockUntil = d.bookingLockUntil?.toMillis?.() ?? 0
    if (lockUntil > Date.now()) {
      return "locked"
    }

    tx.update(ref, {
      bookingLockUntil: Timestamp.fromMillis(Date.now() + 45_000),
      bookingLockedBy: lockedBy,
      bookingLockProvider: provider,
    })
    return "ok"
  })
}

/** Releases a temporary booking lock on error or abort. */
export async function releaseBookingLock(ref: DocumentReference): Promise<void> {
  await ref
    .update({
      bookingLockUntil: FieldValue.delete(),
      bookingLockedBy: FieldValue.delete(),
      bookingLockProvider: FieldValue.delete(),
    })
    .catch(() => undefined)
}
