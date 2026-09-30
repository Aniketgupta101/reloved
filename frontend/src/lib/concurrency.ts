/**
 * Controlled concurrency pool for frontend async operations.
 * Binds maximum simultaneous asynchronous promises to `concurrency` workers.
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
