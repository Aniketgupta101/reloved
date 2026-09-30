import {
  LIVE_READ_ONLY_ERROR,
  assertAdminRequestAllowed,
} from '../src/lib/adminReadOnlyPolicy.mjs'
import { createHmac } from 'node:crypto'

export const LIVE_PRODUCTION_API_ORIGIN = 'https://reloved-digital.web.app'

const ADMIN_READ_PATHS = [
  /^\/api\/admin\/overview$/,
  /^\/api\/admin\/analytics$/,
  /^\/api\/admin\/submissions$/,
  /^\/api\/admin\/items$/,
  /^\/api\/admin\/item-requests$/,
  /^\/api\/admin\/orders$/,
  /^\/api\/admin\/contact-messages$/,
  /^\/api\/admin\/support-chats$/,
  /^\/api\/admin\/orders\/[^/]+\/notifications$/,
]

export function assertLiveReadOnlyEnvironment(env) {
  if (env.ADMIN_LIVE_READ_ONLY !== '1') {
    throw new Error('Live review requires ADMIN_LIVE_READ_ONLY=1')
  }
  if (env.VITE_ADMIN_DATA_MODE !== 'live-readonly') {
    throw new Error('Live review requires the live-readonly data mode')
  }
  if (env.VITE_API_URL !== '' || env.VITE_DEV_API_PROXY !== 'http://127.0.0.1:8788') {
    throw new Error('Live review API must use the loopback read-only adapter')
  }
  for (const key of [
    'BREVO_API_KEY', 'MSG91_AUTH_KEY', 'EDESY_API_KEY', 'BORZO_AUTH_TOKEN',
    'SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD', 'SHADOWFAX_TOKEN',
    'SHORT_IO_API_KEY', 'EMAIL_RELAY_SECRET', 'VITE_POSTHOG_PROJECT_TOKEN',
  ]) {
    if (env[key]) throw new Error(`${key} must not enter the live review process`)
  }
  if (env.VITE_POSTHOG_PROJECT_TOKEN) {
    throw new Error('Live review must not capture browser analytics')
  }
}

export function createLiveReadOnlyEnvironment(parent = process.env) {
  const env = {
    PATH: parent.PATH,
    HOME: parent.HOME,
    TMPDIR: parent.TMPDIR,
    ADMIN_LIVE_READ_ONLY: '1',
    VITE_ADMIN_DATA_MODE: 'live-readonly',
    VITE_ADMIN_LIVE_READ_ONLY: '1',
    VITE_ADMIN_PRIVACY_MODE: '1',
    VITE_ADMIN_FIXTURE_URL: 'http://127.0.0.1:3100/admin',
    VITE_ADMIN_LIVE_URL: 'http://127.0.0.1:3200/admin',
    VITE_ADMIN_LOCAL_QA: '',
    VITE_API_URL: '',
    VITE_DEV_API_PROXY: 'http://127.0.0.1:8788',
    VITE_DEV_UPLOADS_PROXY: 'http://127.0.0.1:8788',
    VITE_DEV_ADMIN_BYPASS: 'true',
    VITE_POSTHOG_PROJECT_TOKEN: '',
    PUBLIC_APP_URL: 'http://127.0.0.1:3200',
  }
  assertLiveReadOnlyEnvironment(env)
  return env
}

export function createLiveReadOnlyMethodGuard({ log = console.warn } = {}) {
  return function liveReadOnlyMethodGuard(request, response, next) {
    try {
      assertAdminRequestAllowed(request.method, 'live-readonly')
      next()
    } catch {
      const entry = {
        event: 'live_review_mutation_blocked',
        method: String(request.method || '').toUpperCase(),
        path: request.path || request.url || '/',
      }
      log(entry)
      response.status(405).json({ error: LIVE_READ_ONLY_ERROR })
    }
  }
}

