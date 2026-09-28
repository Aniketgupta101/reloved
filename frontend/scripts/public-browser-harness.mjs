import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

// Every API response is local and explicit. Later page-family checks can extend
// this map with `METHOD /api/path` entries; writes never pass through to a server.
export const publicFixtures = {
  'GET /api/items': { items: [] },
}

// Explicit response metadata for loading and failure scenarios. Plain fixture
// objects keep the original API, and no request is sent to the real service.
export const fixtureResponse = (json, options = {}) => ({ __fixtureResponse: true, json, ...options })

export async function installFixtures(context, baseURL, fixtures = {}) {
  const localOrigin = new URL(baseURL).origin
  const localFixtures = { ...publicFixtures, ...fixtures }
  const violations = []
  const errors = []
  const requests = []
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text())
    })
  })
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const key = `${request.method()} ${url.pathname}`
    requests.push(key)
    // Check origin before path-based fixtures: an identical API path on another
    // host is still an unintended request and must never be accepted as local.
    if (url.origin !== localOrigin) {
      // Existing document integrations are deliberately inert local responses.
      if (request.method() === 'GET') {
        if (url.origin === 'https://www.googletagmanager.com' && ['/gtm.js', '/gtag/js'].includes(url.pathname)) {
          await route.fulfill({ contentType: 'application/javascript', body: '' })
          return
        }
        // The installed compressor's worker imports this exact versioned script.
        // Serve the installed bytes locally so real compression remains exercised
        // without contacting the CDN or allowing any other external URL.
        if (url.origin === 'https://cdn.jsdelivr.net' && url.pathname === '/npm/browser-image-compression@2.0.2/dist/browser-image-compression.js') {
          await route.fulfill({ contentType: 'application/javascript', body: await readFile(resolve('node_modules/browser-image-compression/dist/browser-image-compression.js')) })
          return
        }
        if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') {
          await route.fulfill({ contentType: 'text/css', body: '' })
          return
        }
        if (url.origin === 'https://api.maptiler.com' && url.pathname === '/maps/streets-v2/style.json') {
          await route.fulfill({ json: { version: 8, sources: {}, layers: [] } })
          return
        }
        if (['https://reloved.digital', 'https://reloved-digital.web.app'].includes(url.origin) && url.pathname.startsWith('/images/')) {
          await route.fulfill({ body: await readFile(resolve('public', `.${url.pathname}`)), contentType: url.pathname.endsWith('.webp') ? 'image/webp' : 'image/png' })
          return
        }
      }
      violations.push(`Unexpected external request: ${request.url()}`)
      await route.abort('blockedbyclient')
      return
    }
    const fixture = localFixtures[key]
    if (fixture !== undefined) {
      const response = typeof fixture === 'function' ? await fixture(request) : fixture
      if (response?.__fixtureResponse) {
        if (response.delayMs) await new Promise(resolve => setTimeout(resolve, response.delayMs))
        await route.fulfill({ status: response.status || 200, json: response.json })
      } else {
        await route.fulfill({ json: response })
      }
      return
    }
    if (request.method() !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
      violations.push(`Unfulfilled request: ${key}`)
      await route.fulfill({ status: 200, json: {} })
      return
    }
    await route.continue()
  })
  return { violations, errors, requests }
}

export async function withPublicBrowser(run) {
  const baseURL = process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:4317'
  let server
  if (!process.env.PUBLIC_BASE_URL) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4317', '--strictPort'], {
      env: { ...process.env, VITE_API_URL: '', VITE_ASSET_BASE: '', VITE_POSTHOG_KEY: '', DISABLE_HMR: 'true' },
      stdio: 'pipe',
    })
    let output = ''
    server.stderr.on('data', chunk => { output += chunk })
    server.stdout.on('data', chunk => { output += chunk })
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Vite exited: ${output}`)
      if (output.includes('127.0.0.1:4317')) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  let browser
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PUBLIC_BROWSER_CHANNEL || 'chrome' })
    await run(browser, baseURL)
  } finally {
    await browser?.close()
    if (server && server.exitCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve))
      server.kill('SIGTERM')
      await exited
    }
  }
}

export async function assertNoOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'document must not overflow horizontally')
}

export async function assertPublicFonts(page) {
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready
    return {
      body: getComputedStyle(document.querySelector('.public-experience')).fontFamily,
      heading: getComputedStyle(document.querySelector('h1')).fontFamily,
      loaded: ['Reloved Public Manrope', 'Reloved Public Bricolage'].map(family =>
        [...document.fonts].some(face => face.family.replaceAll('"', '') === family && face.status === 'loaded') && document.fonts.check(`16px "${family}"`)),
    }
  })
  assert.match(fonts.body, /Reloved Public Manrope/)
  assert.match(fonts.heading, /Reloved Public Bricolage/)
  assert.deepEqual(fonts.loaded, [true, true], 'both self-hosted fonts must actually load')
}

export async function assertTargets(locator) {
  for (const control of await locator.all()) {
    if (!(await control.isVisible())) continue
    const box = await control.boundingBox()
    assert.ok(box.width >= 44 && box.height >= 44, `Target too small: ${await control.getAttribute('aria-label') || await control.innerText()} (${box.width}×${box.height})`)
  }
}
