/**
 * Lightweight performance instrumentation for backend operations.
 * Captures duration, operation name, status, and metadata without leaking sensitive data.
 */

export type PerfOperation =
  | "photo_upload"
  | "photo_analyze"
  | "photo_cutout"
  | "studio_polish"
  | "task_enqueue"
  | "task_execute"
  | "donation_submit"
  | "wall_query"

export function logTiming(
  operation: PerfOperation,
  durationMs: number,
  meta?: {
    id?: string
    count?: number
    status?: "ok" | "failed" | "cached"
    error?: string
  },
): void {
  const metaStr = meta
    ? ` [${Object.entries(meta)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}]`
    : ""
  console.info(`[PERF] ${operation} took ${Math.round(durationMs)}ms${metaStr}`)
}

export async function measureTiming<T>(
  operation: PerfOperation,
  fn: () => Promise<T>,
  meta?: { id?: string; count?: number },
): Promise<T> {
  const start = Date.now()
  try {
    const res = await fn()
    const duration = Date.now() - start
    logTiming(operation, duration, { ...meta, status: "ok" })
    return res
  } catch (err: any) {
    const duration = Date.now() - start
    logTiming(operation, duration, {
      ...meta,
      status: "failed",
      error: String(err?.message || err).slice(0, 100),
    })
    throw err
  }
}
