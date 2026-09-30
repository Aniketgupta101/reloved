import http from 'node:http'
import { URL } from 'node:url'
import { readdir, stat } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'

import { LIVE_READ_ONLY_ERROR, assertAdminRequestAllowed } from '../src/lib/adminReadOnlyPolicy.mjs'
import {
  buildLiveAttentionPage,
  buildLiveAnalyticsSnapshot,
  buildLiveClaimFunnel,
  buildLiveCommunications,
  buildLiveDropFunnel,
  buildLiveInventoryDetail,
  buildLiveInventoryPage,
  buildLiveOperationDetail,
  buildLiveOperationsPage,
  buildLiveOverview,
  buildLiveSupportPage,
} from './admin-live-readonly-data.mjs'

function json(response, status, body, head = false) {
  const encoded = Buffer.from(JSON.stringify(body))
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': encoded.length,
    'X-Reloved-Data-Mode': 'production-read-only',
  })
  response.end(head ? undefined : encoded)
}

export function createLiveBundleLoader({ client, ttlMs = 30_000 }) {
  const cache = new Map()
  return async function loadBundle(days = 7) {
    const cacheKey = days === 30 ? 30 : days === 14 ? 14 : 7
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.at < ttlMs) return cached.value
    const comparisonDays = cacheKey * 2
    const [overview, analytics, analyticsComparison, submissions, items, requests, orders, contacts, support] = await Promise.all([
      client.get('/api/admin/overview'),
      client.get(`/api/admin/analytics?days=${cacheKey}`),
      client.get(`/api/admin/analytics?days=${comparisonDays}`),
      client.get('/api/admin/submissions'),
      client.get('/api/admin/items'),
      client.get('/api/admin/item-requests'),
      client.get('/api/admin/orders'),
      client.get('/api/admin/contact-messages'),
      client.get('/api/admin/support-chats'),
    ])
    const orderRows = Array.isArray(orders.orders) ? orders.orders : []
    const notificationResults = await Promise.allSettled(orderRows.map((order) =>
      client.get(`/api/admin/orders/${encodeURIComponent(String(order.id))}/notifications`),
    ))
    const notifications = new Map()
    notificationResults.forEach((result, index) => {
      const id = String(orderRows[index]?.id || '')
      if (result.status === 'fulfilled' && Array.isArray(result.value.events)) {
        notifications.set(id, {
          events: result.value.events,
          state: 'partial',
          reason: 'The deployed notification endpoint returns a bounded history without a continuation cursor.',
        })
      } else {
        notifications.set(id, {
          events: [],
          state: 'unavailable',
          reason: 'Production notification history read failed; no empty result was inferred.',
        })
      }
    })
    const value = {
      overview,
      analytics,
      analyticsComparison,
      submissions: Array.isArray(submissions.submissions) ? submissions.submissions : [],
      items: Array.isArray(items.items) ? items.items : [],
      requests: Array.isArray(requests.requests) ? requests.requests : [],
      orders: orderRows,
      contacts: Array.isArray(contacts.messages) ? contacts.messages : [],
      support: Array.isArray(support.threads) ? support.threads : [],
      notifications,
      sourceCoverage: {
        requests: { state: 'partial', reason: 'The deployed requests endpoint returns a bounded snapshot without continuation.' },
        orders: { state: 'partial', reason: 'The deployed orders endpoint returns a bounded snapshot without continuation.' },
      },
    }
    cache.set(cacheKey, { at: Date.now(), value })
    return value
  }
}

/**
 * Keep the operational Overview independent from the expensive inventory,
 * support, notification-history and comparison reads used by the other pages.
 * The deployed overview already contains the current matched/waiting records;
 * this loader combines only that read with the selected-period aggregate.
 */
export function createLiveOverviewBundleLoader({ client, ttlMs = 30_000 }) {
  const cache = new Map()
  const unique = (rows) => {
    const result = new Map()
    for (const row of rows.flatMap((value) => Array.isArray(value) ? value : [])) {
      const id = String(row?.id || '')
      if (id && !result.has(id)) result.set(id, row)
    }
    return [...result.values()]
  }
  return async function loadOverviewBundle(days = 7) {
    const cacheKey = days === 30 ? 30 : days === 14 ? 14 : 7
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.at < ttlMs) return cached.value
    const [overview, analytics] = await Promise.all([
      client.get('/api/admin/overview'),
      client.get(`/api/admin/analytics?days=${cacheKey}`),
    ])
    const requests = unique([
      overview.pendingClaims,
      overview.matched,
      overview.stuckMatched,
    ])
    const orders = unique([
      overview.todayDeliveries,
      overview.matched,
      overview.stuckMatched,
    ])
    const value = {
      overview,
      analytics,
      analyticsComparison: {},
      submissions: [],
      items: [],
      requests,
      orders,
      contacts: [],
      support: [],
      notifications: new Map(),
      sourceCoverage: {
        requests: {
          state: 'partial',
          reason: 'Overview uses the deployed operational queues; open Claims for the complete paged workflow.',
        },
        orders: {
          state: 'partial',
          reason: 'Overview uses the deployed delivery queues; open Deliveries for the complete paged workflow.',
        },
      },
    }
    cache.set(cacheKey, { at: Date.now(), value })
    return value
  }
}

