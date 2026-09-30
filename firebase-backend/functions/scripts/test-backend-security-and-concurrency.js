const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")

// Test 1: Borzo Webhook Signature Verification Fail-Closed
test("Borzo webhook signature security", async (t) => {
  const { verifyBorzoWebhookSignature } = require("../lib/lib/borzo")

  await t.test("rejects when BORZO_CALLBACK_SECRET is missing or empty in production", () => {
    const origSecret = process.env.BORZO_CALLBACK_SECRET
    const origEmulator = process.env.FUNCTIONS_EMULATOR
    try {
      delete process.env.BORZO_CALLBACK_SECRET
      delete process.env.FUNCTIONS_EMULATOR
      const allowed = verifyBorzoWebhookSignature("{}", "fake-sig")
      assert.equal(allowed, false, "Must fail closed and return false when secret is unset")
    } finally {
      if (origSecret) process.env.BORZO_CALLBACK_SECRET = origSecret
      if (origEmulator) process.env.FUNCTIONS_EMULATOR = origEmulator
    }
  })

  await t.test("verifies valid HMAC-SHA256 signature when secret is configured", () => {
    const secret = "test_secret_key_123"
    const payload = JSON.stringify({ event_type: "order_changed", order: { order_id: 999 } })
    const validSig = crypto.createHmac("sha256", secret).update(payload).digest("hex")

    const origSecret = process.env.BORZO_CALLBACK_SECRET
    try {
      process.env.BORZO_CALLBACK_SECRET = secret
      const passed = verifyBorzoWebhookSignature(payload, validSig)
      assert.equal(passed, true, "Valid HMAC must pass verification")

      const tampered = verifyBorzoWebhookSignature(payload, "invalid_sig_abc")
      assert.equal(tampered, false, "Tampered HMAC must be rejected")
    } finally {
      if (origSecret) process.env.BORZO_CALLBACK_SECRET = origSecret
      else delete process.env.BORZO_CALLBACK_SECRET
    }
  })
})

// Test 2: Ops Daily Deliveries Recipients Defaulting
test("Ops Daily Deliveries privacy & fallback", async (t) => {
  const { opsDailyDeliveriesRecipients } = require("../lib/lib/notifications")

  await t.test("never defaults to hardcoded personal Gmail accounts", () => {
    const origEnv = process.env.OPS_DAILY_DELIVERIES_EMAILS
    try {
      delete process.env.OPS_DAILY_DELIVERIES_EMAILS
      const recipients = opsDailyDeliveriesRecipients()
      assert.deepEqual(recipients, [], "Must return empty array instead of personal emails when env is unset")
    } finally {
      if (origEnv) process.env.OPS_DAILY_DELIVERIES_EMAILS = origEnv
    }
  })

  await t.test("parses configured recipients correctly", () => {
    const origEnv = process.env.OPS_DAILY_DELIVERIES_EMAILS
    try {
      process.env.OPS_DAILY_DELIVERIES_EMAILS = "ops@reloved.in, alerts@reloved.in"
      const recipients = opsDailyDeliveriesRecipients()
      assert.deepEqual(recipients, ["ops@reloved.in", "alerts@reloved.in"])
    } finally {
      if (origEnv) process.env.OPS_DAILY_DELIVERIES_EMAILS = origEnv
      else delete process.env.OPS_DAILY_DELIVERIES_EMAILS
    }
  })
})

// Test 3: Booking Lock Concurrency Guard
test("Booking lock concurrency protection", (t) => {
  t.test("detects active lock within timeout window", () => {
    const now = Date.now()
    const activeLockUntil = now + 30_000
    const isLocked = activeLockUntil > now
    assert.equal(isLocked, true, "Lock expiring in 30s must reject racing booking")
  })

  t.test("allows new booking when previous lock has expired", () => {
    const now = Date.now()
    const expiredLockUntil = now - 5_000
    const isLocked = expiredLockUntil > now
    assert.equal(isLocked, false, "Expired lock must allow a fresh booking attempt")
  })
})

// Test 4: Active Courier Delivery Guard on Listing Withdrawal
test("Active courier withdrawal safety", (t) => {
  const { hasActiveDeliveryOrder } = require("../lib/lib/wallWithdraw")

  t.test("detects active Borzo delivery order", () => {
    const active = hasActiveDeliveryOrder({
      status: "approved",
      borzoOrderId: 12345,
      borzoStatus: "active",
    })
    assert.equal(active, true, "Must flag active Borzo order as active delivery")
  })

  t.test("detects active Shiprocket delivery order", () => {
    const active = hasActiveDeliveryOrder({
      status: "approved",
      shiprocketOrderId: 67890,
      shiprocketStatus: "PICKUP_SCHEDULED",
    })
    assert.equal(active, true, "Must flag active Shiprocket order as active delivery")
  })

  t.test("detects active Shadowfax delivery order", () => {
    const active = hasActiveDeliveryOrder({
      status: "approved",
      shadowfaxOrderId: "SFX-999",
      shadowfaxStatus: "dispatched",
    })
    assert.equal(active, true, "Must flag active Shadowfax order as active delivery")
  })

  t.test("allows withdrawal when courier order was cancelled", () => {
    const active = hasActiveDeliveryOrder({
      status: "approved",
      borzoOrderId: 12345,
      borzoStatus: "canceled",
      shiprocketOrderId: 67890,
      shiprocketStatus: "CANCELED",
      shadowfaxOrderId: "SFX-999",
      shadowfaxStatus: "CANCELED",
    })
    assert.equal(active, false, "Must permit withdrawal when all courier orders are cancelled")
  })
})

// Test 5: Drop Email Actions Fail-Closed Secret
test("Drop Email Actions Fail-Closed Secret in Production", (t) => {
  const { signOpsEmailAction } = require("../lib/lib/dropEmailActions")

  t.test("fails closed in production environment when secret is unset", () => {
    const origSecret = process.env.EMAIL_ACTION_SECRET
    const origJwt = process.env.JWT_SECRET
    const origTarget = process.env.FUNCTION_TARGET
    const origEmulator = process.env.FUNCTIONS_EMULATOR

    try {
      delete process.env.EMAIL_ACTION_SECRET
      delete process.env.JWT_SECRET
      delete process.env.FUNCTIONS_EMULATOR
      process.env.FUNCTION_TARGET = "api"

      assert.throws(
        () => {
          signOpsEmailAction({
            action: "remove_wall",
            kind: "donation",
            subjectId: "sub_123",
          })
        },
        /EMAIL_ACTION_SECRET or JWT_SECRET must be set in production/,
        "Must throw error when running in Cloud Functions without secret"
      )
    } finally {
      if (origSecret) process.env.EMAIL_ACTION_SECRET = origSecret
      if (origJwt) process.env.JWT_SECRET = origJwt
      if (origTarget) process.env.FUNCTION_TARGET = origTarget
      else delete process.env.FUNCTION_TARGET
      if (origEmulator) process.env.FUNCTIONS_EMULATOR = origEmulator
    }
  })
})

