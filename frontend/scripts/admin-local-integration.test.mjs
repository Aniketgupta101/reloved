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
})
