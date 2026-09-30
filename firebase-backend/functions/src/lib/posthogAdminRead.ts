import type {
  AdminPostHogSnapshot,
  PostHogAggregateRow,
  PostHogAnalyticsRange,
  PostHogDimensionRow,
  PostHogReadStatus,
  PostHogTrafficPoint,
} from "../../../../shared/adminControlCenter"

const REQUIRED_ENVIRONMENT = [
  "POSTHOG_PERSONAL_API_KEY",
  "POSTHOG_PROJECT_ID",
  "POSTHOG_HOST",
] as const

const ALLOWED_EVENTS = new Set([
  "$pageview",
  "cta_clicked",
  "item_card_clicked",
  "item_viewed",
  "claim_started",
  "claim_submitted",
  "claim_failed",
  "donation_started",
  "donation_step_viewed",
  "donation_submitted",
  "donation_completed",
  "donation_failed",
  "login_started",
  "login_completed",
  "onboarding_completed",
  "wall_filter_changed",
])

const ALLOWED_DIMENSIONS = new Set(["device", "browser", "os", "country", "city"])
const SCHEMA_PROPERTIES = {
  pathname: "$pathname",
  current_url: "$current_url",
  referrer: "$referrer",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  device_type: "$device_type",
  browser: "$browser",
  os: "$os",
  screen_height: "$screen_height",
  screen_width: "$screen_width",
  country: "$geoip_country_name",
  city: "$geoip_city_name",
  flow: "flow",
  step: "step",
  category: "category",
  item: "item",
  environment: "environment",
  source: "source",
  status: "status",
  logged_in: "logged_in",
  method: "method",
  role: "role",
  onboarded: "onboarded",
} as const
const ALLOWED_SCHEMA_PROPERTIES = new Set(Object.keys(SCHEMA_PROPERTIES))
const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_CACHE_TTL_MS = 90_000

type ReadEnvironment = Record<string, string | undefined>
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface PostHogAdminReadOptions {
  env?: ReadEnvironment
  fetch?: FetchLike
  now?: () => number
  timeoutMs?: number
  cacheTtlMs?: number
}

type QueryResult = {
  columns?: unknown
  results?: unknown
}

type ProviderError = Error & {
  status?: number
  retryAfterSeconds?: number | null
  timedOut?: boolean
}

interface PostHogAdminReadAdapter {
  read(range: PostHogAnalyticsRange): Promise<AdminPostHogSnapshot>
  clearCache(): void
}

function finiteCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function boundedLabel(value: unknown, max = 160): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max)
}

