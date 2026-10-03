import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeLocalEnvironment } from './admin-local-harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const waitFor = async (condition, process, label) => {
  for (let i = 0; i < 150; i++) {
    if (condition()) return
    if (process.exitCode !== null) throw new Error(label + ' exited: ' + process.exitCode)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(label + ' did not become ready')
}

test('seeded admin API exposes dates, people, delivery timing and notification details', { timeout: 90_000 }, async (t) => {
  assert.ok(process.env.JAVA_HOME, 'Set JAVA_HOME to JDK/JRE 21+ for integration test')
  const env = makeLocalEnvironment()
  const emu = spawn('firebase', ['emulators:start', '--only', 'firestore,auth,storage', '--project', 'demo-reloved-admin'], {
    cwd: resolve(root, 'firebase-backend'), env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => emu.kill('SIGTERM'))
  let emulatorOutput = ''
  emu.stdout.on('data', (data) => { emulatorOutput += data })
  emu.stderr.on('data', (data) => { emulatorOutput += data })
  await waitFor(() => emulatorOutput.includes('All emulators ready'), emu, 'demo emulators')

  const seed = spawnSync(process.execPath, ['scripts/admin-local-seed.mjs'], {
    cwd: resolve(root, 'frontend'), env, encoding: 'utf8',
  })
  assert.equal(seed.status, 0, seed.stderr)

  const api = spawn(process.execPath, ['scripts/admin-local-api.mjs'], {
    cwd: resolve(root, 'frontend'), env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => api.kill('SIGTERM'))
  let apiOutput = ''
  api.stdout.on('data', (data) => { apiOutput += data })
  api.stderr.on('data', (data) => { apiOutput += data })
  await waitFor(() => apiOutput.includes('Synthetic API:'), api, 'local API')

  const login = await fetch('http://127.0.0.1:8787/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@synthetic.invalid', password: 'synthetic-local-admin' }),
  })
  assert.equal(login.status, 200)
  const { token } = await login.json()
  const read = async (path) => {
    const response = await fetch('http://127.0.0.1:8787/api/admin/' + path, { headers: { Authorization: 'Bearer ' + token } })
    assert.equal(response.status, 200, path + ': ' + await response.clone().text())
    return response.json()
  }

  const center = await read('control-center/overview?range=7d')
  assert.equal(center.timezone, 'Asia/Kolkata')
  assert.equal(center.coverage, 'complete')
  assert.ok(center.sources.every((source) => source.state === 'complete' && source.limit === 50))
  assert.equal(center.kpis.find((k) => k.id === 'users').value, 6)
  assert.equal(center.kpis.find((k) => k.id === 'activeUsers').value, null)
  const centerToday = center.deliveries.today.find((row) => row.id === 'qa-delivery-today')
  assert.ok(centerToday)
  assert.equal(centerToday.giverName, 'Synthetic')
  assert.deepEqual(centerToday.notifications.sms.counts, { sent: 1, failed: 1, skipped: 1 })
  assert.ok(center.deliveries.undated.some((row) => row.id === 'qa-claim-awaiting_schedule'))
  const seen = new Set()
  let cursor = null
  let firstPage
  do {
    const page = await read('control-center/attention?limit=3' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''))
    firstPage ??= page
    assert.equal(page.coverage, 'complete')
    for (const item of page.items) {
      assert.ok(!seen.has(item.id), 'attention cursor must not duplicate rows')
      seen.add(item.id)
    }
    cursor = page.nextCursor
    assert.ok(seen.size < 100, 'pagination must terminate')
  } while (cursor)
  assert.equal(firstPage.items[0].severity, 'critical')
  assert.ok([...seen].some((id) => id.includes('qa-delivery-overdue:overdue_delivery')))
  assert.ok([...seen].some((id) => id.includes('qa-thread-unread:unread_support')))
  const messaging = await read('control-center/attention?category=messaging')
  assert.equal(messaging.items.length, 3)
  assert.ok(messaging.items.every((row) => row.category === 'messaging'))
  for (const path of ['overview?range=invalid', 'attention?limit=501', 'attention?cursor=broken']) {
    const response = await fetch('http://127.0.0.1:8787/api/admin/control-center/' + path, { headers: { Authorization: 'Bearer ' + token } })
    assert.equal(response.status, 400)
  }
  const anonymous = await fetch('http://127.0.0.1:8787/api/admin/control-center/overview')
  assert.equal(anonymous.status, 401)

  const overview = await read('overview')
  const today = overview.todayDeliveries.find((row) => row.id === 'qa-delivery-today')
  assert.ok(today, 'today delivery appears')
  assert.ok(today.createdAt && today.updatedAt && today.agreedSlotAt)
  assert.equal(today.requesterName, 'Synthetic Claimer')
  assert.equal(today.giverName, 'Synthetic Dropper')
  assert.ok(overview.pendingDrops.some((row) => row.id === 'qa-drop-submitted' && row.createdAt && row.donorFirstName === 'Synthetic'))

  const { orders } = await read('orders')
  const byId = (name) => orders.find((row) => row.id === 'qa-delivery-' + name)
  for (const name of ['today', 'within-hour', 'overdue', 'tomorrow', 'completed']) assert.ok(byId(name), name)
  assert.ok(new Date(byId('within-hour').agreedSlotAt).getTime() > Date.now())
  assert.ok(new Date(byId('within-hour').agreedSlotAt).getTime() - Date.now() < 3_600_000)
  assert.ok(new Date(byId('overdue').agreedSlotAt).getTime() < Date.now())
  const ist = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  assert.notEqual(ist(byId('tomorrow').agreedSlotAt), ist(Date.now()))
  assert.ok(byId('today').createdAt && byId('today').giverEmail && byId('today').requesterEmail)
  assert.equal(byId('today').notificationSummary.count, 5)
  assert.ok(byId('today').notificationSummary.lastAt)

  const { events } = await read('orders/qa-delivery-today/notifications')
  assert.equal(events.length, 5)
  assert.ok(events.every((row) => row.createdAt && row.templateKey && row.to && row.audience && row.subject && row.previewBody))
  const { submissions } = await read('submissions')
  assert.ok(submissions.some((row) => row.id === 'qa-drop-submitted' && row.submittedAt && row.donorTarget && row.email))
  const { requests } = await read('item-requests')
  assert.ok(requests.some((row) => row.id === 'qa-claim-pending' && row.createdAt && row.requesterTarget && row.requesterName))
  assert.deepEqual(new Set(requests.filter((row) => row.id.startsWith('qa-delivery-')).map((row) => row.giverLogistics)), new Set(['porter_arranged', 'giver_sends', 'receiver_collects']))

  // A real claimer on a tester-owned item must not inflate production KPIs.
  const eligibilitySeed = spawnSync(process.execPath, ['-e', `
    if (process.env.GCLOUD_PROJECT !== 'demo-reloved-admin' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Demo emulator only');
    const { getDb } = require('./lib/lib/firestore.js');
    (async () => {
      const db = getDb(), batch = db.batch(), createdAt = new Date();
      batch.set(db.collection('donorProfiles').doc('qa-tester-profile'), { displayName: 'relovedtotem', email: 'qa-tester@synthetic.invalid', target: 'opaque-synthetic-tester', createdAt });
      batch.set(db.collection('items').doc('qa-tester-owned-item'), { donorId: 'qa-tester-profile', createdAt });
      batch.set(db.collection('donationSubmissions').doc('qa-tester-drop'), { donorTarget: 'opaque-synthetic-tester', createdAt });
      batch.set(db.collection('itemRequests').doc('qa-real-claim-tester-item'), { itemId: 'qa-tester-owned-item', requesterTarget: 'real@synthetic.invalid', status: 'pending', createdAt });
      batch.set(db.collection('itemRequests').doc('qa-tester-target-claim'), { itemId: 'qa-item-claimed', requesterTarget: 'opaque-synthetic-tester', status: 'pending', createdAt });
      batch.set(db.collection('contactMessages').doc('qa-contact-open'), { status: 'actioned' }, { merge: true });
      batch.set(db.collection('itemRequests').doc('qa-address-review'), { status: 'approved', giverLogistics: 'porter_arranged', handoverStage: 'awaiting_address_confirm', pickupAddressConfirmedByGiver: false, dropAddressConfirmedByClaimer: false, requesterAddress: 'Synthetic receiver address', pickupLocality: 'Synthetic private pickup', createdAt });
      await batch.commit();
    })().catch(error => { console.error(error); process.exitCode = 1 });
  `], { cwd: resolve(root, 'firebase-backend/functions'), env, encoding: 'utf8' })
  assert.equal(eligibilitySeed.status, 0, eligibilitySeed.stderr)
  const eligible = await read('control-center/overview?range=7d')
  assert.equal(eligible.kpis.find(k => k.id === 'users').value, center.kpis.find(k => k.id === 'users').value)
  assert.equal(eligible.kpis.find(k => k.id === 'drops').value, center.kpis.find(k => k.id === 'drops').value)
  assert.equal(eligible.kpis.find(k => k.id === 'claims').value, center.kpis.find(k => k.id === 'claims').value + 1, 'only the real address-review claim is added')
  const addressReview = eligible.waitingOnPeople.find(row => row.entity.id === 'qa-address-review')
  assert.equal(addressReview.type, 'pickup_address_unconfirmed')
  assert.match(addressReview.nextAction.label, /giver/i)
  assert.equal(eligible.deliveries.undated.find(row => row.id === 'qa-address-review').pickupAddress, 'Synthetic private pickup')
  assert.ok(!(await read('control-center/attention?category=support')).items.some(row => row.entity.id === 'qa-contact-open'))

  // Deliberately exceed a read budget and add legacy records with no timestamp.
  const edgeSeed = spawnSync(process.execPath, ['-e', `
    if (process.env.GCLOUD_PROJECT !== 'demo-reloved-admin' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Demo emulator only');
    const { getDb } = require('./lib/lib/firestore.js');
    (async () => {
      const db = getDb();
      for (let offset = 0; offset < 501; offset += 400) {
        const batch = db.batch();
        for (let i = offset; i < Math.min(offset + 400, 501); i++) batch.set(db.collection('donorProfiles').doc('qa-cap-' + String(i).padStart(4, '0')), { email: 'cap-' + i + '@synthetic.invalid' });
        await batch.commit();
      }
      await db.collection('itemRequests').doc('qa-undated-claim').set({ status: 'pending', requesterName: 'Synthetic Undated' });
      await db.collection('notificationEvents').doc('qa-undated-notification').set({ claimId: 'qa-delivery-today', channel: 'sms', status: 'failed' });
    })().catch(error => { console.error(error); process.exitCode = 1 });
  `], { cwd: resolve(root, 'firebase-backend/functions'), env, encoding: 'utf8' })
  assert.equal(edgeSeed.status, 0, edgeSeed.stderr)
  const incomplete = await read('control-center/overview?range=7d')
  assert.equal(incomplete.coverage, 'partial')
  assert.equal(incomplete.sources.find((s) => s.source === 'donorProfiles').scanned, 0)
  assert.equal(incomplete.kpis.find((k) => k.id === 'users').value, null)
  assert.equal(incomplete.kpis.find((k) => k.id === 'claims').value, null)
  const undatedAttention = await read('control-center/attention?category=claims&limit=100')
  assert.ok(undatedAttention.items.some((row) => row.entity.id === 'qa-undated-claim' && row.occurredAt === null))
  const undatedSms = incomplete.deliveries.today.find((row) => row.id === 'qa-delivery-today').notifications.sms
  assert.equal(undatedSms.latest, null, 'an undated attempt prevents asserting the latest attempt')
  assert.equal(undatedSms.counts.failed, 2)
  const claimOverflow = spawnSync(process.execPath, ['-e', `
    if (process.env.GCLOUD_PROJECT !== 'demo-reloved-admin' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Demo emulator only');
    const { getDb } = require('./lib/lib/firestore.js');
    (async () => {
      const db = getDb(), batch = db.batch();
      for (let i = 0; i < 51; i++) batch.set(db.collection('itemRequests').doc('aa-qa-old-' + i), { status: 'cancelled' });
      await batch.commit();
    })().catch(error => { console.error(error); process.exitCode = 1 });
  `], { cwd: resolve(root, 'firebase-backend/functions'), env, encoding: 'utf8' })
  assert.equal(claimOverflow.status, 0, claimOverflow.stderr)
  const scheduledBeyondCap = await read('control-center/overview')
  assert.ok(scheduledBeyondCap.deliveries.today.some(row => row.id === 'qa-delivery-today'), 'time-bounded schedule must find today beyond the generic document window')
  assert.equal(scheduledBeyondCap.sources.find(s => s.source === 'itemRequests').state, 'partial')
  assert.equal((await read('control-center/attention')).coverage, 'partial')
  const emptyWindow = await read('control-center/attention?category=delivery&limit=2')
  assert.deepEqual(emptyWindow.items, [])
  assert.ok(emptyWindow.nextCursor, 'empty filtered page must continue the source scan')
  const continuedIds = new Set()
  let continuation = emptyWindow.nextCursor
  let continuedPages = 0
  while (continuation) {
    const page = await read('control-center/attention?category=delivery&limit=2&cursor=' + encodeURIComponent(continuation))
    for (const row of page.items) { assert.ok(!continuedIds.has(row.id)); continuedIds.add(row.id) }
    continuation = page.nextCursor
    assert.ok(++continuedPages < 20, 'continued source pagination must terminate')
  }
  assert.ok([...continuedIds].some(id => id.includes('qa-delivery-overdue:overdue_delivery')), 'overdue delivery after 51 cancelled claims must be reachable')



})
