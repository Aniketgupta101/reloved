import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
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
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function withApp(run) {
  const port = await availablePort()
  const origin = `http://127.0.0.1:${port}`
  const state = { exited: false, output: '' }
  const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: frontend,
    env: { ...makeLocalEnvironment(process.env), VITE_DEV_ADMIN_BYPASS: 'true', DISABLE_HMR: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { state.output += chunk })
  child.on('exit', () => { state.exited = true })
  let browser
  try {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      if (state.exited) throw new Error(`Vite exited before startup.\n${state.output}`)
      try { if ((await fetch(origin)).ok) break } catch {}
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    browser = await chromium.launch({ headless: true, channel: 'chrome' })
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
    await run({ origin, context })
    await context.close()
  } finally {
    await browser?.close()
    if (!state.exited) {
      const exit = once(child, 'exit')
      child.kill('SIGTERM')
      await Promise.race([exit, new Promise(resolve => setTimeout(resolve, 5_000))])
    }
  }
}

const meta = {
  asOf: '2026-09-30T08:00:00.000Z', coverage: 'complete', scope: 'Synthetic safety regression.',
  sources: [{ source: 'synthetic', state: 'complete', scanned: 2, limit: 20, reason: null }],
}

const emptyAudit = () => ({ state: 'complete', counts: { sent: 0, failed: 0, skipped: 0 }, latest: null, attempts: [] })
function operation(overrides = {}) {
  return {
    ...meta, id: 'same-claim', itemId: 'item', itemTitle: 'Synthetic item', itemImages: [],
    giverName: 'Giver', giverEmail: 'giver@synthetic.invalid', giverPhone: '9000000001',
    requesterName: 'Claimer', requesterEmail: 'claimer@synthetic.invalid', requesterPhone: '9000000002',
    pickupLocality: 'Mumbai', pickupAddress: 'Pickup 400001', requesterAddress: 'Drop 400002',
    logistics: 'porter_arranged', status: 'pending', claimStatus: 'pending', handoverStage: null,
    opsBookingStatus: null, deliveryStatus: null, createdAt: '2026-09-30T06:00:00.000Z',
    updatedAt: '2026-09-30T07:00:00.000Z', agreedSlotAt: null, proposedSlotAt: null,
    timing: 'unscheduled', action: { kind: 'review', label: 'Review claim' },
    nextAction: { label: 'Review claim', href: '/admin/item-requests?claimId=same-claim' },
    notifications: { email: emptyAudit(), sms: emptyAudit() },
    courierPrerequisites: { pickupAddress: 'Pickup 400001', dropAddress: 'Drop 400002', pickupPincode: '400001', dropPincode: '400002', state: 'complete' },
    courier: { bookedVia: null, borzo: { orderId: null, status: null }, shiprocket: { orderId: null, status: null }, shadowfax: { orderId: null, status: null }, payment: { paidBy: null } },
    map: { state: 'unavailable', reason: 'Map location unavailable.', pickup: null, destination: null }, note: null, opsNote: null,
    ...overrides,
  }
}

