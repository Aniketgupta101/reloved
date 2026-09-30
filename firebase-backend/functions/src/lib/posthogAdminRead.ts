import type {
  AdminPostHogSnapshot,
  PostHogAcquisitionRow,
  PostHogAggregateRow,
  PostHogAnalyticsRange,
  PostHogDeviceConversionRow,
  PostHogDimensionRow,
  PostHogJourneyStep,
  PostHogReadStatus,
  PostHogTrafficPoint,
  PostHogWallFilterRow,
} from "../../../../shared/adminControlCenter"

const REQUIRED_ENVIRONMENT = [
  "POSTHOG_PERSONAL_API_KEY",
  "POSTHOG_PROJECT_ID",
  "POSTHOG_HOST",
] as const

const ALLOWED_EVENTS = new Set([
  "$pageview",
  "cta_drop_item_clicked",
  "cta_claim_item_clicked",
  "cta_explore_wall_clicked",
  "nav_link_clicked",
  "nav_account_clicked",
  "footer_link_clicked",
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
  "track_lookup_submitted",
  "track_status_viewed",
  "track_status_failed",
  "login_started",
  "login_completed",
  "logout",
  "partner_apply_cta_clicked",
  "partner_application_submitted",
  "partner_application_failed",
  "contact_submitted",
  "contact_failed",
  "onboarding_completed",
  "help_chat_opened",
  "help_chat_closed",
  "help_question_asked",
  "help_contact_cta_clicked",
  "faq_question_opened",
  "faq_contact_cta_clicked",
  "wall_filter_changed",
  "partner_items_requested",
  "partner_items_request_failed",
])

const ALLOWED_DIMENSIONS = new Set(["device", "browser", "os", "country", "city"])
const DIMENSION_KEYS = ["device", "browser", "os", "country", "city"] as const
const ACQUISITION_KEYS = ["referrers", "utmSources", "utmMediums", "utmCampaigns", "landingPages"] as const
const ALLOWED_POSTHOG_HOSTS = new Set(["us.posthog.com", "eu.posthog.com", "app.posthog.com"])
const WALL_FILTER_CATEGORIES = new Set(["All", "Outerwear", "Tops", "Bottoms", "Kicks", "Bags", "Accessories"])
const SAFE_STATIC_PATHS = new Set([
  "/",
  "/about",
  "/account",
  "/account/login",
  "/account/onboarding",
  "/contact",
  "/drop",
  "/faq",
  "/give",
  "/love",
  "/map",
  "/partner",
  "/partner/dashboard",
  "/partner/login",
  "/privacy",
  "/qr",
  "/standards",
  "/terms",
  "/track",
  "/wall",
])
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
const BREAKDOWN_LIMIT = 25
const BREAKDOWN_QUERY_LIMIT = BREAKDOWN_LIMIT + 1

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
  let pathname: string
  try {
    const parsed = new URL(raw, "https://reloved.digital")
    pathname = boundedLabel(parsed.pathname || "/", 160)
  } catch {
    pathname = boundedLabel(raw.split(/[?#]/, 1)[0] || "/", 160)
  }
  const normalized = `/${pathname.split("/").filter(Boolean).join("/")}` || "/"
  if (SAFE_STATIC_PATHS.has(normalized)) return normalized
  if (/^\/(drop|wall)\/[^/]+$/.test(normalized)) return `/${normalized.split("/")[1]}/:item`
  if (/^\/track\/[^/]+$/.test(normalized)) return "/track/:reference"
  if (/^\/give\/success\/[^/]+$/.test(normalized)) return "/give/success/:reference"
  if (/^\/account\/(claims|gifts)\/[^/]+$/.test(normalized)) {
    const section = normalized.split("/")[2]
    return `/account/${section}/:id`
  }
  return "/other"
}

function safeDimensionLabel(value: unknown): string | null {
  const label = boundedLabel(value, 80) || "Unknown"
  const looksLikeEmail = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(label)
  const looksLikePhone = label.replace(/\D/g, "").length >= 8
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(label)
  return looksLikeEmail || looksLikePhone || looksLikeUrl ? null : label
}

function safeCampaignLabel(value: unknown): string | null {
  const label = boundedLabel(value, 80)
  if (!label || !/^[a-z0-9][a-z0-9 ._-]*$/i.test(label)) return null
  return safeDimensionLabel(label)
}

function safeReferrerLabel(value: unknown): string | null {
  const raw = boundedLabel(value, 500)
  if (!raw) return null
  if (raw === "Direct / Unknown") return raw
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "")
    return safeDimensionLabel(hostname)
  } catch {
    return null
  }
}

function optionalCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function emptyDimensions(): AdminPostHogSnapshot["dimensions"] {
  return { device: [], browser: [], os: [], country: [], city: [] }
}

function emptyAcquisition(): AdminPostHogSnapshot["acquisition"] {
  return { referrers: [], utmSources: [], utmMediums: [], utmCampaigns: [], landingPages: [] }
}

function breakdownCoverage(truncated: boolean | null): AdminPostHogSnapshot["breakdownCoverage"] {
  const entry = () => ({ limit: BREAKDOWN_LIMIT, truncated })
  return {
    dimensions: {
      device: entry(),
      browser: entry(),
      os: entry(),
      country: entry(),
      city: entry(),
    },
    acquisition: {
      referrers: entry(),
      utmSources: entry(),
      utmMediums: entry(),
      utmCampaigns: entry(),
      landingPages: entry(),
    },
  }
}

const DROP_JOURNEY_STEPS = [
  { id: "donation_started", label: "Started" },
  { id: "donation_step_1", label: "Photo" },
  { id: "donation_step_2", label: "Details" },
  { id: "donation_step_3", label: "You" },
  { id: "donation_step_6", label: "Review" },
  { id: "donation_step_7", label: "Post" },
  { id: "donation_step_8", label: "Login" },
  { id: "donation_submitted", label: "Submitted" },
  { id: "donation_completed", label: "Completed" },
] as const

const CLAIM_JOURNEY_STEPS = [
  { id: "item_viewed", label: "Item viewed" },
  { id: "claim_started", label: "Claim started" },
  { id: "claim_submitted", label: "Claim submitted" },
] as const

function emptyJourneys(): AdminPostHogSnapshot["journeys"] {
  const toStep = (step: { id: string; label: string }): PostHogJourneyStep => ({ ...step, users: null })
  return { drop: DROP_JOURNEY_STEPS.map(toStep), claim: CLAIM_JOURNEY_STEPS.map(toStep) }
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
    acquisition: emptyAcquisition(),
    journeys: emptyJourneys(),
    wallFilters: [],
    deviceConversion: [],
    dimensions: emptyDimensions(),
    breakdownCoverage: breakdownCoverage(null),
    schema: [],
  }
}

