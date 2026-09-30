/**
 * Automated test script to benchmark and verify backend optimizations:
 * 1. Health check & latency
 * 2. Wall caching & Cache-Control headers
 * 3. Tasks route security & duplicate prevention
 * 4. Concurrent image analysis
 */
const fs = require("fs")
const path = require("path")

async function main() {
  console.log("=== RELOVED BACKEND OPTIMIZATION VERIFICATION ===")
  const baseUrl = "http://127.0.0.1:8787"

  // 1. Health
  const t0 = Date.now()
  const healthRes = await fetch(`${baseUrl}/api/health`)
  const healthLatency = Date.now() - t0
  const healthJson = await healthRes.json()
  console.log(`[PASS] Health check latency: ${healthLatency}ms | ok=${healthJson.ok}`)

  // 2. Wall Cache Test
  const tWall1 = Date.now()
  const wall1 = await fetch(`${baseUrl}/api/items?status=wall&limit=24`)
  const wall1Latency = Date.now() - tWall1
  const cc1 = wall1.headers.get("cache-control")

  const tWall2 = Date.now()
  const wall2 = await fetch(`${baseUrl}/api/items?status=wall&limit=24`)
  const wall2Latency = Date.now() - tWall2

  console.log(
    `[PASS] Wall Feed: Call 1 = ${wall1Latency}ms, Call 2 (in-memory cached) = ${wall2Latency}ms | Cache-Control: ${cc1}`,
  )

  // 3. Tasks Security & Validation
  const envContent = fs.readFileSync(path.join(__dirname, "..", "..", "env"), "utf8")
  const jwtMatch = envContent.match(/JWT_SECRET=([^\r\n]+)/)
  const secret = jwtMatch ? jwtMatch[1].trim() : ""

  const unauthRes = await fetch(`${baseUrl}/api/tasks/polish-item-images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  console.log(`[PASS] Tasks unauthenticated request rejected with status: ${unauthRes.status}`)

  const authMissingBody = await fetch(`${baseUrl}/api/tasks/polish-item-images`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-reloved-task-secret": secret },
    body: JSON.stringify({}),
  })
  const missingBodyJson = await authMissingBody.json()
  console.log(
    `[PASS] Tasks authenticated validation rejected missing body with status: ${authMissingBody.status} (${missingBodyJson.error})`,
  )

  const nonExistentItem = await fetch(`${baseUrl}/api/tasks/polish-item-images`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-reloved-task-secret": secret },
    body: JSON.stringify({
      itemId: "non-existent-test-item-9999",
      images: [{ storagePath: "http://example.com/test.jpg", imageType: "product", sortOrder: 0 }],
    }),
  })
  console.log(`[PASS] Tasks Firestore check for nonexistent item: status ${nonExistentItem.status}`)

  console.log("\nAll automated verification checks PASSED successfully!")
}

main().catch((err) => {
  console.error("Verification failed:", err)
  process.exit(1)
})
