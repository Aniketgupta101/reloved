import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { assertLocalEnvironment, makeLocalEnvironment } from './admin-local-harness.mjs'

const safe = {
  ADMIN_LOCAL_QA: '1', GCLOUD_PROJECT: 'demo-reloved-admin', GOOGLE_CLOUD_PROJECT: 'demo-reloved-admin',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  VITE_API_URL: '', VITE_DEV_API_PROXY: 'http://127.0.0.1:8787',
}

test('local project and every emulator host are required', () => {
  assert.doesNotThrow(() => assertLocalEnvironment(safe))
  assert.throws(() => assertLocalEnvironment({ ...safe, GCLOUD_PROJECT: 'reloved-digital' }))
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    const missing = { ...safe }
    delete missing[key]
    assert.throws(() => assertLocalEnvironment(missing))
    assert.throws(() => assertLocalEnvironment({ ...safe, [key]: 'production.example:8080' }))
  }
})

test('local process uses fake credentials and never carries provider secrets', () => {
  const env = makeLocalEnvironment({ BREVO_API_KEY: 'secret', VITE_API_URL: 'https://reloved.digital' })
  assertLocalEnvironment(env)
  assert.equal(env.BREVO_API_KEY, undefined)
  assert.equal(env.VITE_API_URL, '')
  assert.equal(env.ADMIN_EMAIL, 'admin@synthetic.invalid')
})

test('fixture covers lifecycle and communication states with fake identities', async () => {
  const { adminControlCenterFixtures } = await import('../../firebase-backend/functions/lib/scripts/seedAdminControlCenter.js')
  const rows = adminControlCenterFixtures()
  const require = createRequire(new URL('../../firebase-backend/functions/lib/scripts/seedAdminControlCenter.js', import.meta.url))
  const { Timestamp } = require('firebase-admin/firestore')
  const all = Object.values(rows).flat()
  const values = new Set(all.flatMap((row) => [row.status, row.publicStatus, row.handoverStage, row.opsBookingStatus, row.deliveryMethod].filter(Boolean)))
  for (const value of ['submitted', 'available', 'being_matched', 'claimed', 'reloved', 'pending', 'rejected', 'approved', 'schedule_proposed', 'ready_to_book', 'booked', 'out_for_delivery', 'delivered', 'cancelled']) assert.ok(values.has(value), value)
  const communication = new Set(rows.notificationEvents.map((row) => `${row.channel}:${row.status}`))
  for (const value of ['email:sent', 'email:failed', 'sms:sent', 'sms:failed', 'sms:skipped']) assert.ok(communication.has(value), value)
  assert.ok(all.some((row) => row.unreadForAdmin === true))
  for (const method of ['receiver_collects', 'giver_sends', 'reloved_courier']) assert.ok(values.has(method), method)
  for (const name of ['today', 'within-hour', 'overdue', 'tomorrow', 'completed']) assert.ok(rows.itemRequests.some((row) => row.id === `qa-delivery-${name}`), name)
  assert.ok(JSON.stringify(rows).includes('@synthetic.invalid'))
  assert.ok(!JSON.stringify(rows).includes('@reloved.digital'))
  for (const collection of Object.values(rows)) for (const row of collection) {
    if (row.id === 'qa-item-legacy-string') { assert.equal(typeof row.createdAt, 'string'); assert.ok(Number.isFinite(Date.parse(row.createdAt))) }
    else if (row.id === 'qa-item-undated') assert.equal(Object.hasOwn(row, 'createdAt'), false)
    else assert.ok(row.createdAt instanceof Timestamp, row.id + '.createdAt')
    if (row.updatedAt) assert.ok(row.updatedAt instanceof Timestamp, row.id + '.updatedAt')
  }
  assert.ok(rows.donationSubmissions.every((row) => row.donorFirstName && row.email && row.donorTarget && row.giverLogistics && row.submittedAt instanceof Timestamp))
  assert.ok(rows.itemRequests.every((row) => row.requesterTarget && row.requesterName && row.giverLogistics && row.itemTitle))
  assert.ok(rows.notificationEvents.every((row) => row.templateKey && row.to && row.audience && row.subject && row.previewBody))
  assert.ok(rows.itemRequests.some((row) => row.id === 'qa-delivery-today' && row.agreedSlotAt))
  assert.ok(rows.analyticsDaily.some((row) => row.e_donation_started > 0), 'fixture uses the mirrored donation_started event field')
  assert.ok(rows.analyticsDaily.every((row) => !Object.hasOwn(row, 'e_drop_started')), 'fixture must not use a nonexistent drop_started event field')
})

test('production-built QA preview uses loopback same-origin forwarding and strips remote HTML', async () => {
  const { resolveConfig } = await import('vite')
  const previous = { ...process.env }
  try {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, makeLocalEnvironment(previous))
    const config = await resolveConfig({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) }, 'build', 'production')
    assert.equal(config.preview.proxy?.['/api']?.target, 'http://127.0.0.1:8787')
    assert.equal(config.preview.proxy?.['/uploads']?.target, 'http://127.0.0.1:8787')
    const plugin = config.plugins.find(p => p.name === 'admin-local-strip-remote-html')
    const html = '<!-- Google Tag Manager -->remote<!-- End Google Tag Manager -->\n<link rel="stylesheet" href="https://fonts.googleapis.com/css">\n<main>Local</main>'
    assert.equal(plugin.transformIndexHtml(html).trim(), '<main>Local</main>')
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, previous)
  }
})

test('synthetic item images resolve to existing same-origin photos', async () => {
  const { access } = await import('node:fs/promises')
  const { adminControlCenterFixtures } = await import('../../firebase-backend/functions/lib/scripts/seedAdminControlCenter.js')
  for (const row of adminControlCenterFixtures().items) {
    for (const photo of row.images) {
      const path = typeof photo === 'string' ? photo : photo.storagePath
      assert.ok(path.startsWith('/images/'), path)
      await access(new URL('../public' + path, import.meta.url))
    }
  }
})

test('local runner selects a strict loopback production build and preview plan', async () => {
  const { localFrontendCommands } = await import('./admin-local-harness.mjs')
  assert.deepEqual(localFrontendCommands, [['npm', 'run', 'build'], ['npm', 'run', 'preview', '--', '--host', '127.0.0.1', '--port', '3100', '--strictPort']])
  assert.equal(makeLocalEnvironment().PUBLIC_APP_URL, 'http://127.0.0.1:3100')
})

test('scheduled synthetic deliveries contain usable pickup and destination details', async () => {
  const { adminControlCenterFixtures } = await import('../../firebase-backend/functions/lib/scripts/seedAdminControlCenter.js')
  const deliveries = adminControlCenterFixtures().itemRequests.filter(row => row.id.startsWith('qa-delivery-') || ['qa-claim-ready_to_book', 'qa-claim-booked', 'qa-claim-out_for_delivery', 'qa-claim-delivered'].includes(row.id))
  assert.ok(deliveries.every(row => row.requesterAddress && row.pickupLocality && row.pickupAddressConfirmedByGiver && row.dropAddressConfirmedByClaimer))
})
