/**
 * Concurrency-limited execution queue for bulk operations.
 * Runs `workerFn` for each item in `items`, with at most `concurrency` active in parallel.
 * As each item finishes, its result is placed in the returned array at the matching index.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  workerFn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIdx = 0
  const limit = Math.min(Math.max(1, concurrency), items.length)
  const workers = Array.from({ length: limit }, async () => {
    while (nextIdx < items.length) {
      const idx = nextIdx++
      results[idx] = await workerFn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return results
}
