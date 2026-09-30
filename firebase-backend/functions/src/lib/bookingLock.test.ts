import assert from "node:assert/strict"
import { test } from "node:test"
import { Timestamp } from "firebase-admin/firestore"
import {
  acquireBookingLock,
  releaseBookingLock,
  type BookingLockDocument,
} from "./bookingLock"

function bookingDatabase(initial: BookingLockDocument = {}) {
  const state: BookingLockDocument = { ...initial }
  const ref = { id: "claim-1" } as any
  const db = {
    runTransaction: async (work: (tx: any) => Promise<unknown>) =>
      work({
        get: async () => ({ exists: true, data: () => ({ ...state }) }),
        update: (_ref: unknown, updates: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(updates)) {
            if (value?.constructor?.name === "DeleteTransform") delete (state as any)[key]
            else (state as any)[key] = value
          }
        },
      }),
  } as any
  return { db, ref, state }
}

test("booking lock blocks a second provider while the first provider owns the active lease", async () => {
  const { db, ref } = bookingDatabase()

  const first = await acquireBookingLock(db, ref, "admin-a", "borzo")
  const second = await acquireBookingLock(db, ref, "admin-b", "shadowfax")

  assert.equal(first.status, "ok")
  assert.equal(second.status, "locked")
})

test("booking lock blocks every provider when another provider already has an active order", async () => {
  for (const existing of [
    { borzoOrderId: "borzo-1", borzoStatus: "active" },
    { shiprocketOrderId: "shiprocket-1", shiprocketStatus: "PICKUP_SCHEDULED" },
    { shadowfaxOrderId: "shadowfax-1", shadowfaxStatus: "dispatched" },
  ]) {
    const { db, ref } = bookingDatabase(existing)
    const result = await acquireBookingLock(db, ref, "admin-a", "borzo")
    assert.equal(result.status, "already_booked")
  }
})

test("stale release cannot erase a newer booking lock", async () => {
  const { db, ref, state } = bookingDatabase()
  const first = await acquireBookingLock(db, ref, "admin-a", "borzo")
  assert.equal(first.status, "ok")

  state.bookingLockUntil = Timestamp.fromMillis(Date.now() - 1)
  const second = await acquireBookingLock(db, ref, "admin-b", "shiprocket")
  assert.equal(second.status, "ok")
  assert.notEqual(first.token, second.token)

  const released = await releaseBookingLock(db, ref, first.token)

  assert.equal(released, false)
  assert.equal(state.bookingLockToken, second.token)
  assert.equal(state.bookingLockProvider, "shiprocket")
})