function safePath(value: unknown): string {
  const raw = boundedLabel(value, 500)
  if (!raw) return "/"
  try {
    const parsed = new URL(raw, "https://reloved.digital")
    return boundedLabel(parsed.pathname || "/", 160)
  } catch {
    return boundedLabel(raw.split(/[?#]/, 1)[0] || "/", 160)
  }
}

function safeDimensionLabel(value: unknown): string | null {
  const label = boundedLabel(value, 80) || "Unknown"
  const looksLikeEmail = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(label)
  const looksLikePhone = label.replace(/\D/g, "").length >= 8
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(label)
  return looksLikeEmail || looksLikePhone || looksLikeUrl ? null : label
}

function emptyDimensions(): AdminPostHogSnapshot["dimensions"] {
  return { device: [], browser: [], os: [], country: [], city: [] }
}

function baseSnapshot(
  range: PostHogAnalyticsRange,
  checkedAt: string,
  status: PostHogReadStatus,
  message: string | null,
): AdminPostHogSnapshot {
  return {
    status,
    source: "PostHog",
    range,
    checkedAt,
    cached: false,
    latencyMs: null,
    message,
    retryAfterSeconds: null,
    requiredEnvironment: REQUIRED_ENVIRONMENT,
    overview: { pageViews: null, uniqueVisitors: null, sessions: null, events: [] },
    traffic: [],
    topPages: [],
    dimensions: emptyDimensions(),
    schema: [],
  }
}

function readConfig(env: ReadEnvironment): { key: string; projectId: string; host: string } | null {
  const key = String(env.POSTHOG_PERSONAL_API_KEY || "").trim()
  const projectId = String(env.POSTHOG_PROJECT_ID || "").trim()
  const rawHost = String(env.POSTHOG_HOST || "").trim()
  if (!key || !projectId || !rawHost || !/^\d+$/.test(projectId)) return null
  try {
    const parsed = new URL(rawHost)
    const ingestionHost = parsed.hostname.endsWith(".i.posthog.com")
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || ingestionHost) {
      return null
    }
    const path = parsed.pathname.replace(/\/+$/, "")
    return { key, projectId, host: `${parsed.origin}${path}` }
  } catch {
    return null
  }
}

function queryWindow(range: PostHogAnalyticsRange): string {
  if (range === "24h") return "INTERVAL 24 HOUR"
  if (range === "30d") return "INTERVAL 30 DAY"
  return "INTERVAL 7 DAY"
}

const QUERY_EVENTS = [...ALLOWED_EVENTS].map((event) => `'${event.replace(/'/g, "\\'")}'`).join(", ")

function queries(range: PostHogAnalyticsRange): Record<"summary" | "trend" | "pages" | "dimensions" | "schema", string> {
  const window = queryWindow(range)
  const where = `timestamp >= now() - ${window} AND event IN (${QUERY_EVENTS})`
  const schemaCounts = Object.entries(SCHEMA_PROPERTIES)
    .map(([alias, property]) => `countIf(notEmpty(toString(properties.${property}))) AS ${alias}`)
    .join(",\n  ")
  return {
    summary: `/* reloved:summary */
SELECT event, count() AS events, uniq(distinct_id) AS users,
  uniqIf(toString(properties.$session_id), notEmpty(toString(properties.$session_id))) AS sessions
FROM events WHERE ${where}
GROUP BY event ORDER BY events DESC LIMIT 100`,
    trend: `/* reloved:trend */
SELECT toDate(timestamp) AS day,
  countIf(event = '$pageview') AS page_views,
  uniqIf(distinct_id, event = '$pageview') AS visitors,
  uniqIf(toString(properties.$session_id), notEmpty(toString(properties.$session_id))) AS sessions
FROM events WHERE ${where}
GROUP BY day ORDER BY day ASC LIMIT 32`,
    pages: `/* reloved:pages */
SELECT coalesce(nullIf(toString(properties.$pathname), ''), '/') AS path,
  count() AS page_views, uniq(distinct_id) AS visitors
FROM events WHERE timestamp >= now() - ${window} AND event = '$pageview'
GROUP BY path ORDER BY page_views DESC LIMIT 25`,
    dimensions: `/* reloved:dimensions */
SELECT dimension, value, sum(events) AS events, sum(users) AS users FROM (
  SELECT 'device' AS dimension, coalesce(nullIf(toString(properties.$device_type), ''), 'Unknown') AS value, count() AS events, uniq(distinct_id) AS users FROM events WHERE ${where} GROUP BY value
  UNION ALL SELECT 'browser', coalesce(nullIf(toString(properties.$browser), ''), 'Unknown'), count(), uniq(distinct_id) FROM events WHERE ${where} GROUP BY coalesce(nullIf(toString(properties.$browser), ''), 'Unknown')
  UNION ALL SELECT 'os', coalesce(nullIf(toString(properties.$os), ''), 'Unknown'), count(), uniq(distinct_id) FROM events WHERE ${where} GROUP BY coalesce(nullIf(toString(properties.$os), ''), 'Unknown')
  UNION ALL SELECT 'country', coalesce(nullIf(toString(properties.$geoip_country_name), ''), 'Unknown'), count(), uniq(distinct_id) FROM events WHERE ${where} GROUP BY coalesce(nullIf(toString(properties.$geoip_country_name), ''), 'Unknown')
  UNION ALL SELECT 'city', coalesce(nullIf(toString(properties.$geoip_city_name), ''), 'Unknown'), count(), uniq(distinct_id) FROM events WHERE ${where} GROUP BY coalesce(nullIf(toString(properties.$geoip_city_name), ''), 'Unknown')
) GROUP BY dimension, value ORDER BY dimension, events DESC LIMIT 100`,
    schema: `/* reloved:schema */
SELECT event,
  ${schemaCounts}
FROM events WHERE ${where}
GROUP BY event ORDER BY event ASC LIMIT 100`,
  }
}

function rows(result: QueryResult, expectedColumns: readonly string[]): unknown[][] {
  if (!Array.isArray(result.columns) || !Array.isArray(result.results)) return []
  const columns = result.columns.map(String)
  if (!expectedColumns.every((column, index) => columns[index] === column)) return []
  return result.results.filter(Array.isArray) as unknown[][]
}

function normalizeSummary(result: QueryResult): AdminPostHogSnapshot["overview"] {
  const events: PostHogAggregateRow[] = []
  let pageViews: number | null = null
  let uniqueVisitors: number | null = null
  let sessions: number | null = null
  for (const row of rows(result, ["event", "events", "users", "sessions"])) {
    const event = boundedLabel(row[0], 80)
    if (!ALLOWED_EVENTS.has(event)) continue
    const aggregate = { id: event, label: event, events: finiteCount(row[1]), users: finiteCount(row[2]) }
    events.push(aggregate)
    if (event === "$pageview") {
      pageViews = aggregate.events
      uniqueVisitors = aggregate.users
      sessions = finiteCount(row[3])
    }
  }
  return { pageViews, uniqueVisitors, sessions, events }
}

function normalizeTrend(result: QueryResult): PostHogTrafficPoint[] {
  return rows(result, ["day", "page_views", "visitors", "sessions"])
    .map((row) => ({
      at: boundedLabel(row[0], 10),
      pageViews: finiteCount(row[1]),
      visitors: finiteCount(row[2]),
      sessions: finiteCount(row[3]),
    }))
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.at))
}

