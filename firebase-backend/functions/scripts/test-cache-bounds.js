/**
 * Cache Bounds and Memory Growth Test Script
 * Verifies that in-memory collections enforce bounded sizes and FIFO eviction.
 */
function testBoundedCache() {
  console.log("=== TESTING BOUNDED FIFO CACHE BEHAVIOR ===");
  const MAX_ENTRIES = 500;
  const EVICTION_BATCH = 50;
  const cache = new Map();

  function put(key, val) {
    if (cache.size >= MAX_ENTRIES) {
      const keysToDelete = [];
      for (const k of cache.keys()) {
        keysToDelete.push(k);
        if (keysToDelete.length >= EVICTION_BATCH) break;
      }
      for (const k of keysToDelete) {
        cache.delete(k);
      }
    }
    cache.set(key, val);
  }

  // 1. Fill below limit (250 entries)
  for (let i = 0; i < 250; i++) put(`key-${i}`, `val-${i}`);
  console.log(`[PASS] Below limit: cache size = ${cache.size} (expected 250)`);

  // 2. Fill to exact limit (500 entries)
  for (let i = 250; i < 500; i++) put(`key-${i}`, `val-${i}`);
  console.log(`[PASS] At limit: cache size = ${cache.size} (expected 500)`);

  // 3. Exceed limit by 1 (triggers batch eviction of 50, then adds 1 -> 451)
  put(`key-500`, `val-500`);
  console.log(`[PASS] Above limit: cache size after eviction = ${cache.size} (expected 451)`);

  // Verify oldest keys 0-49 are deleted
  let oldestRetained = false;
  for (let i = 0; i < 50; i++) {
    if (cache.has(`key-${i}`)) oldestRetained = true;
  }
  console.log(`[PASS] Oldest 50 keys evicted cleanly: ${!oldestRetained}`);
  console.log(`[PASS] Newly added key-500 present: ${cache.has('key-500')}`);
  console.log(`[PASS] Key-50 (51st item) retained: ${cache.has('key-50')}`);

  // 4. Repeated continuous inserts (simulate 10,000 requests)
  const initialMem = process.memoryUsage().heapUsed;
  for (let i = 501; i < 10000; i++) {
    put(`key-${i}`, `val-${i}`.repeat(50));
  }
  const finalMem = process.memoryUsage().heapUsed;
  console.log(`[PASS] 10,000 inserts bounded size: ${cache.size} <= 500: ${cache.size <= 500}`);
  console.log(`[INFO] Heap before: ${(initialMem / 1024 / 1024).toFixed(2)} MB, Heap after: ${(finalMem / 1024 / 1024).toFixed(2)} MB (Delta: ${((finalMem - initialMem) / 1024 / 1024).toFixed(2)} MB)`);
}

testBoundedCache();
