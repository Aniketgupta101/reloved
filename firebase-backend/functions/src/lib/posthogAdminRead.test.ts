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
    acquisition: {
      body: {
        columns: ["dimension", "value", "events", "users", "sessions"],
        results: [
          ["referrer", "https://www.search.example/path?email=private@example.com", 7, 4, 3],
          ["utm_source", "newsletter", 5, 3, 2],
          ["utm_medium", "email", 5, 3, 2],
          ["utm_campaign", "autumn-launch", 4, 3, 2],
          ["landing_page", "/wall/private-item-id?token=secret", 3, 2, 2],
          ["utm_campaign", "private@example.com", 99, 88, 77],
          ["unknown", "must-not-escape", 99, 88, 77],
        ],
      },
    },
    journeys: {
      body: {
        columns: [
          "donation_started",
          "donation_step_1",
          "donation_step_2",
          "donation_step_3",
          "donation_step_6",
          "donation_step_7",
          "donation_step_8",
          "donation_submitted",
          "donation_completed",
          "item_viewed",
          "claim_started",
          "claim_submitted",
        ],
        results: [[6, 6, 5, 4, 4, 3, 2, 3, 2, 8, 5, 3]],
      },
    },
    "wall-filters": {
      body: {
        columns: ["type", "value", "events", "users"],
        results: [
          ["category", "Outerwear", 8, 5],
          ["category", "All", 2, 2],
          ["category", "private@example.com", 99, 88],
          ["search", "private free text", 99, 88],
        ],
      },
    },
    "device-conversion": {
      body: {
        columns: ["device", "visitors", "donation_started", "donation_submitted", "claim_started", "claim_submitted"],
        results: [
          ["Mobile", 7, 4, 3, 2, 1],
          ["private@example.com", 99, 88, 77, 66, 55],
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
  assert.deepEqual(result.acquisition.referrers[0], {
    id: "search.example",
    label: "search.example",
    events: 7,
    users: 4,
    sessions: 3,
  })
  assert.deepEqual(result.acquisition.utmSources[0], {
    id: "newsletter",
    label: "newsletter",
    events: 5,
    users: 3,
    sessions: 2,
  })
  assert.deepEqual(result.acquisition.landingPages[0], {
    id: "/wall/:item",
    label: "/wall/:item",
    events: 3,
    users: 2,
    sessions: 2,
  })
  assert.deepEqual(result.journeys.drop.map((step: any) => [step.id, step.label, step.users]), [
    ["donation_started", "Started", 6],
    ["donation_step_1", "Photo", 6],
    ["donation_step_2", "Details", 5],
    ["donation_step_3", "You", 4],
    ["donation_step_6", "Review", 4],
    ["donation_step_7", "Post", 3],
    ["donation_step_8", "Login", 2],
    ["donation_submitted", "Submitted", 3],
    ["donation_completed", "Completed", 2],
  ])
  assert.deepEqual(result.journeys.claim.map((step: any) => [step.id, step.users]), [
    ["item_viewed", 8],
    ["claim_started", 5],
    ["claim_submitted", 3],
  ])
  assert.deepEqual(result.wallFilters, [
    { type: "category", value: "Outerwear", events: 8, users: 5 },
    { type: "category", value: "All", events: 2, users: 2 },
  ])
  assert.deepEqual(result.deviceConversion, [
    { device: "Mobile", visitors: 7, donationStarted: 4, donationSubmitted: 3, claimStarted: 2, claimSubmitted: 1 },
  ])
  assert.equal(JSON.stringify(result).includes("private@example.com"), false)
  assert.equal(JSON.stringify(result).includes("person-secret"), false)
  assert.equal(JSON.stringify(result).includes("private-item-id"), false)
  assert.equal(JSON.stringify(result).includes("token=secret"), false)
  assert.equal(JSON.stringify(result).includes("raw_properties"), false)
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false)
  assert.equal(calls.length, 9)
  for (const call of calls) {
    assert.equal(call.url, "https://us.posthog.com/api/projects/12345/query/")
    assert.equal(call.init.method, "POST")
    assert.equal((call.init.headers as Record<string, string>).Authorization, "Bearer phx_test_read_only")
    assert.equal(call.body.query.kind, "HogQLQuery")
  }
})

