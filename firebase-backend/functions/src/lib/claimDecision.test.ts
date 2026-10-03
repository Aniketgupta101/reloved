import assert from "node:assert/strict"
import { test } from "node:test"
import { commitAdminClaimDecision } from "./claimDecision"

type Row = Record<string, unknown>

function decisionDatabase(claim: Row | null, item: Row | null) {
  const rows = new Map<string, Row>()
  if (claim) rows.set("itemRequests/claim-1", { ...claim })
  if (item) rows.set("items/item-1", { ...item })
  const writes: string[] = []
  const ref = (path: string) => ({ path, id: path.split("/").at(-1) })
  const snapshot = (path: string) => ({
    exists: rows.has(path),
    data: () => rows.get(path),
  })
  const merge = (path: string, updates: Row) => {
    rows.set(path, { ...(rows.get(path) || {}), ...updates })
    writes.push(path)
  }
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async (work: (tx: any) => Promise<unknown>) =>
      work({
        get: async (document: { path: string }) => snapshot(document.path),
        set: (document: { path: string }, updates: Row) => merge(document.path, updates),
      }),
  } as any
  return {
    db,
    claimRef: ref("itemRequests/claim-1") as any,
    rows,
    writes,
  }
}

test("admin decision rejects a claim that is no longer pending without mutating claim or item", async () => {
  for (const currentStatus of ["approved", "rejected", "cancelled"]) {
    const { db, claimRef, rows, writes } = decisionDatabase(
      { itemId: "item-1", status: currentStatus },
      { publicStatus: "being_matched" }
    )

    const result = await commitAdminClaimDecision(db, claimRef, "approved")

    assert.deepEqual(result, {
      ok: false,
      error: "This claim is no longer waiting for a decision.",
      status: 409,
    })
    assert.deepEqual(writes, [])
    assert.equal(rows.get("itemRequests/claim-1")?.status, currentStatus)
    assert.equal(rows.get("items/item-1")?.publicStatus, "being_matched")
  }
})

test("admin acceptance rejects a pending claim when the live item is already claimed", async () => {
  const { db, claimRef, writes } = decisionDatabase(
    { itemId: "item-1", status: "pending" },
    { publicStatus: "claimed" }
  )

  const result = await commitAdminClaimDecision(db, claimRef, "approved")

  assert.deepEqual(result, {
    ok: false,
    error: "Another claim has already been accepted for this item.",
    status: 409,
  })
  assert.deepEqual(writes, [])
})

test("admin acceptance atomically preserves porter handover and Wall updates", async () => {
  const { db, claimRef, rows, writes } = decisionDatabase(
    {
      itemId: "item-1",
      status: "pending",
      giverLogistics: "porter_arranged",
      requesterAddress: "Building, Bandra",
    },
    { publicStatus: "being_matched", publicVisibility: true }
  )

  const result = await commitAdminClaimDecision(db, claimRef, "approved")

  assert.equal(result.ok, true)
  assert.deepEqual(writes, ["itemRequests/claim-1", "items/item-1"])
  assert.deepEqual(
    {
      status: rows.get("itemRequests/claim-1")?.status,
      handoverStage: rows.get("itemRequests/claim-1")?.handoverStage,
      reviewedBy: rows.get("itemRequests/claim-1")?.reviewedBy,
      pickupAddressConfirmedByGiver:
        rows.get("itemRequests/claim-1")?.pickupAddressConfirmedByGiver,
      dropAddressConfirmedByClaimer:
        rows.get("itemRequests/claim-1")?.dropAddressConfirmedByClaimer,
      opsBookingStatus: rows.get("itemRequests/claim-1")?.opsBookingStatus,
    },
    {
      status: "approved",
      handoverStage: "awaiting_schedule",
      reviewedBy: "admin",
      pickupAddressConfirmedByGiver: false,
      dropAddressConfirmedByClaimer: false,
      opsBookingStatus: "pending_schedule",
    }
  )
  assert.equal(rows.get("items/item-1")?.publicStatus, "claimed")
  assert.equal(rows.get("items/item-1")?.publicVisibility, true)
})

test("admin acceptance uses the live address to choose the current handover stage", async () => {
  for (const [requesterAddress, expectedStage] of [
    ["", "awaiting_delivery_address"],
    ["Gate 2, Powai", "awaiting_handover"],
  ] as const) {
    const { db, claimRef, rows } = decisionDatabase(
      {
        itemId: "item-1",
        status: "pending",
        giverLogistics: "giver_sends",
        requesterAddress,
      },
      { publicStatus: "being_matched" }
    )

    const result = await commitAdminClaimDecision(db, claimRef, "approved")

    assert.equal(result.ok, true)
    assert.equal(rows.get("itemRequests/claim-1")?.handoverStage, expectedStage)
  }
})

test("admin decline atomically reopens the Wall item from the latest pending state", async () => {
  const { db, claimRef, rows } = decisionDatabase(
    { itemId: "item-1", status: "pending", requesterTarget: "claimer-1" },
    { publicStatus: "being_matched", publicVisibility: true }
  )

  const result = await commitAdminClaimDecision(db, claimRef, "rejected")

  assert.equal(result.ok, true)
  assert.equal(rows.get("itemRequests/claim-1")?.status, "rejected")
  assert.equal(rows.get("itemRequests/claim-1")?.handoverStage, "pending_giver")
  assert.equal(rows.get("itemRequests/claim-1")?.reviewedBy, "admin")
  assert.equal(rows.get("items/item-1")?.publicStatus, "available")
  assert.equal(rows.get("items/item-1")?.publicVisibility, true)
})
