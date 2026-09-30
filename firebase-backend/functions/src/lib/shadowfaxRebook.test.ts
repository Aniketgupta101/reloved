import assert from "node:assert/strict"
import { test } from "node:test"
import { cancelShadowfaxBeforeRebook } from "./shadowfax"

test("force rebook stops when Shadowfax cancellation is not confirmed", async () => {
  let bookingStarted = false
  const cancel = async () => {
    throw new Error("Shadowfax cancellation failed")
  }

  await assert.rejects(
    async () => {
      await cancelShadowfaxBeforeRebook("AWB-1", cancel)
      bookingStarted = true
    },
    /cancellation failed/i,
  )
  assert.equal(bookingStarted, false)
})

test("force rebook continues only after Shadowfax cancellation succeeds", async () => {
  const canceled: string[] = []
  await cancelShadowfaxBeforeRebook("AWB-1", async (id) => {
    canceled.push(id)
    return { status: "cancelled" }
  })
  assert.deepEqual(canceled, ["AWB-1"])
})
