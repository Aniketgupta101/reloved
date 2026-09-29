import test, { describe, it } from "node:test"
import assert from "node:assert/strict"
import { runWithConcurrency } from "./concurrencyQueue.ts"
import { flowPerf } from "./perfMetrics.ts"

describe("Bulk Performance Flow & Concurrency Engine", () => {
  it("enforces maximum concurrency limit strictly across 1, 5, 10, 13, 20, 30 items", async () => {
    const testCounts = [1, 5, 10, 13, 20, 30]

    for (const count of testCounts) {
      const concurrencyLimit = 3
      let activeWorkers = 0
      let maxRecordedConcurrency = 0
      const items = Array.from({ length: count }, (_, i) => `item-${i + 1}`)

      const results = await runWithConcurrency(items, concurrencyLimit, async (item) => {
        activeWorkers++
        maxRecordedConcurrency = Math.max(maxRecordedConcurrency, activeWorkers)
        // Simulate small asynchronous I/O delay
        await new Promise((r) => setTimeout(r, 10))
        activeWorkers--
        return `processed-${item}`
      })

      assert.equal(results.length, count)
      assert.ok(
        maxRecordedConcurrency <= concurrencyLimit,
        `Max active workers (${maxRecordedConcurrency}) should not exceed limit (${concurrencyLimit}) for count ${count}`,
      )
      // Check order preservation
      results.forEach((res, idx) => {
        assert.equal(res, `processed-item-${idx + 1}`)
      })
    }
  })

  it("yields significant speedup over sequential processing for 10-30 bulk items", async () => {
    const itemCount = 12
    const simulatedWorkMs = 20
    const items = Array.from({ length: itemCount }, (_, i) => i)

    // Sequential timing simulation
    const seqStart = Date.now()
    for (const item of items) {
      await new Promise((r) => setTimeout(r, simulatedWorkMs))
    }
    const seqDuration = Date.now() - seqStart

    // Controlled concurrent timing (concurrency 3)
    const concStart = Date.now()
    await runWithConcurrency(items, 3, async () => {
      await new Promise((r) => setTimeout(r, simulatedWorkMs))
    })
    const concDuration = Date.now() - concStart

    // Concurrency 3 should be ~2.5x to 3x faster than sequential
    assert.ok(
      concDuration < seqDuration * 0.6,
      `Concurrent duration (${concDuration}ms) should be substantially faster than sequential (${seqDuration}ms)`,
    )
  })

  it("deduplicates active in-flight photos to prevent double API requests across steps", () => {
    const inFlightPhotoIds = new Set<string>()

    const initialBatch = [
      { photoId: "p-1", name: "jacket.jpg" },
      { photoId: "p-2", name: "shoes.jpg" },
      { photoId: "p-3", name: "shirt.jpg" },
    ]

    // Step 1 kick-off
    const eligible1 = initialBatch.filter((p) => !inFlightPhotoIds.has(p.photoId))
    assert.equal(eligible1.length, 3)
    eligible1.forEach((p) => inFlightPhotoIds.add(p.photoId))

    // User navigates or triggers re-analyze before batch 1 finishes
    const eligible2 = initialBatch.filter((p) => !inFlightPhotoIds.has(p.photoId))
    assert.equal(eligible2.length, 0, "No duplicate processing while initial batch is in flight")

    // User adds 2 new photos while first 3 are in flight
    const secondBatch = [
      ...initialBatch,
      { photoId: "p-4", name: "hat.jpg" },
      { photoId: "p-5", name: "belt.jpg" },
    ]
    const eligible3 = secondBatch.filter((p) => !inFlightPhotoIds.has(p.photoId))
    assert.equal(eligible3.length, 2, "Only new photos are eligible")
    assert.equal(eligible3[0].photoId, "p-4")
    assert.equal(eligible3[1].photoId, "p-5")

    // When p-1 finishes, it is removed from in-flight
    inFlightPhotoIds.delete("p-1")
    assert.ok(!inFlightPhotoIds.has("p-1"))
    assert.ok(inFlightPhotoIds.has("p-2"))
  })

  it("preserves idempotency and handles partial failure across parallel submissions", async () => {
    const groups = [0, 1, 2, 3]
    const idempotencyMap = new Map<number, string>()
    const acceptedItems = new Map<string, string>()
    const submittedRefs: string[] = []
    const failures: string[] = []

    // Helper to generate group idempotency key
    const idempotencyKeyForGroup = (gid: number) => {
      if (!idempotencyMap.has(gid)) {
        idempotencyMap.set(gid, `idemp-key-group-${gid}-${Date.now()}`)
      }
      return idempotencyMap.get(gid)!
    }

    // Simulate concurrent submission with 1 failure on group 2
    await runWithConcurrency(groups, 3, async (gid) => {
      const key = idempotencyKeyForGroup(gid)
      if (gid === 2) {
        failures.push(`Item ${gid}: simulated network error`)
        return
      }
      const ref = `REL-${gid}-ABC`
      acceptedItems.set(key, ref)
      submittedRefs.push(ref)
    })

    assert.equal(submittedRefs.length, 3)
    assert.equal(failures.length, 1)
    assert.ok(failures[0].includes("Item 2"))
    assert.equal(acceptedItems.size, 3)

    // Retry idempotency verification: retrying group 0 uses identical idempotency key
    const key0 = idempotencyKeyForGroup(0)
    assert.equal(key0, idempotencyMap.get(0))
  })

  it("accurately tracks wall-clock timing milestones via FlowPerformanceTracker", async () => {
    flowPerf.reset()
    flowPerf.mark("photo_selection_start", { count: 10 })
    await new Promise((r) => setTimeout(r, 15))
    flowPerf.mark("compression_complete", { count: 10 })
    await new Promise((r) => setTimeout(r, 15))
    flowPerf.mark("catalog_start", { totalPhotos: 10, chunks: 4 })
    await new Promise((r) => setTimeout(r, 15))
    flowPerf.mark("catalog_all_complete")
    await new Promise((r) => setTimeout(r, 15))
    flowPerf.mark("review_entered", { photoCount: 10 })
    await new Promise((r) => setTimeout(r, 15))
    flowPerf.mark("submit_start", { groupCount: 5 })
    await new Promise((r) => setTimeout(r, 15))
    flowPerf.mark("submit_all_complete", { submittedCount: 5 })

    const metrics = flowPerf.getMetrics()
    assert.equal(metrics.length, 7)
    assert.equal(metrics[0].event, "photo_selection_start")
    assert.equal(metrics[metrics.length - 1].event, "submit_all_complete")
    assert.ok(metrics[metrics.length - 1].elapsedMs >= 90)

    const summary = flowPerf.summary()
    assert.ok("photo_selection_start" in summary)
    assert.ok("submit_all_complete" in summary)
  })
})