test("aggregate queries use current event names, exact give steps, safe attribution, and read-only HogQL", async () => {
  const calls: Array<{ url: string; init: RequestInit; body: any }> = []
  const adapter = model.createPostHogAdminReadAdapter({
    env: configuredEnv,
    fetch: mockFetch(successReplies(), calls),
  })
  await adapter.read("30d")
  const byMarker = new Map<string, string>()
  for (const call of calls) {
    const query = String(call.body.query.query)
    const marker = query.match(/\/\* reloved:([a-z-]+) \*\//)?.[1]
    assert.ok(marker, query)
    byMarker.set(marker, query)
    assert.match(query, /INTERVAL 30 DAY/)
    assert.match(query.replace(/^\/\*[\s\S]*?\*\//, "").trimStart(), /^SELECT\b/i)
    assert.doesNotMatch(query, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i)
  }
  assert.deepEqual([...byMarker.keys()].sort(), [
    "acquisition",
    "device-conversion",
    "dimensions",
    "journeys",
    "pages",
    "schema",
    "summary",
    "trend",
    "wall-filters",
  ])
  const summary = byMarker.get("summary") || ""
  for (const event of [
    "cta_drop_item_clicked",
    "cta_claim_item_clicked",
    "cta_explore_wall_clicked",
    "nav_link_clicked",
    "nav_account_clicked",
    "footer_link_clicked",
    "help_contact_cta_clicked",
    "faq_question_opened",
  ]) assert.match(summary, new RegExp(`'${event}'`))
  assert.doesNotMatch(summary, /'cta_clicked'/)

  const acquisition = byMarker.get("acquisition") || ""
  for (const property of [
    "$session_entry_referring_domain",
    "$session_entry_utm_source",
    "$session_entry_utm_medium",
    "$session_entry_utm_campaign",
    "$session_entry_pathname",
  ]) assert.ok(acquisition.includes(`properties.${property}`), property)
  assert.doesNotMatch(acquisition, /\$current_url/)

  const journeys = byMarker.get("journeys") || ""
  for (const step of [1, 2, 3, 6, 7, 8]) {
    assert.ok(journeys.includes(`toInt64OrNull(toString(properties.step)) = ${step}`), `step ${step}`)
  }
  assert.doesNotMatch(journeys, /properties\.(reference|item_id|slug|email|phone|message)/)
  assert.doesNotMatch(journeys, /\b(rate|divide)\b/i)

  const wallFilters = byMarker.get("wall-filters") || ""
  assert.match(wallFilters, /event = 'wall_filter_changed'/)
  assert.match(wallFilters, /toString\(properties\.type\) = 'category'/)
  for (const category of ["All", "Outerwear", "Tops", "Bottoms", "Kicks", "Bags", "Accessories"]) {
    assert.match(wallFilters, new RegExp(`'${category}'`))
  }
  assert.doesNotMatch(wallFilters, /properties\.(search|query|label|path)/)

  const device = byMarker.get("device-conversion") || ""
  assert.match(device, /uniqIf\(distinct_id, event = '\$pageview'\) AS visitors/)
  assert.doesNotMatch(device, /\b(rate|divide)\b/i)
})

test("missing properties and zero stage counts stay explicit without manufacturing rates or leaking unsafe values", async () => {
  const replies = successReplies()
  replies.acquisition = {
    body: {
      columns: ["dimension", "value", "events", "users", "sessions"],
      results: [
        ["referrer", null, 4, 3, 2],
        ["utm_source", "https://private.example/?email=user@example.com", 4, 3, 2],
        ["landing_page", "/track/RLV-PRIVATE-123?email=user@example.com", 2, 2, 2],
      ],
    },
  }
  replies.journeys = {
    body: {
      columns: [
        "donation_started", "donation_step_1", "donation_step_2", "donation_step_3",
        "donation_step_6", "donation_step_7", "donation_step_8", "donation_submitted",
        "donation_completed", "item_viewed", "claim_started", "claim_submitted",
      ],
      results: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    },
  }
  replies["wall-filters"] = {
    body: {
      columns: ["type", "value", "events", "users"],
      results: [["category", null, 9, 8], ["category", "Custom free text", 7, 6]],
    },
  }
  const adapter = model.createPostHogAdminReadAdapter({ env: configuredEnv, fetch: mockFetch(replies, []) })
  const result = await adapter.read("7d")
  assert.equal(result.status, "connected")
  assert.deepEqual(result.acquisition.referrers, [])
  assert.deepEqual(result.acquisition.utmSources, [])
  assert.deepEqual(result.acquisition.landingPages, [
    { id: "/track/:reference", label: "/track/:reference", events: 2, users: 2, sessions: 2 },
  ])
  assert.equal(result.journeys.drop.every((step: any) => step.users === 0), true)
  assert.equal(result.journeys.claim.every((step: any) => step.users === 0), true)
  assert.equal(JSON.stringify(result.journeys).includes("rate"), false)
  assert.deepEqual(result.wallFilters, [])
  assert.equal(JSON.stringify(result).includes("RLV-PRIVATE-123"), false)
  assert.equal(JSON.stringify(result).includes("user@example.com"), false)
})

test("backend credentials reject arbitrary egress hosts, ingestion hosts, and capture tokens without a network call", async () => {
  const invalidEnvironments = [
    { ...configuredEnv, POSTHOG_HOST: "https://attacker.example" },
    { ...configuredEnv, POSTHOG_HOST: "https://us.i.posthog.com" },
    { ...configuredEnv, POSTHOG_HOST: "https://us.posthog.com:8443" },
    { ...configuredEnv, POSTHOG_PERSONAL_API_KEY: "phc_capture_only" },
  ]
  for (const env of invalidEnvironments) {
    let calls = 0
    const adapter = model.createPostHogAdminReadAdapter({
      env,
      fetch: async () => { calls += 1; throw new Error("must not run") },
    })
    const result = await adapter.read("7d")
    assert.equal(result.status, "misconfigured")
    assert.equal(calls, 0)
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
  assert.equal(requestCount, 9)
  assert.equal(first.cached, false)
  assert.equal(concurrent.overview.pageViews, first.overview.pageViews)
  const cached = await adapter.read("7d")
  assert.equal(cached.cached, true)
  assert.equal(requestCount, 9)
  await adapter.read("24h")
  assert.equal(requestCount, 18)
  now += 60_001
  await adapter.read("7d")
  assert.equal(requestCount, 27)
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
