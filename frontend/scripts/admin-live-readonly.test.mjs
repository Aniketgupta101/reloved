import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ADMIN_DATA_MODE_LABELS,
  LIVE_READ_ONLY_ERROR,
  assertAdminRequestAllowed,
  normalizeAdminDataMode,
} from '../src/lib/adminReadOnlyPolicy.mjs'
import {
  assertLiveReadOnlyEnvironment,
  createLiveReadOnlyEnvironment,
  createLiveReadOnlyMethodGuard,
  createProductionReadClient,
  createAdminReadToken,
  LIVE_PRODUCTION_API_ORIGIN,
  selectLiveReviewConfig,
} from './admin-live-readonly-harness.mjs'
import {
  createLiveIntegrationStatusLoader,
  createLiveReadDispatcher,
  createLiveReadOnlyServer,
} from './admin-live-readonly-api.mjs'

test('live loopback serves only GET provider status from the existing cached reads', async () => {
  const statuses = { borzo: { configured: true, client: { privateAccount: 'do-not-forward' } }, shiprocket: { configured: false }, shadowfax: { configured: true } }
  const dispatch = createLiveReadDispatcher({ loadBundle: async () => { throw Error('Unexpected bundle read') }, getIntegrationStatuses: async () => statuses })
  for (const provider of ['borzo', 'shiprocket', 'shadowfax'])
    assert.equal((await dispatch(`/api/admin/${provider}/status`)).configured, statuses[provider].configured)
  assert.equal(JSON.stringify(await dispatch('/api/admin/borzo/status')).includes('do-not-forward'), false)
  await assert.rejects(dispatch('/api/admin/borzo/book'), /Read route unavailable/)
})

test('data modes have unambiguous operator labels', () => {
  assert.equal(ADMIN_DATA_MODE_LABELS.fixture, 'LOCAL FIXTURE DATA')
  assert.equal(ADMIN_DATA_MODE_LABELS['live-readonly'], 'PRODUCTION · READ ONLY')
  assert.equal(normalizeAdminDataMode('unexpected'), 'fixture')
})

test('frontend policy permits reads and blocks every mutation method', () => {
  for (const method of ['GET', 'HEAD']) {
    assert.doesNotThrow(() => assertAdminRequestAllowed(method, 'live-readonly'))
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.throws(
      () => assertAdminRequestAllowed(method, 'live-readonly'),
      (error) => error instanceof Error && error.message === LIVE_READ_ONLY_ERROR,
    )
  }
  assert.doesNotThrow(() => assertAdminRequestAllowed('POST', 'fixture'))
})

test('local live proxy rejects mutations before invoking a route handler', () => {
  const attempts = []
  let nextCalls = 0
  const guard = createLiveReadOnlyMethodGuard({
    log: (entry) => attempts.push(entry),
  })

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    let status
    let body
    guard(
      { method, path: '/api/admin/control-center/overview' },
      {
        status(code) {
          status = code
          return this
        },
        json(value) {
          body = value
        },
      },
      () => {
        nextCalls += 1
      },
    )
    assert.equal(status, 405)
    assert.deepEqual(body, { error: LIVE_READ_ONLY_ERROR })
  }

  guard({ method: 'GET', path: '/api/admin/control-center/overview' }, {}, () => {
    nextCalls += 1
  })
  guard({ method: 'HEAD', path: '/health' }, {}, () => {
    nextCalls += 1
  })

  assert.equal(nextCalls, 2)
  assert.deepEqual(
    attempts.map(({ method, path }) => ({ method, path })),
    ['POST', 'PUT', 'PATCH', 'DELETE'].map((method) => ({
      method,
      path: '/api/admin/control-center/overview',
    })),
  )
  assert.ok(attempts.every((entry) => !('headers' in entry) && !('body' in entry)))
})

