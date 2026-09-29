/**
 * Controlled concurrency pool.
 * Executes an async task on each item in `items` with at most `concurrency` tasks running simultaneously.
 * Preserves the original order of the items in the returned results array.
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return []
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length))
  const results: R[] = new Array(items.length)
  let next = 0

  await Promise.all(
    Array.from({ length: safeConcurrency }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i], i)
      }
    }),
  )

  return results
}
