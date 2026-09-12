import fs from "fs"
import path from "path"

// Simple env loader
const envPath = path.resolve(__dirname, "../../.env.reloved-digital")
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8")
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (!process.env[key]) {
        process.env[key] = val
      }
    }
  }
}

import {
  borzoGetClient,
  borzoCalculateOrder,
  borzoCreateOrder,
  borzoGetOrder,
  borzoApiBase,
  borzoOpsPhone,
} from "../lib/borzo"

async function run() {
  console.log("=== Testing Borzo Connection ===")
  console.log("Base URL:", borzoApiBase())
  console.log("Ops Phone:", borzoOpsPhone())

  console.log("\n1. Testing GET /client...")
  const client = await borzoGetClient()
  console.log("Client Response:", JSON.stringify(client, null, 2))

  console.log("\n2. Testing calculate-order (Mumbai hop)...")
  const calc = await borzoCalculateOrder({
    pickupAddress: "Phoenix Palladium, Senapati Bapat Marg, Lower Parel, Mumbai, Maharashtra 400013",
    dropAddress: "Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra 400051",
    matter: "Reloved Test preloved package  Security Gate pickup",
  })
  console.log("Calculation:", calc)

  console.log("\n3. Placing Test Order #1...")
  const order1 = await borzoCreateOrder({
    clientOrderId: `reloved_test_1_${Date.now()}`,
    pickupAddress: "Phoenix Palladium, Senapati Bapat Marg, Lower Parel, Mumbai, Maharashtra 400013",
    dropAddress: "Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra 400051",
    matter: "Reloved Test #1 preloved package  Security Gate pickup",
    pickupNote: "Collect package directly from main gate security. Do not call flat.",
    dropNote: "Deliver package directly to main gate security. Do not call flat.",
  })
  console.log("Order #1 Created successfully!")
  console.log({
    orderId: order1.orderId,
    orderName: order1.orderName,
    status: order1.status,
    trackingUrl: order1.trackingUrl,
    fee: order1.paymentAmount || order1.deliveryFeeAmount,
  })

  console.log("\n4. Placing Test Order #2...")
  const order2 = await borzoCreateOrder({
    clientOrderId: `reloved_test_2_${Date.now()}`,
    pickupAddress: "Hiranandani Gardens, Powai, Mumbai, Maharashtra 400076",
    dropAddress: "Juhu Beach, Juhu Tara Road, Mumbai, Maharashtra 400049",
    matter: "Reloved Test #2 preloved package  Security Gate pickup",
    pickupNote: "Collect package directly from main gate security. Do not call flat.",
    dropNote: "Deliver package directly to main gate security. Do not call flat.",
  })
  console.log("Order #2 Created successfully!")
  console.log({
    orderId: order2.orderId,
    orderName: order2.orderName,
    status: order2.status,
    trackingUrl: order2.trackingUrl,
    fee: order2.paymentAmount || order2.deliveryFeeAmount,
  })

  console.log("\n5. Querying Order #1 back from Borzo...")
  const fetched = await borzoGetOrder(order1.orderId)
  console.log("Fetched Order #1:", {
    orderId: fetched?.orderId,
    status: fetched?.status,
    trackingUrl: fetched?.trackingUrl,
  })

  console.log("\n=== ALL 2 TEST ORDERS COMPLETED SUCCESSFULLY! ===")
}

run().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