export function createLiveIntegrationStatusLoader({ client, ttlMs = 60_000 }) {
  let cached = null
  return async function getIntegrationStatuses() {
    if (cached && Date.now() - cached.at < ttlMs) return cached.value
    const reads = {
      templates: '/api/admin/notification-templates',
      edesy: '/api/admin/calls/masking-status',
      borzo: '/api/admin/borzo/status',
      shiprocket: '/api/admin/shiprocket/status',
      shadowfax: '/api/admin/shadowfax/status',
    }
    const results = await Promise.allSettled(
      Object.entries(reads).map(async ([key, path]) => [key, await client.get(path)]),
    )
    const value = {}
    results.forEach((result, index) => {
      const key = Object.keys(reads)[index]
      value[key] = result.status === 'fulfilled'
        ? result.value[1]
        : { unavailable: true, message: 'Production status read unavailable.' }
    })
    cached = { at: Date.now(), value }
    return value
  }
}

export function createPageSpeedLoader({ publicSiteUrl, apiKey = null, fetchImpl = fetch, ttlMs = 15 * 60_000 }) {
  let cached = null
  return async function getPageSpeed() {
    if (cached && Date.now() - cached.at < ttlMs) return cached.value
    const results = await Promise.allSettled(['mobile', 'desktop'].map(async (device) => {
      const url = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
      url.searchParams.set('url', publicSiteUrl)
      url.searchParams.set('strategy', device)
      for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) url.searchParams.append('category', category)
      if (apiKey) url.searchParams.set('key', apiKey)
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(55_000) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw Object.assign(new Error('PageSpeed read unavailable'), { status: response.status })
      const categories = body.lighthouseResult?.categories || {}
      const audits = body.lighthouseResult?.audits || {}
      const score = (id, label) => ({ id, label, value: categories[id]?.score == null ? null : categories[id].score * 100, state: categories[id]?.score == null ? 'unavailable' : 'ready', format: 'score', previousValue: null, changePercent: null, source: 'PageSpeed Insights lab data', definition: `${label} Lighthouse score.`, message: categories[id]?.score == null ? 'Metric unavailable.' : null })
      const auditMetric = (id, label, format) => ({ id, label, value: audits[id]?.numericValue ?? null, state: audits[id]?.numericValue == null ? 'unavailable' : 'ready', format, previousValue: null, changePercent: null, source: 'PageSpeed Insights lab data', definition: `${label} lab measurement.`, message: audits[id]?.numericValue == null ? 'Metric unavailable.' : null })
      return { device, state: 'ready', message: null, metrics: [score('performance', 'Performance'), score('accessibility', 'Accessibility'), score('seo', 'SEO'), score('best-practices', 'Best Practices'), auditMetric('largest-contentful-paint', 'LCP', 'milliseconds'), auditMetric('cumulative-layout-shift', 'CLS', 'number')] }
    }))
    const devices = results.filter((result) => result.status === 'fulfilled').map((result) => result.value)
    const failed = results.find((result) => result.status === 'rejected')
    const value = devices.length ? { state: devices.length === 2 ? 'ready' : 'partial', message: failed ? 'One PageSpeed device report was unavailable.' : null, devices } : { state: 'unavailable', message: failed?.reason?.status === 429 ? 'PageSpeed lab data is unavailable for this review.' : 'PageSpeed Insights did not return a report.', devices: [] }
    cached = { at: Date.now(), value }
    return value
  }
}

export function createBundleStatsLoader(directory) {
  return async function getBundleStats() {
    try {
      const files = []
      async function walk(folder) {
        for (const entry of await readdir(folder, { withFileTypes: true })) {
          const path = resolve(folder, entry.name)
          if (entry.isDirectory()) await walk(path)
          else if (['.js', '.css'].includes(extname(entry.name))) files.push({ path, size: (await stat(path)).size })
        }
      }
      await walk(directory)
      const assets = files.map((file) => ({ name: relative(directory, file.path), bytes: file.size })).sort((a, b) => b.bytes - a.bytes)
      return { totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0), jsBytes: assets.filter((asset) => asset.name.endsWith('.js')).reduce((sum, asset) => sum + asset.bytes, 0), assets: assets.slice(0, 10) }
    } catch {
      return { totalBytes: null, jsBytes: null, assets: [] }
    }
  }
}

