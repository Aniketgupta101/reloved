import assert from 'node:assert/strict'
import { test } from 'node:test'
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
})
