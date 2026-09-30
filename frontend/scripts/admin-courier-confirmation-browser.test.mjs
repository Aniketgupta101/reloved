import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { makeLocalEnvironment } from './admin-local-harness.mjs'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))

async function availablePort() {
  const server = createServer()
  server.unref()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const port = address.port
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(origin, processState) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (processState.exited) throw new Error(`Vite exited before startup.\n${processState.output}`)
    try {
      const response = await fetch(origin)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for Vite.\n${processState.output}`)
}

const emptyAudit = () => ({
  state: 'complete',
  counts: { sent: 0, failed: 0, skipped: 0 },
  latest: null,
  attempts: [],
})

function operationDetail(overrides = {}) {
  return {
    asOf: '2026-09-30T08:00:00.000Z',
    coverage: 'complete',
    scope: 'Synthetic mounted courier confirmation regression.',
    sources: [{ source: 'synthetic', state: 'ready', scanned: 1, limit: 1, reason: null }],
    id: 'same-claim',
    itemId: 'synthetic-item',
    itemTitle: 'Synthetic courier item',
    itemImages: [],
    giverName: 'Synthetic Giver',
    giverEmail: 'giver@synthetic.invalid',
    giverPhone: '9000000001',
    requesterName: 'Synthetic Claimer',
    requesterEmail: 'claimer@synthetic.invalid',
    requesterPhone: '9000000002',
    pickupLocality: 'Synthetic pickup',
    pickupAddress: 'Synthetic pickup, Mumbai 400001',
    requesterAddress: 'Synthetic destination, Mumbai 400002',
    logistics: 'porter_arranged',
    status: 'ready_to_book',
    claimStatus: 'approved',
    handoverStage: 'schedule_agreed',
    opsBookingStatus: 'ready_to_book',
    deliveryStatus: null,
    courierPrerequisites: {
      pickupAddress: 'Synthetic pickup, Mumbai 400001',
      dropAddress: 'Synthetic destination, Mumbai 400002',
      pickupPincode: '400001',
      dropPincode: '400002',
      state: 'complete',
    },
    courier: {
      bookedVia: null,
      borzo: { orderId: null, orderName: null, status: null, deliveryStatus: null, trackingUrl: null, deliveryFee: null, courierName: null, courierPhone: null, bookedAt: null, updatedAt: null },
      shiprocket: { orderId: null, shipmentId: null, channelOrderId: null, status: null, awb: null, courierName: null, trackingUrl: null, paymentMethod: null, walletBalanceAtBook: null, assignError: null, bookedAt: null, updatedAt: null },
      shadowfax: { orderId: null, status: null, awb: null, trackingUrl: null, paymentMethod: null, bookedAt: null, updatedAt: null },
      payment: { paidBy: null, subsidyIndex: null, subsidyReleased: null },
    },
    note: null,
    opsNote: null,
    createdAt: '2026-09-30T06:00:00.000Z',
    updatedAt: '2026-09-30T07:00:00.000Z',
    agreedSlotAt: '2026-09-30T10:00:00.000Z',
    proposedSlotAt: null,
    timing: 'scheduled',
    action: { kind: 'coordinate', label: 'Coordinate handover' },
    nextAction: { label: 'Coordinate handover', href: '/admin/item-requests?claimId=same-claim' },
    notifications: { email: emptyAudit(), sms: emptyAudit() },
    map: { state: 'unavailable', reason: 'Map location unavailable.', pickup: null, destination: null },
    ...overrides,
  }
}

test('mounted courier confirmation blocks a stale cross-provider booking', { timeout: 60_000 }, async () => {
  const port = await availablePort()
  const origin = `http://127.0.0.1:${port}`
  const environment = {
    ...makeLocalEnvironment(process.env),
    VITE_DEV_ADMIN_BYPASS: 'true',
    DISABLE_HMR: 'true',
  }
  const processState = { exited: false, output: '' }
  const devServer = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: frontend,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [devServer.stdout, devServer.stderr]) stream.on('data', chunk => { processState.output += chunk })
  devServer.on('exit', () => { processState.exited = true })
  let browser
  try {
    await waitForServer(origin, processState)
    browser = await chromium.launch({ headless: true, channel: 'chrome' })
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
    let detail = operationDetail()
    const writes = []
    const external = []
    const browserErrors = []
    context.on('request', request => {
      if (!['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
    })
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) {
        external.push(url.href)
        return route.abort()
      }
      return route.continue()
    })
    await context.route('**/api/admin/**', route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.pathname === '/api/admin/control-center/claims/same-claim') return route.fulfill({ json: detail })
      if (url.pathname === '/api/admin/control-center/deliveries/same-claim/communications') {
        return route.fulfill({ json: { ...operationDetail(), items: [], nextCursor: null } })
      }
      if (url.pathname === '/api/admin/notification-templates') return route.fulfill({ json: { templates: [] } })
      if (url.pathname === '/api/admin/calls/masking-status') return route.fulfill({ json: { configured: false } })
      if (/^\/api\/admin\/(borzo|shiprocket|shadowfax)\/status$/.test(url.pathname)) {
        return route.fulfill({ json: { configured: true, walletReady: true } })
      }
      return route.fulfill({ status: 404, json: { error: `Unexpected synthetic route: ${url.pathname}` } })
    })
    const page = await context.newPage()
    page.on('pageerror', error => browserErrors.push(error.message))
    await page.goto(`${origin}/admin/item-requests?claimId=same-claim`)
    await page.getByRole('heading', { name: 'Courier operations', exact: true }).waitFor()
    const book = page.getByRole('button', { name: 'Book Borzo', exact: true })
    await assert.doesNotReject(() => book.click())
    const confirmation = page.getByRole('region', { name: 'Confirm courier action' })
    await confirmation.waitFor()
    const confirm = confirmation.getByRole('button', { name: 'Confirm Book Borzo', exact: true })
    assert.equal(await confirm.isEnabled(), true)

    detail = operationDetail({
      updatedAt: '2026-09-30T07:30:00.000Z',
      courier: {
        ...detail.courier,
        shiprocket: { ...detail.courier.shiprocket, orderId: 'SR-other-operator', status: 'BOOKED' },
      },
    })
    await page.locator('.admin-page-header').getByRole('button', { name: 'Refresh', exact: true }).click()
    await confirmation.getByText('A provider or manual courier booking is already recorded.', { exact: true }).waitFor()
    assert.equal(await book.isDisabled(), true)
    assert.equal(await confirm.isDisabled(), true)

    await confirm.dispatchEvent('click')
    await page.waitForTimeout(100)
    assert.deepEqual(writes, [], 'disabled stale confirmation must emit zero mutation requests')
    assert.deepEqual(external, [], 'mounted regression must remain loopback-only')
    assert.deepEqual(browserErrors, [], 'mounted regression must not raise browser errors')
    await context.close()
  } finally {
    await browser?.close()
    if (!processState.exited) {
      const exit = once(devServer, 'exit')
      devServer.kill('SIGTERM')
      let timer
      await Promise.race([
        exit.finally(() => clearTimeout(timer)),
        new Promise(resolve => { timer = setTimeout(resolve, 5_000) }),
      ])
    }
  }
})