function listPage(items, bundle, source = 'items') {
  return {
    asOf: new Date().toISOString(), coverage: 'partial',
    sources: [{ source: `Production Admin API · ${source}`, state: 'partial', scanned: items.length, limit: Math.max(items.length, 1), reason: 'Linked records come from a bounded production snapshot.' }],
    scope: 'Exact linked production records.', items, nextCursor: null, order: 'Recorded order',
  }
}

export function createLiveReadDispatcher({ loadBundle, loadOverviewBundle = loadBundle, privacyMode = false, analyticsSnapshot = buildLiveAnalyticsSnapshot, capabilities = {}, getIntegrationStatuses = async () => ({}), getPageSpeed = async () => ({ state: 'unavailable', message: 'PageSpeed Insights did not return a report.', devices: [] }), getBundleStats = async () => ({ totalBytes: null, jsBytes: null, assets: [] }) }) {
  return async function dispatch(requestUrl) {
    const url = new URL(requestUrl, 'http://127.0.0.1:8788')
    const path = url.pathname
    if (path === '/health' || path === '/api/health') return { ok: true, mode: 'production-read-only' }
    if (path === '/api/auth/me') return { admin: { email: 'live-review@local.invalid', role: 'admin' }, mode: 'production-read-only' }
    if (path === '/api/admin/notification-templates') return (await getIntegrationStatuses()).templates || { templates: [] }
    if (path === '/api/admin/calls/masking-status') return (await getIntegrationStatuses()).edesy || { configured: false }
    for (const provider of ['borzo', 'shiprocket', 'shadowfax'])
      if (path === `/api/admin/${provider}/status`) {
        const status = (await getIntegrationStatuses())[provider] || {}
        return {
          configured: status.configured === true,
          walletReady: provider === 'shiprocket' ? status.walletReady === true : undefined,
          unavailable: status.unavailable === true,
          error: status.error ? 'Provider status check failed.' : undefined,
        }
      }
    if (!path.startsWith('/api/admin/control-center/')) {
      const error = new Error('Read route unavailable')
      error.status = 404
      throw error
    }
    const range = url.searchParams.get('range') === '30d' ? '30d' : url.searchParams.get('range') === '14d' ? '14d' : url.searchParams.get('range') === '7d' ? '7d' : '24h'
    if (path === '/api/admin/control-center/analytics/posthog') {
      const requiredEnvironment = ['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST']
      const configured = capabilities.posthog === true
      return {
        status: configured ? 'unavailable' : 'misconfigured',
        source: 'PostHog',
        range,
        checkedAt: new Date().toISOString(),
        cached: false,
        latencyMs: null,
        message: configured
          ? 'PostHog reads require the local backend read service.'
          : 'PostHog historical reads are not configured.',
        retryAfterSeconds: null,
        requiredEnvironment,
        overview: { pageViews: null, uniqueVisitors: null, sessions: null, events: [] },
        traffic: [],
        topPages: [],
        acquisition: { referrers: [], utmSources: [], utmMediums: [], utmCampaigns: [], landingPages: [] },
        journeys: { drop: [], claim: [] },
        wallFilters: [],
        deviceConversion: [],
        dimensions: { device: [], browser: [], os: [], country: [], city: [] },
        schema: [],
      }
    }
    if (path === '/api/admin/control-center/overview') {
      const bundle = await loadOverviewBundle(range === '30d' ? 30 : range === '14d' ? 14 : 7)
      return buildLiveOverview(bundle, { privacyMode, now: new Date(), range })
    }
    const bundle = await loadBundle(range === '30d' ? 30 : range === '14d' ? 14 : 7)
    const options = { privacyMode, now: new Date() }
    if (path === '/api/admin/control-center/attention') return buildLiveAttentionPage(bundle, url.searchParams, options)
    if (path === '/api/admin/control-center/drops/funnel') return buildLiveDropFunnel(bundle)
    if (path === '/api/admin/control-center/claims/funnel') return buildLiveClaimFunnel(bundle)
    if (path === '/api/admin/control-center/drops') return buildLiveInventoryPage(bundle, 'drops', url.searchParams, options)
    if (path === '/api/admin/control-center/wall') return buildLiveInventoryPage(bundle, 'wall', url.searchParams, options)
    if (path === '/api/admin/control-center/claims') return buildLiveOperationsPage(bundle, 'claims', url.searchParams, options)
    if (path === '/api/admin/control-center/deliveries') return buildLiveOperationsPage(bundle, 'deliveries', url.searchParams, options)
    if (path === '/api/admin/control-center/support') return buildLiveSupportPage(bundle, url.searchParams, options)
    if (path === '/api/admin/control-center/analytics/snapshot') {
      const [pageSpeed, bundles, integrationStatuses] = await Promise.all([getPageSpeed(), getBundleStats(), getIntegrationStatuses()])
      return analyticsSnapshot(bundle, range === '30d' ? '30d' : range === '14d' ? '14d' : '7d', { capabilities, pageSpeed, bundles, integrationStatuses })
    }
    let match = path.match(/^\/api\/admin\/control-center\/(drops|wall)\/([^/]+)$/)
    if (match) {
      const detail = buildLiveInventoryDetail(bundle, match[1], decodeURIComponent(match[2]), options)
      if (detail) return detail
      const error = new Error('Record not found')
      error.status = 404
      throw error
    }
    match = path.match(/^\/api\/admin\/control-center\/drops\/([^/]+)\/items$/)
    if (match) {
      const detail = buildLiveInventoryDetail(bundle, 'drops', decodeURIComponent(match[1]), options)
      return listPage(detail?.items || [], bundle, 'linked items')
    }
    match = path.match(/^\/api\/admin\/control-center\/wall\/([^/]+)\/claims$/)
    if (match) {
      const detail = buildLiveInventoryDetail(bundle, 'wall', decodeURIComponent(match[1]), options)
      return listPage(detail?.claims || [], bundle, 'linked claims')
    }
    match = path.match(/^\/api\/admin\/control-center\/(claims|deliveries)\/([^/]+)$/)
    if (match) {
      const detail = buildLiveOperationDetail(bundle, decodeURIComponent(match[2]), options)
      if (detail) return detail
      const error = new Error('Claim not found')
      error.status = 404
      throw error
    }
    match = path.match(/^\/api\/admin\/control-center\/deliveries\/([^/]+)\/communications$/)
    if (match) return buildLiveCommunications(bundle, decodeURIComponent(match[1]), options)
    const error = new Error('Read route unavailable')
    error.status = 404
    throw error
  }
}

