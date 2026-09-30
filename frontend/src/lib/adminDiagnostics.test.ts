import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diagnosticRoute, getAdminDiagnostics, recordAdminRequest } from './adminDiagnostics'

test('admin diagnostics removes record identifiers and query values', () => {
  assert.equal(
    diagnosticRoute('/api/admin/control-center/deliveries/private-claim-id?range=7d&cursor=secret'),
    '/api/admin/control-center/deliveries/:id?cursor&range',
  )
  for (const route of [
    '/api/admin/submissions/private-drop-id',
    '/api/admin/items/private-item-id',
    '/api/admin/item-requests/private-claim-id',
    '/api/admin/contact-messages/private-contact-id',
    '/api/admin/support-chats/private-thread-id/messages',
  ]) {
    assert.doesNotMatch(diagnosticRoute(route), /private-/)
    assert.match(diagnosticRoute(route), /:id/)
  }
})

test('admin diagnostics records timings without exposing sensitive error text', () => {
  recordAdminRequest({
    path: '/api/admin/control-center/drops/private-id',
    method: 'GET',
    status: 502,
    durationMs: 1234.4,
    error: 'Failed for actual@example.com and 9876543210',
  })
  const entry = getAdminDiagnostics().requests[0]
  assert.equal(entry.route, '/api/admin/control-center/drops/:id')
  assert.equal(entry.durationMs, 1234)
  assert.equal(entry.error, 'Request failed with HTTP 502.')
  assert.doesNotMatch(entry.error || '', /actual@example|9876543210/)
})
