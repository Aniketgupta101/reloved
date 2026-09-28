import type { NextFunction, Request, Response } from "express"

/**
 * In-memory token bucket for one Node process.
 * Several processes each keep their own map, so the real ceiling is roughly
 * limit × process count. That is enough to slow a single-machine script.
 *
 * Time: O(1) per request. Space: O(1) per active IP, capped.
 * A fixed window would allow about 2× the limit at the boundary. This bucket
 * refills smoothly, so a caller gets one burst of `limit`, then the steady rate.
 */

type Bucket = { tokens: number; updatedAt: number; idleAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const hop = raw?.split(",")[0]?.trim()
  return hop || req.ip || "unknown"
}

function evict(now: number) {
  if (buckets.size <= MAX_BUCKETS) return
  for (const [key, bucket] of buckets) {
    if (bucket.idleAt <= now) buckets.delete(key)
  }
  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next().value
    if (oldest === undefined) break
    buckets.delete(oldest)
  }
}

export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  evict(now)
  const refillPerMs = limit / windowMs
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { tokens: limit, updatedAt: now, idleAt: now + windowMs }
    buckets.set(key, bucket)
  } else {
    const elapsed = Math.max(0, now - bucket.updatedAt)
    bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillPerMs)
    bucket.updatedAt = now
    bucket.idleAt = now + windowMs
  }
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

export function limitRoute(name: string, limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${clientIp(req)}`
    if (allowRequest(key, limit, windowMs)) {
      next()
      return
    }
    res.status(429).json({ error: "Too many requests. Try again in a few minutes." })
  }
}
