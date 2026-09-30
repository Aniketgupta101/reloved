/**
 * Concurrency & Latency Benchmark Script
 * Tests local API endpoints at varying concurrency levels (1, 5, 10, 25, 50 requests)
 * Measures total time, avg latency, p95, p99, peak concurrency, and error rate.
 */
const http = require('http');

const PORT = 8787;
const HOST = 'localhost';

function request(path) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const duration = Date.now() - start;
        resolve({
          statusCode: res.statusCode,
          duration,
          headers: res.headers,
          dataLength: data.length
        });
      });
    });

    req.on('error', (err) => {
      const duration = Date.now() - start;
      reject({ error: err.message, duration });
    });

    req.end();
  });
}

async function runBenchmark(path, totalRequests, concurrency) {
  console.log(`\n--- Running benchmark: ${path} | Total: ${totalRequests} | Concurrency: ${concurrency} ---`);
  const latencies = [];
  let errors = 0;
  let inFlight = 0;
  let peakInFlight = 0;

  const queue = Array.from({ length: totalRequests }, (_, i) => i);
  const startTime = Date.now();

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      queue.shift();
      inFlight++;
      if (inFlight > peakInFlight) peakInFlight = inFlight;
      try {
        const res = await request(path);
        latencies.push(res.duration);
        if (res.statusCode >= 400) errors++;
      } catch (err) {
        errors++;
        latencies.push(err.duration);
      } finally {
        inFlight--;
      }
    }
  });

  await Promise.all(workers);
  const totalTime = Date.now() - startTime;

  latencies.sort((a, b) => a - b);
  const avg = latencies.reduce((sum, l) => sum + l, 0) / (latencies.length || 1);
  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const min = latencies[0] || 0;
  const max = latencies[latencies.length - 1] || 0;

  const result = {
    path,
    totalRequests,
    concurrency,
    totalTimeMs: totalTime,
    avgLatencyMs: Number(avg.toFixed(2)),
    minLatencyMs: min,
    p50LatencyMs: p50,
    p95LatencyMs: p95,
    p99LatencyMs: p99,
    maxLatencyMs: max,
    peakInFlight,
    errorCount: errors,
    errorRate: `${((errors / totalRequests) * 100).toFixed(1)}%`,
    rps: Number(((totalRequests / (totalTime / 1000))).toFixed(1))
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  console.log("Starting Concurrency Benchmark Suite against http://localhost:8787");
  const scenarios = [
    { path: '/api/items?status=wall&limit=24', total: 1, concurrency: 1 },
    { path: '/api/items?status=wall&limit=24', total: 5, concurrency: 5 },
    { path: '/api/items?status=wall&limit=24', total: 10, concurrency: 10 },
    { path: '/api/items?status=wall&limit=24', total: 25, concurrency: 25 },
    { path: '/api/items?status=wall&limit=24', total: 50, concurrency: 50 },
    { path: '/api/items?status=wall&limit=24', total: 100, concurrency: 100 },
  ];

  const results = [];
  for (const s of scenarios) {
    const res = await runBenchmark(s.path, s.total, s.concurrency);
    results.push(res);
  }

  console.log("\n================ BENCHMARK SUMMARY TABLE ================");
  console.table(results.map(r => ({
    "Requests": r.totalRequests,
    "Concurrency": r.concurrency,
    "Total Time (ms)": r.totalTimeMs,
    "Avg (ms)": r.avgLatencyMs,
    "p95 (ms)": r.p95LatencyMs,
    "p99 (ms)": r.p99LatencyMs,
    "Peak In-Flight": r.peakInFlight,
    "RPS": r.rps,
    "Errors": r.errorCount
  })));
}

main().catch(console.error);