function normalizePages(result: QueryResult): PostHogAggregateRow[] {
  return rows(result, ["path", "page_views", "visitors"]).map((row) => {
    const label = safePath(row[0])
    return { id: label, label, events: finiteCount(row[1]), users: finiteCount(row[2]) }
  })
}

function normalizeDimensions(result: QueryResult): AdminPostHogSnapshot["dimensions"] {
  const normalized = emptyDimensions()
  for (const row of rows(result, ["dimension", "value", "events", "users"])) {
    const dimension = boundedLabel(row[0], 20)
    if (!ALLOWED_DIMENSIONS.has(dimension)) continue
    const label = safeDimensionLabel(row[1])
    if (!label) continue
    const entry: PostHogDimensionRow = { label, events: finiteCount(row[2]), users: finiteCount(row[3]) }
    normalized[dimension as keyof typeof normalized].push(entry)
  }
  return normalized
}

function normalizeSchema(result: QueryResult): AdminPostHogSnapshot["schema"] {
  if (!Array.isArray(result.columns) || !Array.isArray(result.results)) return []
  const columns = result.columns.map(String)
  if (columns[0] !== "event") return []
  const propertyColumns = columns.slice(1)
  return (result.results.filter(Array.isArray) as unknown[][])
    .map((row) => {
      const event = boundedLabel(row[0], 80)
      if (!ALLOWED_EVENTS.has(event)) return null
      const properties = propertyColumns
        .filter((property, index) => ALLOWED_SCHEMA_PROPERTIES.has(property) && finiteCount(row[index + 1]) > 0)
        .sort()
      return { event, properties }
    })
    .filter((row): row is { event: string; properties: string[] } => Boolean(row))
    .sort((a, b) => a.event.localeCompare(b.event))
}