test('support email drafts stay bound to their recipient', { timeout: 60_000 }, async () => withApp(async ({ origin, context }) => {
  const writes = []
  const contacts = ['a', 'b'].map(id => ({
    id: `contact:${id}`, sourceId: id, chatSubjectId: null, source: 'contact_form', state: 'unread',
    person: `Contact ${id.toUpperCase()}`, email: `${id}@synthetic.invalid`, phone: null,
    subject: `Question ${id}`, preview: `Message ${id}`, occurredAt: `2026-09-30T0${id === 'a' ? 8 : 7}:00:00.000Z`, linked: {},
  }))
  await context.route('**/api/admin/**', route => {
    const request = route.request(); const url = new URL(request.url())
    if (request.method() === 'POST') { writes.push({ path: url.pathname, body: request.postDataJSON() }); return route.fulfill({ json: { ok: true } }) }
    if (url.pathname === '/api/admin/control-center/support') return route.fulfill({ json: { ...meta, items: contacts, focused: null, nextCursor: null, order: 'Newest first' } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected synthetic route' } })
  })
  const page = await context.newPage()
  await page.goto(`${origin}/admin/messages`)
  await page.getByRole('heading', { name: 'Contact A', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Email reply', exact: true }).click()
  await page.getByLabel('Reply to Contact A').fill('Private reply intended for synthetic A')
  await page.getByRole('button', { name: /Contact B/ }).click()
  await page.getByRole('button', { name: 'Email reply', exact: true }).click()
  const replyB = page.getByLabel('Reply to Contact B')
  assert.equal(await replyB.inputValue(), '')
  await replyB.fill('Reply intended for synthetic B')
  await page.getByRole('button', { name: 'Send email reply', exact: true }).click()
  assert.deepEqual(writes, [{ path: '/api/admin/contact-messages/b/reply', body: { reply: 'Reply intended for synthetic B' } }])
}))

test('claim decision confirmation revalidates the latest same-ID claim before mutation', { timeout: 60_000 }, async () => withApp(async ({ origin, context }) => {
  let detail = operation(); let detailReads = 0
  const writes = []
  await context.route('**/api/admin/**', route => {
    const request = route.request(); const url = new URL(request.url())
    if (!['GET', 'HEAD'].includes(request.method())) { writes.push(`${request.method()} ${url.pathname}`); return route.fulfill({ json: { ok: true } }) }
    if (url.pathname === '/api/admin/control-center/claims/same-claim') { detailReads += 1; return route.fulfill({ json: detail }) }
    if (url.pathname.endsWith('/communications')) return route.fulfill({ json: { ...meta, items: [], nextCursor: null, order: 'Newest first' } })
    if (url.pathname === '/api/admin/notification-templates') return route.fulfill({ json: { templates: [] } })
    if (url.pathname === '/api/admin/calls/masking-status') return route.fulfill({ json: { configured: false } })
    if (/\/api\/admin\/(borzo|shiprocket|shadowfax)\/status/.test(url.pathname)) return route.fulfill({ json: { configured: false } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected synthetic route' } })
  })
  const page = await context.newPage()
  await page.goto(`${origin}/admin/item-requests?claimId=same-claim`)
  await page.getByRole('button', { name: "Couldn't match", exact: true }).click()
  detail = operation({ status: 'approved', claimStatus: 'approved', updatedAt: '2026-09-30T07:30:00.000Z', action: { kind: 'stage', label: 'Mark out for delivery', opsStatus: 'out_for_delivery' } })
  await page.getByRole('button', { name: 'Confirm update', exact: true }).click()
  await page.getByText(/changed since this confirmation opened/i).waitFor()
  assert.ok(detailReads >= 2, 'confirmation must perform a fresh detail read')
  assert.deepEqual(writes, [])
}))

test('manual delivery-stage confirmation is invalidated when the transition changes', { timeout: 60_000 }, async () => withApp(async ({ origin, context }) => {
  let detail = operation({ status: 'booked', claimStatus: 'approved', opsBookingStatus: 'booked', agreedSlotAt: '2026-09-30T10:00:00.000Z', timing: 'scheduled', action: { kind: 'stage', label: 'Mark out for delivery', opsStatus: 'out_for_delivery' } })
  const writes = []
  await context.route('**/api/admin/**', route => {
    const request = route.request(); const url = new URL(request.url())
    if (!['GET', 'HEAD'].includes(request.method())) { writes.push(`${request.method()} ${url.pathname}`); return route.fulfill({ json: { ok: true } }) }
    if (url.pathname === '/api/admin/control-center/deliveries/same-claim') return route.fulfill({ json: detail })
    if (url.pathname.endsWith('/communications')) return route.fulfill({ json: { ...meta, items: [], nextCursor: null, order: 'Newest first' } })
    if (url.pathname === '/api/admin/notification-templates') return route.fulfill({ json: { templates: [] } })
    if (url.pathname === '/api/admin/calls/masking-status') return route.fulfill({ json: { configured: false } })
    if (/\/api\/admin\/(borzo|shiprocket|shadowfax)\/status/.test(url.pathname)) return route.fulfill({ json: { configured: false } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected synthetic route' } })
  })
  const page = await context.newPage()
  await page.goto(`${origin}/admin/orders?claimId=same-claim`)
  await page.getByRole('button', { name: 'Mark out for delivery', exact: true }).click()
  await page.getByRole('region', { name: 'Confirm operation' }).waitFor()
  detail = operation({ status: 'out_for_delivery', claimStatus: 'approved', opsBookingStatus: 'out_for_delivery', updatedAt: '2026-09-30T07:30:00.000Z', agreedSlotAt: '2026-09-30T10:00:00.000Z', timing: 'scheduled', action: { kind: 'stage', label: 'Confirm delivered', opsStatus: 'delivered' } })
  await page.locator('.admin-page-header').getByRole('button', { name: 'Refresh', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm delivered', exact: true }).waitFor()
  assert.equal(await page.getByRole('region', { name: 'Confirm operation' }).count(), 0)
  assert.deepEqual(writes, [])
}))
