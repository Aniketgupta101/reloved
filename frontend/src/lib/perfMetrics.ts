/**
 * Performance instrumentation for the Multi-Item / Bulk Image Upload & Submission flow.
 * Measures wall-clock timestamps and latency intervals across the entire drop pipeline.
 */

export type FlowPerfEvent =
  | "photo_selection_start"
  | "compression_complete"
  | "catalog_start"
  | "catalog_chunk_complete"
  | "catalog_all_complete"
  | "cutout_start"
  | "cutout_chunk_complete"
  | "cutout_all_complete"
  | "review_entered"
  | "submit_start"
  | "submit_item_complete"
  | "submit_all_complete"

export type PerfRecord = {
  event: FlowPerfEvent
  elapsedMs: number
  intervalMs?: number
  details?: Record<string, unknown>
}

class FlowPerformanceTracker {
  private startTime: number | null = null
  private lastTime: number | null = null
  private records: PerfRecord[] = []

  mark(event: FlowPerfEvent, details?: Record<string, unknown>): number {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now()
    if (this.startTime === null || event === "photo_selection_start") {
      this.startTime = now
      this.lastTime = now
      this.records = []
    }
    const elapsedMs = Math.round(now - this.startTime)
    const intervalMs = this.lastTime !== null ? Math.round(now - this.lastTime) : 0
    this.lastTime = now

    const record: PerfRecord = { event, elapsedMs, intervalMs, details }
    this.records.push(record)

    if (process.env.NODE_ENV !== "test") {
      console.info(`[FlowPerf] ${event} — elapsed: ${elapsedMs}ms (+${intervalMs}ms)`, details || "")
    }
    return elapsedMs
  }

  record(event: FlowPerfEvent, details?: Record<string, unknown>): PerfRecord {
    this.mark(event, details)
    return this.records[this.records.length - 1]
  }

  getMetrics(): PerfRecord[] {
    return [...this.records]
  }

  getRecords(): PerfRecord[] {
    return [...this.records]
  }

  summary(): Record<string, number> {
    const sum: Record<string, number> = {}
    for (const r of this.records) {
      sum[r.event] = r.elapsedMs
    }
    return sum
  }

  reset(): void {
    this.startTime = null
    this.lastTime = null
    this.records = []
  }
}

export const flowPerf = new FlowPerformanceTracker()