function providerState(error: ProviderError): { status: PostHogReadStatus; message: string; retryAfterSeconds: number | null } {
  if (error.status === 401 || error.status === 403) {
    return { status: "unauthorized", message: "PostHog rejected the configured read credentials.", retryAfterSeconds: null }
  }
  if (error.status === 429) {
    return { status: "rate-limited", message: "PostHog temporarily rate-limited analytics reads.", retryAfterSeconds: error.retryAfterSeconds ?? null }
  }
  if (error.timedOut) {
    return { status: "unavailable", message: "PostHog did not respond in time.", retryAfterSeconds: null }
  }
  return { status: "unavailable", message: "PostHog analytics are temporarily unavailable.", retryAfterSeconds: null }
}

export function createPostHogAdminReadAdapter(options: PostHogAdminReadOptions = {}): PostHogAdminReadAdapter {
  const env = options.env ?? process.env
  const fetcher = options.fetch ?? fetch
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const cache = new Map<PostHogAnalyticsRange, { expiresAt: number; value: AdminPostHogSnapshot }>()
  const pending = new Map<PostHogAnalyticsRange, Promise<AdminPostHogSnapshot>>()

  async function run(range: PostHogAnalyticsRange): Promise<AdminPostHogSnapshot> {
    const startedAt = now()
    const checkedAt = new Date(startedAt).toISOString()
    const config = readConfig(env)
    if (!config) {
      return baseSnapshot(range, checkedAt, "misconfigured", "PostHog historical reads are not configured.")
    }
    const endpoint = `${config.host}/api/projects/${encodeURIComponent(config.projectId)}/query/`
    const execute = async (query: string): Promise<QueryResult> => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetcher(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${config.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
          signal: controller.signal,
        })
        if (!response.ok) {
          const error = new Error("PostHog query failed") as ProviderError
          error.status = response.status
          const retryAfter = Number(response.headers.get("Retry-After"))
          error.retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null
          throw error
        }
        return await response.json() as QueryResult
      } catch (caught) {
        const error = caught instanceof Error ? caught as ProviderError : new Error("PostHog query failed") as ProviderError
        if (controller.signal.aborted) error.timedOut = true
        throw error
      } finally {
        clearTimeout(timeout)
      }
    }

    try {
      const statements = queries(range)
      const [summary, trend, pages, dimensions, schema] = await Promise.all([
        execute(statements.summary),
        execute(statements.trend),
        execute(statements.pages),
        execute(statements.dimensions),
        execute(statements.schema),
      ])
      const snapshot: AdminPostHogSnapshot = {
        ...baseSnapshot(range, checkedAt, "connected", null),
        latencyMs: Math.max(0, now() - startedAt),
        overview: normalizeSummary(summary),
        traffic: normalizeTrend(trend),
        topPages: normalizePages(pages),
        dimensions: normalizeDimensions(dimensions),
        schema: normalizeSchema(schema),
      }
      cache.set(range, { expiresAt: now() + cacheTtlMs, value: snapshot })
      return snapshot
    } catch (caught) {
      const state = providerState(caught instanceof Error ? caught as ProviderError : new Error("PostHog query failed"))
      return {
        ...baseSnapshot(range, checkedAt, state.status, state.message),
        latencyMs: Math.max(0, now() - startedAt),
        retryAfterSeconds: state.retryAfterSeconds,
      }
    }
  }

  return {
    async read(range) {
      const cached = cache.get(range)
      if (cached && cached.expiresAt > now()) return { ...cached.value, cached: true }
      const active = pending.get(range)
      if (active) return active
      const request = run(range).finally(() => pending.delete(range))
      pending.set(range, request)
      return request
    },
    clearCache() {
      cache.clear()
      pending.clear()
    },
  }
}

const defaultAdapter = createPostHogAdminReadAdapter()

export function getPostHogAdminAnalytics(range: PostHogAnalyticsRange): Promise<AdminPostHogSnapshot> {
  return defaultAdapter.read(range)
}
