import { randomUUID } from "node:crypto"
import { FieldValue, Timestamp, type Firestore, type DocumentReference } from "firebase-admin/firestore"

export interface BookingLockDocument {
  bookingLockUntil?: Timestamp
  bookingLockedBy?: string
  bookingLockProvider?: "borzo" | "shiprocket" | "shadowfax"
  bookingLockToken?: string
  borzoOrderId?: unknown
  borzoStatus?: unknown
  shiprocketOrderId?: unknown
  shiprocketStatus?: unknown
  shadowfaxOrderId?: unknown
  shadowfaxStatus?: unknown
}

export type BookingLockResult =
  | { status: "ok"; token: string }
  | { status: "not_found"; token: null }
  | { status: "already_booked"; token: null }
  | { status: "locked"; token: null }

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
  const token = randomUUID()
  return db.runTransaction(async (tx) => {
    const cur = await tx.get(ref)
    if (!cur.exists) return { status: "not_found", token: null }
    const d = cur.data() as BookingLockDocument

    const borzoActive = Boolean(d.borzoOrderId && d.borzoStatus !== "canceled")
    const shiprocketActive = Boolean(
      d.shiprocketOrderId && String(d.shiprocketStatus || "").toUpperCase() !== "CANCELED"
    )
    const shadowfaxActive = Boolean(
      d.shadowfaxOrderId && String(d.shadowfaxStatus || "").toUpperCase() !== "CANCELED"
    )

    if (borzoActive || shiprocketActive || shadowfaxActive) {
      return { status: "already_booked", token: null }
    }

    const lockUntil = d.bookingLockUntil?.toMillis?.() ?? 0
    if (lockUntil > Date.now()) {
      return { status: "locked", token: null }
    }

    tx.update(ref, {
      bookingLockUntil: Timestamp.fromMillis(Date.now() + 45_000),
      bookingLockedBy: lockedBy,
      bookingLockProvider: provider,
      bookingLockToken: token,
    })
    return { status: "ok", token }
  })
}

/** Releases a temporary booking lock only when the caller still owns it. */
export async function releaseBookingLock(
  db: Firestore,
  ref: DocumentReference,
  token: string
): Promise<boolean> {
  return db
    .runTransaction(async (tx) => {
      const cur = await tx.get(ref)
      if (!cur.exists || cur.data()?.bookingLockToken !== token) return false
      tx.update(ref, {
        bookingLockUntil: FieldValue.delete(),
        bookingLockedBy: FieldValue.delete(),
        bookingLockProvider: FieldValue.delete(),
        bookingLockToken: FieldValue.delete(),
      })
      return true
    })
    .catch(() => false)
}