export function createProductionReadClient({ apiBase, token, fetchImpl = fetch }) {
  const origin = new URL(apiBase)
  if (origin.origin !== LIVE_PRODUCTION_API_ORIGIN) {
    throw new Error('Production read origin is not the approved Reloved API')
  }
  if (origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Production read origin must not contain a path')
  }
  if (!token) throw new Error('Production admin read token is required')

  async function request(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      throw new Error('Production reads require a relative path')
    }
    const method = String(options.method || 'GET').toUpperCase()
    assertAdminRequestAllowed(method, 'live-readonly')
    const url = new URL(path, origin)
    if (url.origin !== origin.origin) throw new Error('Production read origin mismatch')
    if (!ADMIN_READ_PATHS.some((pattern) => pattern.test(url.pathname))) {
      throw new Error('Production reads require an allowlisted admin read route')
    }
    if (url.pathname === '/api/admin/analytics') {
      if ([...url.searchParams.keys()].some((key) => key !== 'days')) {
        throw new Error('Production analytics read contains an unsupported query')
      }
      if (!['7', '14', '30', '60'].includes(url.searchParams.get('days') || '')) {
        throw new Error('Production analytics read contains an unsupported range')
      }
    } else if (url.search) {
      throw new Error('Production read route does not accept a query')
    }
    const currentToken = typeof token === 'function' ? token() : token
    if (!currentToken) throw new Error('Production admin read token is required')
    const response = await fetchImpl(url.toString(), {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${currentToken}`,
      },
      redirect: 'error',
      signal: options.signal,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(
        typeof body?.error === 'string'
          ? body.error
          : `Production read failed (${response.status})`,
      )
      error.status = response.status
      throw error
    }
    return body
  }

  return {
    get(path, options = {}) {
      return request(path, { ...options, method: 'GET' })
    },
    request,
  }
}

export function selectLiveReviewConfig(frontendEnv, backendEnv) {
  const apiBase = String(frontendEnv.VITE_API_URL || '').trim().replace(/\/$/, '')
  const parsedApi = new URL(apiBase)
  if (parsedApi.origin !== LIVE_PRODUCTION_API_ORIGIN || parsedApi.pathname !== '/' || parsedApi.search || parsedApi.hash) {
    throw new Error('VITE_API_URL must be the approved Reloved production origin')
  }
  const jwtSecret = String(backendEnv.JWT_SECRET || '')
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET is missing or too short')
  const adminEmail = String(backendEnv.ADMIN_EMAIL || '').trim()
  if (!/^\S+@\S+\.\S+$/.test(adminEmail)) throw new Error('ADMIN_EMAIL is missing')
  const publicSiteUrl = String(backendEnv.PUBLIC_APP_URL || 'https://reloved.digital').trim().replace(/\/$/, '')
  const parsedPublicSite = new URL(publicSiteUrl)
  if (parsedPublicSite.protocol !== 'https:') throw new Error('PUBLIC_APP_URL must use HTTPS')
  const hasGoogleReadCredential = Boolean(backendEnv.GOOGLE_APPLICATION_CREDENTIALS || backendEnv.GOOGLE_SERVICE_ACCOUNT_JSON)
  const capabilities = {
    brevo: Boolean(backendEnv.BREVO_API_KEY),
    msg91: Boolean(backendEnv.MSG91_AUTH_KEY),
    edesy: Boolean(backendEnv.EDESY_API_KEY),
    couriers: Boolean(backendEnv.BORZO_AUTH_TOKEN || backendEnv.SHIPROCKET_PASSWORD || backendEnv.SHADOWFAX_TOKEN),
    posthog: Boolean(backendEnv.POSTHOG_PERSONAL_API_KEY && backendEnv.POSTHOG_PROJECT_ID && backendEnv.POSTHOG_HOST),
    ga4: Boolean((backendEnv.GOOGLE_ANALYTICS_PROPERTY_ID || backendEnv.GA_PROPERTY_ID) && hasGoogleReadCredential),
    searchConsole: Boolean(backendEnv.GOOGLE_SEARCH_CONSOLE_SITE && hasGoogleReadCredential),
    crux: Boolean(backendEnv.CRUX_API_KEY),
    pageSpeed: Boolean(backendEnv.PAGESPEED_API_KEY),
  }
  return {
    apiBase,
    adminEmail,
    jwtSecret,
    publicSiteUrl,
    capabilities,
    pageSpeedApiKey: backendEnv.PAGESPEED_API_KEY || null,
  }
}

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function createAdminReadToken({ adminEmail, jwtSecret, now = Math.floor(Date.now() / 1000) }) {
  const header = encodeJwtPart({ alg: 'HS256', typ: 'JWT' })
  const payload = encodeJwtPart({
    sub: 'local-live-readonly-review',
    email: adminEmail,
    role: 'admin',
    aud: 'reloved-admin-readonly-review',
    purpose: 'read-only-review',
    iat: now,
    exp: now + 15 * 60,
  })
  const unsigned = `${header}.${payload}`
  const signature = createHmac('sha256', jwtSecret).update(unsigned).digest('base64url')
  return `${unsigned}.${signature}`
}

export const liveReadOnlyFrontendCommands = [
  ['npm', 'run', 'build'],
  ['npm', 'run', 'preview', '--', '--host', '127.0.0.1', '--port', '3200', '--strictPort'],
]