test('operational actions and analytics remain readable at 390 and 320 pixels', { timeout: 60_000 }, async () => {
  const { buildLiveAnalyticsSnapshot } = await import('./admin-live-readonly-data.mjs')
  const port = await availablePort(), origin = `http://127.0.0.1:${port}`
  const processState = { exited: false, output: '' }
  const devServer = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: frontend, env: { ...makeLocalEnvironment(process.env), VITE_DEV_ADMIN_BYPASS: 'true', DISABLE_HMR: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [devServer.stdout, devServer.stderr]) stream.on('data', chunk => { processState.output += chunk })
  devServer.on('exit', () => { processState.exited = true })
  let browser
  try {
    await waitForServer(origin, processState)
    browser = await chromium.launch({ headless: true, channel: 'chrome' })
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const writes = [], external = [], errors = []
    const detail = operationDetail()
    detail.courier.borzo.trackingUrl = `https://tracking.synthetic.invalid/${'tracking'.repeat(35)}`
    const meta = { asOf: detail.asOf, coverage: 'complete', sources: [], scope: 'Synthetic complete responsive fixture' }
    const attention = { id: 'a', category: 'claims', severity: 'warning', type: 'waiting_claim', title: 'Synthetic waiting claim', description: 'A pending synthetic request', entity: { type: 'claim', id: detail.id }, occurredAt: detail.createdAt, dueAt: null, nextAction: detail.nextAction, actions: [{ label: 'Open claim and courier operations', href: detail.nextAction.href, kind: 'view', primary: true }], recorded: { subject: 'Synthetic notification', preview: 'unbroken'.repeat(40), error: null } }
    const analytics = buildLiveAnalyticsSnapshot({}, '14d', { now: new Date(detail.asOf) })
    analytics.sections.overview.activity = [{ id: 'drops', label: 'Drops', color: 'pink', points: [{ at: '2026-09-29', value: 2 }, { at: '2026-09-30', value: 3 }] }]
    analytics.sections.product.categories = [{ id: 'tops', label: 'VeryLongCategory'.repeat(8), supply: 3, demand: 2 }]
    analytics.sections.product.attentionItems = [{ id: 'i', label: 'Synthetic aged item', href: '/admin/items?itemId=i' }]
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort() }
      return route.continue()
    })
    await context.route('**/api/admin/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname
      if (!['GET', 'HEAD'].includes(request.method())) { writes.push(path); return route.abort() }
      if (path === '/api/admin/control-center/analytics/snapshot') return route.fulfill({ json: analytics })
      if (path === '/api/admin/control-center/attention') return route.fulfill({ json: { ...meta, items: [attention], nextCursor: null, order: 'Synthetic' } })
      if (path === '/api/admin/control-center/overview') return route.fulfill({ json: { ...meta, range: '24h', timezone: 'Asia/Kolkata', rangeStart: detail.createdAt, kpis: [], windows: {}, deliveries: { state: 'complete', today: [detail], next48h: [], undated: [] }, waitingOnPeople: [attention], messagingFailures: [] } })
      if (/\/control-center\/(claims|deliveries)\/same-claim$/.test(path)) return route.fulfill({ json: detail })
      if (/\/control-center\/(claims|deliveries)$/.test(path)) return route.fulfill({ json: { ...meta, items: [detail], nextCursor: null, order: 'Synthetic' } })
      if (path.endsWith('/funnel')) return route.fulfill({ json: { ...meta, steps: [] } })
      if (path.endsWith('/communications')) return route.fulfill({ json: { ...meta, items: [], nextCursor: null } })
      if (path === '/api/admin/notification-templates') return route.fulfill({ json: { templates: [] } })
      if (path.endsWith('/masking-status')) return route.fulfill({ json: { configured: false } })
      if (/\/admin\/(borzo|shiprocket|shadowfax)\/status$/.test(path)) return route.fulfill({ json: { configured: true, walletReady: true } })
      return route.fulfill({ status: 404, json: { error: 'Unexpected synthetic read' } })
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const fits = async label => {
      const size = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }))
      assert.ok(size.page <= size.viewport, `${label}: ${JSON.stringify(size)}`)
      const controls = await page.locator('main button:visible, main input:visible, main select:visible, .operation-action-confirm:visible').evaluateAll(elements => elements.filter(el => !el.closest('.analytics-nav')).map(el => ({ text: el.textContent?.slice(0, 60), left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })))
      assert.ok(controls.every(c => c.left >= 0 && c.right <= size.viewport + 1), `${label}: ${JSON.stringify(controls.filter(c => c.left < 0 || c.right > size.viewport + 1))}`)
    }
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      for (const [path, heading] of [['/admin', 'Overview'], ['/admin/notifications', 'Notifications'], ['/admin/item-requests', 'Claims'], ['/admin/orders', 'Deliveries']]) {
        await page.goto(origin + path)
        await page.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor()
        await page.locator('.admin-updated').waitFor()
        await fits(`${heading} ${width}`)
      }
      await page.getByRole('button', { name: 'Calendar', exact: true }).click()
      await page.getByLabel('Calendar span').waitFor()
      await fits(`Calendar ${width}`)
      await page.getByRole('button', { name: 'Map', exact: true }).click()
      await fits(`Map fallback ${width}`)
      await page.goto(origin + '/admin/item-requests?claimId=same-claim')
      await page.getByRole('button', { name: 'Book Borzo', exact: true }).click()
      await page.getByRole('region', { name: 'Confirm courier action' }).waitFor()
      await fits(`Confirmation and tracking ${width}`)
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      const menu = page.getByRole('button', { name: 'Open admin menu', exact: true })
      await menu.click(); await page.keyboard.press('Escape')
      assert.equal(await menu.evaluate(el => el === document.activeElement), true)
      for (const view of ['overview', 'funnels', 'product', 'data-health', 'traffic', 'search', 'performance']) {
        await page.goto(origin + `/admin/analytics?view=${view}`)
        await page.locator('.analytics-section-body').waitFor()
        await fits(`Analytics ${view} ${width}`)
        if (view === 'overview') {
          await page.getByText('Daily values', { exact: true }).click()
          await page.getByRole('table').waitFor()
          await fits(`Daily values table ${width}`)
          await page.getByRole('button', { name: '14 days', exact: true }).click()
          assert.equal(await page.getByRole('button', { name: '14 days', exact: true }).getAttribute('aria-pressed'), 'true')
        }
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
      await fits(`200% text ${width}`)
      await page.evaluate(() => { document.documentElement.style.fontSize = '' })
    }
    assert.deepEqual(writes, []); assert.deepEqual(external, []); assert.deepEqual(errors, [])
    await context.close()
  } finally {
    await browser?.close()
    if (!processState.exited) { const exit = once(devServer, 'exit'); devServer.kill('SIGTERM'); await exit }
  }
})
