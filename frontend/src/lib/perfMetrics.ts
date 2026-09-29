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

class FlowPerfTracker {
  private startTime: number = Date.now()
  private lastMark: number = Date.now()
  private records: PerfRecord[] = []

  reset(): void {
    this.startTime = Date.now()
    this.lastMark = this.startTime
    this.records = []
  }

  record(event: FlowPerfEvent, details?: Record<string, unknown>): PerfRecord {
    const now = Date.now()
    const elapsedMs = now - this.startTime
    const intervalMs = now - this.lastMark
    this.lastMark = now

    const entry: PerfRecord = {
      event,
      elapsedMs,
      intervalMs,
      details,
    }

    this.records.push(entry)
    if (process.env.NODE_ENV !== "production") {
      console.info(`[FlowPerf] ${event}: ${elapsedMs}ms (+${intervalMs}ms)`, details || "")
    }
    return entry
  }

  getRecords(): PerfRecord[] {
    return [...this.records]
  }

  summary(): Record<string, number> {
    const summary: Record<string, number> = {}
    for (const r of this.records) {
      summary[r.event] = r.elapsedMs
    }
    return summary
  }
}

export const flowPerf = new FlowPerfTracker()
