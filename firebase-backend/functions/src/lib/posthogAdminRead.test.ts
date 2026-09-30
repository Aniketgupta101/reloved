import assert from "node:assert/strict"
import { test } from "node:test"

let model: any = {}
try {
  model = require("./posthogAdminRead")
} catch {
  // The first TDD run intentionally loads no implementation.
}

const configuredEnv = {
  POSTHOG_PERSONAL_API_KEY: "phx_test_read_only",
  POSTHOG_PROJECT_ID: "12345",
  POSTHOG_HOST: "https://us.posthog.com",
}

type MockReply = { status?: number; body?: unknown; headers?: Record<string, string> }

function mockFetch(
  replies: Record<string, MockReply>,
  calls: Array<{ url: string; init: RequestInit; body: any }>,
) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body || "{}"))
    calls.push({ url, init: init || {}, body })
    const query = String(body?.query?.query || "")
    const marker = Object.keys(replies).find((key) => query.includes(`reloved:${key}`))
    const reply = marker ? replies[marker] : { status: 500, body: { detail: "Unexpected query" } }
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { "Content-Type": "application/json", ...(reply.headers || {}) },
    })
  }
}

function successReplies(): Record<string, MockReply> {
  return {
    summary: {
      body: {
        columns: ["event", "events", "users", "sessions"],
        results: [
          ["$pageview", 18, 7, 5],
          ["claim_started", 4, 3, 2],
          ["private_unknown_event", 99, 88, 77],
        ],
      },
    },
    trend: {
      body: {
        columns: ["day", "page_views", "visitors", "sessions"],
        results: [["2026-09-30", 18, 7, 5]],
      },
    },
    pages: {
      body: {
        columns: ["path", "page_views", "visitors", "distinct_id", "email"],
        results: [["/wall?email=private@example.com", 9, 5, "person-secret", "private@example.com"]],
      },
    },
    dimensions: {
      body: {
        columns: ["dimension", "value", "events", "users", "raw_properties"],
        results: [
          ["device", "Mobile", 8, 4, { email: "private@example.com" }],
          ["device", "private@example.com", 2, 1, null],
          ["country", "India", 7, 3, { phone: "+910000000000" }],
          ["unknown_dimension", "must-not-escape", 6, 2, { token: "secret" }],
        ],
      },
    },
    schema: {
      body: {
        columns: ["event", "pathname", "step", "flow", "category", "source"],
        results: [
          ["donation_step_viewed", 0, 12, 12, 0, 0],
          ["$pageview", 18, 0, 0, 0, 0],
          ["private_unknown_event", 99, 0, 0, 0, 0],
        ],
      },
    },
  }
}

test("missing backend read credentials is honest and performs no network request", async () => {
  assert.equal(typeof model.createPostHogAdminReadAdapter, "function")
  let calls = 0
  const adapter = model.createPostHogAdminReadAdapter({
    env: { VITE_POSTHOG_PROJECT_TOKEN: "phc_capture_only", VITE_POSTHOG_HOST: "https://us.i.posthog.com" },
    fetch: async () => { calls += 1; throw new Error("must not run") },
  })
  const result = await adapter.read("7d")
  assert.equal(result.status, "misconfigured")
  assert.equal(result.message, "PostHog historical reads are not configured.")
  assert.equal(result.cached, false)
  assert.equal(calls, 0)
  assert.deepEqual(result.requiredEnvironment, [
    "POSTHOG_PERSONAL_API_KEY",
    "POSTHOG_PROJECT_ID",
    "POSTHOG_HOST",
  ])
})