test('live environment is loopback-only and strips mutation-provider credentials', () => {
  const env = createLiveReadOnlyEnvironment({
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    BREVO_API_KEY: 'must-not-propagate',
    MSG91_AUTH_KEY: 'must-not-propagate',
    EDESY_API_KEY: 'must-not-propagate',
    BORZO_AUTH_TOKEN: 'must-not-propagate',
    POSTHOG_PERSONAL_API_KEY: 'must-not-propagate-to-browser-build',
    VITE_POSTHOG_PROJECT_TOKEN: 'must-not-propagate',
  })

  assertLiveReadOnlyEnvironment(env)
  assert.equal(env.VITE_ADMIN_DATA_MODE, 'live-readonly')
  assert.equal(env.VITE_ADMIN_PRIVACY_MODE, '0')
  assert.equal(env.VITE_API_URL, '')
  assert.equal(env.VITE_DEV_API_PROXY, 'http://127.0.0.1:8788')
  assert.equal(env.BREVO_API_KEY, undefined)
  assert.equal(env.MSG91_AUTH_KEY, undefined)
  assert.equal(env.EDESY_API_KEY, undefined)
  assert.equal(env.BORZO_AUTH_TOKEN, undefined)
  assert.equal(env.POSTHOG_PERSONAL_API_KEY, undefined)
  assert.equal(env.VITE_POSTHOG_PROJECT_TOKEN, '')
})