function readConfig(env: ReadEnvironment): { key: string; projectId: string; host: string } | null {
  const key = String(env.POSTHOG_PERSONAL_API_KEY || "").trim()
  const projectId = String(env.POSTHOG_PROJECT_ID || "").trim()
  const rawHost = String(env.POSTHOG_HOST || "").trim()
  if (!key || key.toLowerCase().startsWith("phc_") || !projectId || !rawHost || !/^\d+$/.test(projectId)) return null
  try {
    const parsed = new URL(rawHost)
    const hostname = parsed.hostname.toLowerCase()
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      !ALLOWED_POSTHOG_HOSTS.has(hostname)
    ) {
      return null
    }
    return { key, projectId, host: parsed.origin }
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

type QueryName = "summary" | "trend" | "pages" | "dimensions" | "schema" | "acquisition" | "journeys" | "wall-filters" | "device-conversion"

function queries(range: PostHogAnalyticsRange): Record<QueryName, string> {
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
) GROUP BY dimension, value ORDER BY dimension, events DESC LIMIT ${BREAKDOWN_QUERY_LIMIT} BY dimension`,
    schema: `/* reloved:schema */
SELECT event,
  ${schemaCounts}
FROM events WHERE ${where}
GROUP BY event ORDER BY event ASC LIMIT 100`,
    acquisition: `/* reloved:acquisition */
SELECT dimension, value, sum(events) AS events, sum(users) AS users, sum(sessions) AS sessions FROM (
  SELECT 'referrer' AS dimension, coalesce(nullIf(toString(properties.$session_entry_referring_domain), ''), 'Direct / Unknown') AS value, count() AS events, uniq(distinct_id) AS users, uniqIf(toString(properties.$session_id), notEmpty(toString(properties.$session_id))) AS sessions FROM events WHERE timestamp >= now() - ${window} AND event = '$pageview' GROUP BY value
  UNION ALL SELECT 'utm_source', coalesce(nullIf(toString(properties.$session_entry_utm_source), ''), nullIf(toString(properties.utm_source), ''), 'Unattributed'), count(), uniq(distinct_id), uniqIf(toString(properties.$session_id), notEmpty(toString(properties.$session_id))) FROM events WHERE timestamp >= now() - ${window} AND event = '$pageview' GROUP BY coalesce(nullIf(toString(properties.$session_entry_utm_source), ''), nullIf(toString(properties.utm_source), ''), 'Unattributed')
  UNION ALL SELECT 'utm_medium', coalesce(nullIf(toString(properties.$session_entry_utm_medium), ''), nullIf(toString(properties.utm_medium), ''), 'Unattributed'), count(), uniq(distinct_id), uniqIf(toString(properties.$session_id), notEmpty(toString(properties.$session_id))) FROM events WHERE timestamp >= now() - ${window} AND event = '$pageview' GROUP BY coalesce(nullIf(toString(properties.$session_entry_utm_medium), ''), nullIf(toString(properties.utm_medium), ''), 'Unattributed')
  UNION ALL SELECT 'utm_campaign', coalesce(nullIf(toString(properties.$session_entry_utm_campaign), ''), nullIf(toString(properties.utm_campaign), ''), 'Unattributed'), count(), uniq(distinct_id), uniqIf(toString(properties.$session_id), notEmpty(toString(properties.$session_id))) FROM events WHERE timestamp >= now() - ${window} AND event = '$pageview' GROUP BY coalesce(nullIf(toString(properties.$session_entry_utm_campaign), ''), nullIf(toString(properties.utm_campaign), ''), 'Unattributed')
  UNION ALL SELECT 'landing_page', coalesce(nullIf(toString(properties.$session_entry_pathname), ''), nullIf(toString(properties.$pathname), ''), '/') AS value, count(), uniq(distinct_id), uniqIf(toString(properties.$session_id), notEmpty(toString(properties.$session_id))) FROM events WHERE timestamp >= now() - ${window} AND event = '$pageview' GROUP BY coalesce(nullIf(toString(properties.$session_entry_pathname), ''), nullIf(toString(properties.$pathname), ''), '/')
) GROUP BY dimension, value ORDER BY dimension, events DESC LIMIT ${BREAKDOWN_QUERY_LIMIT} BY dimension`,
    journeys: `/* reloved:journeys */
SELECT
  uniqIf(distinct_id, event = 'donation_started') AS donation_started,
  uniqIf(distinct_id, event = 'donation_step_viewed' AND toInt64OrNull(toString(properties.step)) = 1) AS donation_step_1,
  uniqIf(distinct_id, event = 'donation_step_viewed' AND toInt64OrNull(toString(properties.step)) = 2) AS donation_step_2,
  uniqIf(distinct_id, event = 'donation_step_viewed' AND toInt64OrNull(toString(properties.step)) = 3) AS donation_step_3,
  uniqIf(distinct_id, event = 'donation_step_viewed' AND toInt64OrNull(toString(properties.step)) = 6) AS donation_step_6,
  uniqIf(distinct_id, event = 'donation_step_viewed' AND toInt64OrNull(toString(properties.step)) = 7) AS donation_step_7,
  uniqIf(distinct_id, event = 'donation_step_viewed' AND toInt64OrNull(toString(properties.step)) = 8) AS donation_step_8,
  uniqIf(distinct_id, event = 'donation_submitted') AS donation_submitted,
  uniqIf(distinct_id, event = 'donation_completed') AS donation_completed,
  uniqIf(distinct_id, event = 'item_viewed') AS item_viewed,
  uniqIf(distinct_id, event = 'claim_started') AS claim_started,
  uniqIf(distinct_id, event = 'claim_submitted') AS claim_submitted
FROM events WHERE timestamp >= now() - ${window}`,
    "wall-filters": `/* reloved:wall-filters */
SELECT 'category' AS type, toString(properties.value) AS value, count() AS events, uniq(distinct_id) AS users
FROM events
WHERE timestamp >= now() - ${window}
  AND event = 'wall_filter_changed'
  AND toString(properties.type) = 'category'
  AND toString(properties.value) IN ('All', 'Outerwear', 'Tops', 'Bottoms', 'Kicks', 'Bags', 'Accessories')
GROUP BY value ORDER BY events DESC LIMIT 7`,
    "device-conversion": `/* reloved:device-conversion */
SELECT coalesce(nullIf(toString(properties.$device_type), ''), 'Unknown') AS device,
  uniqIf(distinct_id, event = '$pageview') AS visitors,
  uniqIf(distinct_id, event = 'donation_started') AS donation_started,
  uniqIf(distinct_id, event = 'donation_submitted') AS donation_submitted,
  uniqIf(distinct_id, event = 'claim_started') AS claim_started,
  uniqIf(distinct_id, event = 'claim_submitted') AS claim_submitted
FROM events
WHERE timestamp >= now() - ${window}
  AND event IN ('$pageview', 'donation_started', 'donation_submitted', 'claim_started', 'claim_submitted')
GROUP BY device ORDER BY visitors DESC LIMIT 10`,
  }
}

function rows(result: QueryResult, expectedColumns: readonly string[]): unknown[][] {
  if (!Array.isArray(result.columns) || !Array.isArray(result.results)) return []
  const columns = result.columns.map(String)
  if (!expectedColumns.every((column, index) => columns[index] === column)) return []
  return result.results.filter(Array.isArray) as unknown[][]
}

function hasColumns(result: QueryResult, expectedColumns: readonly string[]): boolean {
  if (!Array.isArray(result.columns) || !Array.isArray(result.results)) return false
  const columns = result.columns.map(String)
  return expectedColumns.every((column, index) => columns[index] === column)
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

function normalizeAcquisition(result: QueryResult): {
  values: AdminPostHogSnapshot["acquisition"]
  coverage: AdminPostHogSnapshot["breakdownCoverage"]["acquisition"]
} {
  const normalized = emptyAcquisition()
  const expectedColumns = ["dimension", "value", "events", "users", "sessions"] as const
  const keys = {
    referrer: "referrers",
    utm_source: "utmSources",
    utm_medium: "utmMediums",
    utm_campaign: "utmCampaigns",
    landing_page: "landingPages",
  } as const
  const seen = new Map<(typeof ACQUISITION_KEYS)[number], number>()
  for (const row of rows(result, expectedColumns)) {
    const dimension = boundedLabel(row[0], 20) as keyof typeof keys
    const key = keys[dimension]
    if (!key) continue
    const position = (seen.get(key) ?? 0) + 1
    seen.set(key, position)
    if (position > BREAKDOWN_LIMIT) continue
    const label = dimension === "referrer"
      ? safeReferrerLabel(row[1])
      : dimension === "landing_page"
        ? boundedLabel(row[1], 500) ? safePath(row[1]) : null
        : safeCampaignLabel(row[1])
    if (!label) continue
    const entry: PostHogAcquisitionRow = {
      id: label,
      label,
      events: finiteCount(row[2]),
      users: finiteCount(row[3]),
      sessions: finiteCount(row[4]),
    }
    normalized[key].push(entry)
  }
  const validShape = hasColumns(result, expectedColumns)
  const coverage = breakdownCoverage(validShape ? false : null).acquisition
  if (validShape) {
    for (const key of ACQUISITION_KEYS) coverage[key].truncated = (seen.get(key) ?? 0) > BREAKDOWN_LIMIT
  }
  return { values: normalized, coverage }
}

function normalizeJourneys(result: QueryResult): AdminPostHogSnapshot["journeys"] {
  const definitions = [...DROP_JOURNEY_STEPS, ...CLAIM_JOURNEY_STEPS]
  const expectedColumns = definitions.map((step) => step.id)
  const resultRows = rows(result, expectedColumns)
  const values = resultRows[0]
  const byId = new Map<string, number | null>()
  definitions.forEach((step, index) => byId.set(step.id, values ? optionalCount(values[index]) : null))
  const toStep = (step: { id: string; label: string }): PostHogJourneyStep => ({
    ...step,
    users: byId.get(step.id) ?? null,
  })
  return { drop: DROP_JOURNEY_STEPS.map(toStep), claim: CLAIM_JOURNEY_STEPS.map(toStep) }
}

function normalizeWallFilters(result: QueryResult): PostHogWallFilterRow[] {
  const normalized: PostHogWallFilterRow[] = []
  for (const row of rows(result, ["type", "value", "events", "users"])) {
    if (row[0] !== "category" || typeof row[1] !== "string" || !WALL_FILTER_CATEGORIES.has(row[1])) continue
    normalized.push({ type: "category", value: row[1], events: finiteCount(row[2]), users: finiteCount(row[3]) })
  }
  return normalized
}

function normalizeDeviceConversion(result: QueryResult): PostHogDeviceConversionRow[] {
  const normalized: PostHogDeviceConversionRow[] = []
  for (const row of rows(result, ["device", "visitors", "donation_started", "donation_submitted", "claim_started", "claim_submitted"])) {
    const device = safeDimensionLabel(row[0])
    if (!device) continue
    normalized.push({
      device,
      visitors: finiteCount(row[1]),
      donationStarted: finiteCount(row[2]),
      donationSubmitted: finiteCount(row[3]),
      claimStarted: finiteCount(row[4]),
      claimSubmitted: finiteCount(row[5]),
    })
  }
  return normalized
}

function normalizeDimensions(result: QueryResult): {
  values: AdminPostHogSnapshot["dimensions"]
  coverage: AdminPostHogSnapshot["breakdownCoverage"]["dimensions"]
} {
  const normalized = emptyDimensions()
  const expectedColumns = ["dimension", "value", "events", "users"] as const
  const seen = new Map<(typeof DIMENSION_KEYS)[number], number>()
  for (const row of rows(result, expectedColumns)) {
    const dimension = boundedLabel(row[0], 20)
    if (!ALLOWED_DIMENSIONS.has(dimension)) continue
    const key = dimension as (typeof DIMENSION_KEYS)[number]
    const position = (seen.get(key) ?? 0) + 1
    seen.set(key, position)
    if (position > BREAKDOWN_LIMIT) continue
    const label = safeDimensionLabel(row[1])
    if (!label) continue
    const entry: PostHogDimensionRow = { label, events: finiteCount(row[2]), users: finiteCount(row[3]) }
    normalized[key].push(entry)
  }
  const validShape = hasColumns(result, expectedColumns)
  const coverage = breakdownCoverage(validShape ? false : null).dimensions
  if (validShape) {
    for (const key of DIMENSION_KEYS) coverage[key].truncated = (seen.get(key) ?? 0) > BREAKDOWN_LIMIT
  }
  return { values: normalized, coverage }
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
      const [summary, trend, pages, dimensions, schema, acquisition, journeys, wallFilters, deviceConversion] = await Promise.all([
        execute(statements.summary),
        execute(statements.trend),
        execute(statements.pages),
        execute(statements.dimensions),
        execute(statements.schema),
        execute(statements.acquisition),
        execute(statements.journeys),
        execute(statements["wall-filters"]),
        execute(statements["device-conversion"]),
      ])
      const normalizedAcquisition = normalizeAcquisition(acquisition)
      const normalizedDimensions = normalizeDimensions(dimensions)
      const snapshot: AdminPostHogSnapshot = {
        ...baseSnapshot(range, checkedAt, "connected", null),
        latencyMs: Math.max(0, now() - startedAt),
        overview: normalizeSummary(summary),
        traffic: normalizeTrend(trend),
        topPages: normalizePages(pages),
        acquisition: normalizedAcquisition.values,
        journeys: normalizeJourneys(journeys),
        wallFilters: normalizeWallFilters(wallFilters),
        deviceConversion: normalizeDeviceConversion(deviceConversion),
        dimensions: normalizedDimensions.values,
        breakdownCoverage: {
          dimensions: normalizedDimensions.coverage,
          acquisition: normalizedAcquisition.coverage,
        },
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