async function proxyUpload(request, response, apiBase) {
  if (!/^\/uploads\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(request.url || '')) {
    json(response, 400, { error: 'Invalid asset path' }, request.method === 'HEAD')
    return
  }
  const upstream = await fetch(new URL(request.url, apiBase), { method: request.method, redirect: 'error' })
  if (!upstream.ok) {
    json(response, upstream.status, { error: 'Asset unavailable' }, request.method === 'HEAD')
    return
  }
  const body = Buffer.from(await upstream.arrayBuffer())
  response.writeHead(200, {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'private, max-age=300',
    'X-Reloved-Data-Mode': 'production-read-only',
  })
  response.end(request.method === 'HEAD' ? undefined : body)
}

async function proxyProductionAsset(request, response) {
  const match = String(request.url || '').split('?')[0].match(
    /^\/api\/admin\/control-center\/assets\/([A-Za-z0-9._~!$&'()*+,;=:@%/-]+)$/,
  )
  if (!match) {
    json(response, 400, { error: 'Invalid asset path' }, request.method === 'HEAD')
    return
  }
  const assetPath = match[1].split('/').map((part) => encodeURIComponent(decodeURIComponent(part))).join('/')
  const upstream = await fetch(`https://storage.googleapis.com/reloved-digital-uploads/${assetPath}`, {
    method: request.method,
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  if (!upstream.ok) {
    json(response, upstream.status, { error: 'Asset unavailable' }, request.method === 'HEAD')
    return
  }
  const body = Buffer.from(await upstream.arrayBuffer())
  response.writeHead(200, {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'private, max-age=300',
    'X-Reloved-Data-Mode': 'production-read-only',
  })
  response.end(request.method === 'HEAD' ? undefined : body)
}

export function createLiveReadOnlyServer({ apiBase, dispatch, log = console.warn }) {
  return http.createServer(async (request, response) => {
    try {
      assertAdminRequestAllowed(request.method, 'live-readonly')
    } catch {
      log({ event: 'live_review_mutation_blocked', method: request.method, path: String(request.url || '/').split('?')[0] })
      json(response, 405, { error: LIVE_READ_ONLY_ERROR })
      return
    }
    try {
      if (String(request.url || '').startsWith('/api/admin/control-center/assets/')) {
        await proxyProductionAsset(request, response)
        return
      }
      if (String(request.url || '').startsWith('/uploads/')) {
        await proxyUpload(request, response, apiBase)
        return
      }
      const body = await dispatch(request.url || '/')
      json(response, 200, body, request.method === 'HEAD')
    } catch (error) {
      const status = Number(error?.status) || 502
      log({ event: 'live_review_read_failed', status, path: String(request.url || '/').split('?')[0] })
      json(response, status, { error: status === 404 ? 'Read route unavailable' : 'Live production read unavailable.' }, request.method === 'HEAD')
    }
  })
}
