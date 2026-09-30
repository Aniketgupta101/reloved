import assert from "node:assert/strict"
import { test } from "node:test"
import {
  completeProviderCancellation,
  type BookingProvider,
} from "./bookingCancellation"

type Row = Record<string, unknown>

function cancellationDatabase(claim: Row, subsidy: Row = { limit: 500, usedCount: 10 }) {
  const rows = new Map<string, Row>([
    ["itemRequests/claim-1", { ...claim }],
    ["config/borzoSubsidy", { ...subsidy }],
  ])
  const writes: string[] = []
  const ref = (path: string) => ({ path, id: path.split("/").at(-1) })
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    doc: (path: string) => ref(path),
    runTransaction: async (work: (tx: any) => Promise<unknown>) =>
      work({
        get: async (document: { path: string }) => ({
          exists: rows.has(document.path),
          data: () => rows.get(document.path),
        }),
        set: (document: { path: string }, updates: Row) => {
          rows.set(document.path, { ...(rows.get(document.path) || {}), ...updates })
          writes.push(document.path)
        },
      }),
  } as any
  return {
    db,
    claimRef: ref("itemRequests/claim-1") as any,
    claim: () => rows.get("itemRequests/claim-1")!,
    subsidy: () => rows.get("config/borzoSubsidy")!,
    writes,
  }
}

test("delayed cancellation cannot mutate or release subsidy for a replacement order", async () => {
  const { db, claimRef, claim, subsidy, writes } = cancellationDatabase({
    shiprocketOrderId: 202,
    shiprocketStatus: "PICKUP_SCHEDULED",
    borzoPaidBy: "reloved_subsidy",
    borzoSubsidyReleased: false,
  })

  const result = await completeProviderCancellation(db, claimRef, {
    provider: "shiprocket",
    orderIdentity: "101",
  })

  assert.deepEqual(result, { status: "stale", subsidy: null })
  assert.equal(claim().shiprocketOrderId, 202)
  assert.equal(claim().shiprocketStatus, "PICKUP_SCHEDULED")
  assert.equal(claim().borzoSubsidyReleased, false)
  assert.equal(subsidy().usedCount, 10)
  assert.deepEqual(writes, [])
})

test("matching cancellation marks the provider and releases its subsidy exactly once", async () => {
  const { db, claimRef, claim, subsidy } = cancellationDatabase({
    shiprocketOrderId: 101,
    shiprocketStatus: "PICKUP_SCHEDULED",
    borzoPaidBy: "reloved_subsidy",
    borzoSubsidyReleased: false,
  })

  const first = await completeProviderCancellation(db, claimRef, {
    provider: "shiprocket",
    orderIdentity: "101",
  })
  const second = await completeProviderCancellation(db, claimRef, {
    provider: "shiprocket",
    orderIdentity: "101",
  })

  assert.equal(first.status, "canceled")
  assert.equal(first.subsidy?.usedCount, 9)
  assert.deepEqual(second, { status: "already_canceled", subsidy: null })
  assert.equal(claim().shiprocketStatus, "CANCELED")
  assert.equal(claim().borzoSubsidyReleased, true)
  assert.equal(subsidy().usedCount, 9)
})

test("cancellation binds to each provider's exact stored order identity", async () => {
  const cases: Array<{
    provider: BookingProvider
    claim: Row
    orderIdentity: string
    statusField: string
    canceledStatus: string
  }> = [
    {
      provider: "borzo",
      claim: { borzoOrderId: 17, borzoStatus: "active" },
      orderIdentity: "17",
      statusField: "borzoStatus",
      canceledStatus: "canceled",
    },
    {
      provider: "shiprocket",
      claim: { shiprocketOrderId: 18, shiprocketStatus: "NEW" },
      orderIdentity: "18",
      statusField: "shiprocketStatus",
      canceledStatus: "CANCELED",
    },
    {
      provider: "shadowfax",
      claim: { shadowfaxOrderId: "SFX-19", shadowfaxAwb: "AWB-19", shadowfaxStatus: "booked" },
      orderIdentity: "AWB-19",
      statusField: "shadowfaxStatus",
      canceledStatus: "CANCELED",
    },
  ]

  for (const entry of cases) {
    const { db, claimRef, claim } = cancellationDatabase({
      ...entry.claim,
      borzoPaidBy: "receiver",
      borzoSubsidyReleased: false,
    })
    const result = await completeProviderCancellation(db, claimRef, {
      provider: entry.provider,
      orderIdentity: entry.orderIdentity,
    })

    assert.equal(result.status, "canceled", entry.provider)
    assert.equal(claim()[entry.statusField], entry.canceledStatus, entry.provider)
  }
})

test("Borzo cancellation atomically marks delivery failed only for the matching order", async () => {
  const matching = cancellationDatabase({
    borzoOrderId: 31,
    borzoStatus: "active",
    deliveryStatus: "rider_dispatched",
    borzoPaidBy: "receiver",
  })
  const stale = cancellationDatabase({
    borzoOrderId: 32,
    borzoStatus: "active",
    deliveryStatus: "rider_dispatched",
    borzoPaidBy: "receiver",
  })

  const applied = await completeProviderCancellation(matching.db, matching.claimRef, {
    provider: "borzo",
    orderIdentity: "31",
  })
  const rejected = await completeProviderCancellation(stale.db, stale.claimRef, {
    provider: "borzo",
    orderIdentity: "31",
  })

  assert.equal(applied.status, "canceled")
  assert.equal(matching.claim().deliveryStatus, "failed")
  assert.equal(rejected.status, "stale")
  assert.equal(stale.claim().deliveryStatus, "rider_dispatched")
})