test('production client is confined to authenticated admin reads on one origin', async () => {
  const calls = []
  const client = createProductionReadClient({
    apiBase: LIVE_PRODUCTION_API_ORIGIN,
    token: 'server-only-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.deepEqual(await client.get('/api/admin/overview'), { ok: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `${LIVE_PRODUCTION_API_ORIGIN}/api/admin/overview`)
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[0].options.redirect, 'error')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer server-only-token')

  for (const path of [
    '/api/admin/notification-templates',
    '/api/admin/calls/masking-status',
    '/api/admin/borzo/status',
    '/api/admin/shiprocket/status',
    '/api/admin/shadowfax/status',
  ]) {
    assert.deepEqual(await client.get(path), { ok: true })
  }

  await assert.rejects(
    client.request('/api/admin/overview', { method: 'POST' }),
    new RegExp(LIVE_READ_ONLY_ERROR.replace('.', '\\.')),
  )
  await assert.rejects(client.get('https://other.example/api/admin/overview'), /relative path/)
  await assert.rejects(client.get('/api/donor/profile'), /allowlisted admin read route/)
  await assert.rejects(client.get('/api/admin/short-links'), /allowlisted admin read route/)
  await assert.rejects(client.get('/api/admin/overview?unexpected=1'), /does not accept a query/)
  assert.equal(calls.length, 6)
})

test('integration status loader reads each existing production status route once and caches the result', async () => {
  const calls = []
  const payloads = {
    '/api/admin/notification-templates': { templates: [{ channel: 'email' }] },
    '/api/admin/calls/masking-status': { configured: true },
    '/api/admin/borzo/status': { configured: true, mode: 'api' },
    '/api/admin/shiprocket/status': { configured: true, walletReady: true },
    '/api/admin/shadowfax/status': { configured: false },
  }
  const loader = createLiveIntegrationStatusLoader({
    client: {
      async get(path) {
        calls.push(path)
        return payloads[path]
      },
    },
  })

  const first = await loader()
  const second = await loader()
  assert.equal(first, second)
  assert.deepEqual(first, {
    templates: payloads['/api/admin/notification-templates'],
    edesy: payloads['/api/admin/calls/masking-status'],
    borzo: payloads['/api/admin/borzo/status'],
    shiprocket: payloads['/api/admin/shiprocket/status'],
    shadowfax: payloads['/api/admin/shadowfax/status'],
  })
  assert.deepEqual(calls, Object.keys(payloads))
})

test('production client and config reject any non-Reloved HTTPS origin before token use', () => {
  assert.throws(
    () => createProductionReadClient({ apiBase: 'https://attacker.example', token: 'must-not-leak' }),
    /approved Reloved API/,
  )
  assert.throws(
    () => selectLiveReviewConfig(
      { VITE_API_URL: 'https://attacker.example' },
      { JWT_SECRET: 'a-secure-server-secret-with-enough-length', ADMIN_EMAIL: 'reviewer@example.test' },
    ),
    /approved Reloved production origin/,
  )
})

test('live config selects only read necessities and never returns provider secrets', () => {
  const config = selectLiveReviewConfig(
    {
      VITE_API_URL: LIVE_PRODUCTION_API_ORIGIN,
      VITE_POSTHOG_PROJECT_TOKEN: 'capture-only',
    },
    {
      JWT_SECRET: 'a-secure-server-secret-with-enough-length',
      ADMIN_EMAIL: 'reviewer@example.test',
      BREVO_API_KEY: 'email-send-secret',
      MSG91_AUTH_KEY: 'sms-send-secret',
      BORZO_AUTH_TOKEN: 'courier-secret',
    },
  )

  assert.deepEqual(Object.keys(config).sort(), ['adminEmail', 'apiBase', 'capabilities', 'jwtSecret', 'pageSpeedApiKey', 'publicSiteUrl'])
  assert.equal(config.apiBase, LIVE_PRODUCTION_API_ORIGIN)
  assert.equal(config.publicSiteUrl, 'https://reloved.digital')
  assert.equal(config.capabilities.brevo, true)
  assert.equal(config.capabilities.posthog, false)
  assert.equal('BREVO_API_KEY' in config, false)
  assert.equal('VITE_POSTHOG_PROJECT_TOKEN' in config, false)
})

test('locally minted review token contains only admin identity claims', () => {
  const token = createAdminReadToken({
    adminEmail: 'reviewer@example.test',
    jwtSecret: 'a-secure-server-secret-with-enough-length',
    now: 1_800_000_000,
  })
  const [header, payload] = token.split('.').slice(0, 2).map((part) =>
    JSON.parse(Buffer.from(part, 'base64url').toString('utf8')),
  )
  assert.deepEqual(header, { alg: 'HS256', typ: 'JWT' })
  assert.deepEqual(payload, {
    sub: 'local-live-readonly-review',
    email: 'reviewer@example.test',
    role: 'admin',
    aud: 'reloved-admin-readonly-review',
    purpose: 'read-only-review',
    iat: 1_800_000_000,
    exp: 1_800_000_900,
  })
})

test('running loopback adapter permits GET and rejects every write before dispatch', async (t) => {
  const logs = []
  let dispatchCalls = 0
  const server = createLiveReadOnlyServer({
    apiBase: 'https://api.example.test',
    dispatch: async () => {
      dispatchCalls += 1
      return { ok: true }
    },
    log: (entry) => logs.push(entry),
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(() => server.close())
  const { port } = server.address()
  const origin = `http://127.0.0.1:${port}`

  const read = await fetch(`${origin}/api/admin/control-center/overview`)
  assert.equal(read.status, 200)
  assert.equal(read.headers.get('x-reloved-data-mode'), 'production-read-only')
  assert.deepEqual(await read.json(), { ok: true })

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const blocked = await fetch(`${origin}/api/admin/control-center/overview`, { method })
    assert.equal(blocked.status, 405)
    assert.deepEqual(await blocked.json(), { error: LIVE_READ_ONLY_ERROR })
  }
  assert.equal(dispatchCalls, 1)
  assert.deepEqual(logs.map((entry) => entry.method), ['POST', 'PUT', 'PATCH', 'DELETE'])
})

test('dispatcher and real bundle loader preserve distinct 7/14/30 periods and cache entries', async () => {
  const { createLiveBundleLoader } = await import('./admin-live-readonly-api.mjs')
  const { buildLiveAnalyticsSnapshot } = await import('./admin-live-readonly-data.mjs')
  const reads = []
  const client = { async get(path) {
    reads.push(path)
    const match = path.match(/^\/api\/admin\/analytics\?days=(\d+)$/)
    if (match) {
      const days = Number(match[1])
      return { range: { from: new Date(Date.UTC(2026, 8, 30) - (days - 1) * 86400000).toISOString().slice(0, 10), to: '2026-09-30' } }
    }
    return {}
  } }
  const dispatch = createLiveReadDispatcher({ loadBundle: createLiveBundleLoader({ client }), analyticsSnapshot: (bundle, range, options) => buildLiveAnalyticsSnapshot(bundle, range, { ...options, now: new Date('2026-09-30T12:00:00Z') }) })
  for (const [days, from] of [[7, '2026-09-24'], [14, '2026-09-17'], [30, '2026-09-01']]) {
    const before = reads.length
    const result = await dispatch(new URL(`http://127.0.0.1/api/admin/control-center/analytics/snapshot?range=${days}d`))
    assert.equal(result.range, `${days}d`)
    assert.equal(result.period.from, from)
    assert.equal(result.period.to, '2026-09-30')
    assert.deepEqual(reads.slice(before).filter(path => path.includes('/analytics?')), [`/api/admin/analytics?days=${days}`, `/api/admin/analytics?days=${days * 2}`])
  }
  const count = reads.length
  for (const [days, from] of [[14, '2026-09-17'], [7, '2026-09-24'], [30, '2026-09-01']]) {
    const result = await dispatch(new URL(`http://127.0.0.1/api/admin/control-center/analytics/snapshot?range=${days}d`))
    assert.equal(result.period.from, from)
  }
  assert.equal(reads.length, count, 'each selected range reuses only its own cached bundle')
})