test("configured adapter calls only the project Query API with bearer auth and normalized aggregates", async () => {
  const calls: Array<{ url: string; init: RequestInit; body: any }> = []
  const adapter = model.createPostHogAdminReadAdapter({
    env: configuredEnv,
    fetch: mockFetch(successReplies(), calls),
    now: () => Date.parse("2026-09-30T10:00:00.000Z"),
  })
  const result = await adapter.read("7d")
  assert.equal(result.status, "connected")
  assert.equal(result.range, "7d")
  assert.equal(result.source, "PostHog")
  assert.equal(result.overview.pageViews, 18)
  assert.equal(result.overview.uniqueVisitors, 7)
  assert.equal(result.overview.sessions, 5)
  assert.deepEqual(result.overview.events.map((row: any) => row.id), ["$pageview", "claim_started"])
  assert.equal(result.traffic[0].at, "2026-09-30")
  assert.equal(result.topPages[0].label, "/wall")
  assert.deepEqual(result.dimensions.device[0], { label: "Mobile", events: 8, users: 4 })
  assert.equal(result.dimensions.device.length, 1)
  assert.deepEqual(result.dimensions.country[0], { label: "India", events: 7, users: 3 })
  assert.deepEqual(result.schema, [
    { event: "$pageview", properties: ["pathname"] },
    { event: "donation_step_viewed", properties: ["flow", "step"] },
  ])
  assert.equal(JSON.stringify(result).includes("private@example.com"), false)
  assert.equal(JSON.stringify(result).includes("person-secret"), false)
  assert.equal(JSON.stringify(result).includes("raw_properties"), false)
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false)
  assert.equal(calls.length, 5)
  for (const call of calls) {
    assert.equal(call.url, "https://us.posthog.com/api/projects/12345/query/")
    assert.equal(call.init.method, "POST")
    assert.equal((call.init.headers as Record<string, string>).Authorization, "Bearer phx_test_read_only")
    assert.equal(call.body.query.kind, "HogQLQuery")
  }
})

for (const [name, statusCode, expected] of [
  ["unauthorized", 401, "unauthorized"],
  ["forbidden", 403, "unauthorized"],
  ["rate limited", 429, "rate-limited"],
  ["provider failure", 503, "unavailable"],
] as const) {
  test(`${name} response maps to a stable health state without provider body leakage`, async () => {
    const calls: Array<{ url: string; init: RequestInit; body: any }> = []
    const adapter = model.createPostHogAdminReadAdapter({
      env: configuredEnv,
      fetch: mockFetch({
        summary: { status: statusCode, body: { detail: "private provider detail with user@example.com" }, headers: { "Retry-After": "30" } },
      }, calls),
    })
    const result = await adapter.read("24h")
    assert.equal(result.status, expected)
    assert.equal(JSON.stringify(result).includes("user@example.com"), false)
    assert.equal(result.retryAfterSeconds, statusCode === 429 ? 30 : null)
  })
}

test("timeout maps to unavailable and aborts the provider request", async () => {
  let sawAbort = false
  const adapter = model.createPostHogAdminReadAdapter({
    env: configuredEnv,
    timeoutMs: 5,
    fetch: async (_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        sawAbort = true
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
      })
    }),
  })
  const result = await adapter.read("30d")
  assert.equal(result.status, "unavailable")
  assert.equal(result.message, "PostHog did not respond in time.")
  assert.equal(sawAbort, true)
})

test("short cache is range-scoped and coalesces concurrent reads", async () => {
  let requestCount = 0
  let now = 1_000
  const replies = successReplies()
  const adapter = model.createPostHogAdminReadAdapter({
    env: configuredEnv,
    now: () => now,
    cacheTtlMs: 60_000,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      requestCount += 1
      await Promise.resolve()
      return mockFetch(replies, [])(input, init)
    },
  })
  const [first, concurrent] = await Promise.all([adapter.read("7d"), adapter.read("7d")])
  assert.equal(requestCount, 5)
  assert.equal(first.cached, false)
  assert.equal(concurrent.overview.pageViews, first.overview.pageViews)
  const cached = await adapter.read("7d")
  assert.equal(cached.cached, true)
  assert.equal(requestCount, 5)
  await adapter.read("24h")
  assert.equal(requestCount, 10)
  now += 60_001
  await adapter.read("7d")
  assert.equal(requestCount, 15)
})

test("Control Center exposes PostHog through a GET route after admin authentication middleware", () => {
  const routeModule = require("../routes/adminControlCenter")
  const layers = routeModule.adminControlCenterRouter.stack
  const routeLayer = layers.find((layer: any) => layer.route?.path === "/analytics/posthog")
  assert.ok(routeLayer, "expected /analytics/posthog route")
  assert.deepEqual(routeLayer.route.methods, { get: true })
  const authIndex = layers.findIndex((layer: any) => layer.name === "requireAdmin")
  assert.ok(authIndex >= 0)
  assert.ok(authIndex < layers.indexOf(routeLayer))
})
