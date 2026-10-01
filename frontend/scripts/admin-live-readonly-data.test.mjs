import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildLiveAttentionPage,
  buildLiveAnalyticsSnapshot,
  buildLiveCommunications,
  buildLiveInventoryPage,
  buildLiveOperationsPage,
  buildLiveOverview,
  buildLiveClaimFunnel,
  buildLiveDropFunnel,
  buildLiveSupportPage,
} from './admin-live-readonly-data.mjs'

const now = new Date('2026-09-30T06:30:00.000Z')
const bundle = {
  sourceCoverage: Object.fromEntries(
    ['submissions', 'items', 'requests', 'orders', 'contacts', 'support'].map((name) => [name, { state: 'complete', reason: null }]),
  ),
  analytics: {
    days: 7,
    totals: { accounts: 21, reloved: 4 },
    periodTotals: { accounts: 3, gives: 5, claims: 2 },
    claimStatus: { matched: 2 },
    series: [{ day: '2026-09-30', gives: 1, claims: 1, accounts: 1, product: {} }],
    productTotals: {},
    insights: { declines: { acceptRate: 50 } },
  },
  overview: {},
  submissions: [{
    id: 'drop-1', reference: 'RL-001', donorFirstName: 'Actual Person', email: 'actual@example.com',
    phone: '9876543210', publicArea: 'Bandra West', status: 'approved', createdAt: '2026-09-29T08:00:00.000Z',
  }],
  items: [{
    id: 'item-1', submissionId: 'drop-1', title: 'Blue shirt', category: 'Tops', size: 'M',
    status: 'approved', publicStatus: 'available', publicVisibility: true,
    images: [{ storagePath: '/images/example.webp' }], createdAt: '2026-09-29T08:05:00.000Z',
  }],
  requests: [{
    id: 'claim-1', itemId: 'item-1', itemTitle: 'Blue shirt', requesterName: 'Claiming Person',
    requesterEmail: 'claim@example.com', requesterPhone: '9123456780', requesterAddress: 'Private destination',
    requesterLatitude: 19.1, requesterLongitude: 72.8, status: 'approved', handoverStage: 'schedule_agreed',
    opsBookingStatus: 'ready_to_book', agreedSlotAt: '2026-09-30T07:00:00.000Z', createdAt: '2026-09-28T08:00:00.000Z',
  }],
  orders: [{
    id: 'claim-1', itemTitle: 'Blue shirt', itemImages: [{ storagePath: '/images/example.webp' }],
    giverName: 'Actual Person', giverPhone: '9876543210', requesterName: 'Claiming Person',
    requesterPhone: '9123456780', requesterAddress: 'Private destination', pickupLocality: 'Bandra West',
    handoverStage: 'schedule_agreed', opsBookingStatus: 'ready_to_book', deliveryStatus: 'ready_to_book',
    agreedSlotAt: '2026-09-30T07:00:00.000Z', createdAt: '2026-09-28T08:00:00.000Z',
  }],
  contacts: [{
    id: 'contact-1', name: 'Website Person', email: 'web@example.com', subject: 'Help',
    message: 'Please help me', status: 'new', createdAt: '2026-09-30T05:00:00.000Z',
  }],
  support: [{
    id: 'support-1', subjectType: 'support', subjectId: 'visitor-1', ownerName: 'Chat Person',
    ownerEmail: 'chat@example.com', lastMessagePreview: 'Need help', unreadForAdmin: true,
    lastMessageAt: '2026-09-30T05:30:00.000Z', hasMessages: true,
  }],
  notifications: new Map([
    ['claim-1', [
      { id: 'n1', channel: 'email', status: 'failed', templateKey: 'delivery', createdAt: '2026-09-30T05:45:00.000Z', error: 'provider error' },
      { id: 'n2', channel: 'sms', status: 'sent', templateKey: 'delivery', createdAt: '2026-09-30T05:46:00.000Z' },
    ]],
  ]),
}

test('live overview uses production bundle and masks private identity by default', () => {
  const result = buildLiveOverview(bundle, { range: '7d', now, privacyMode: true })
  assert.deepEqual(result.kpis.map((kpi) => [kpi.id, kpi.value]), [
    ['users', 21], ['newUsers', 3], ['drops', 5], ['claims', 2], ['matched', 2], ['completed', 4],
  ])
  assert.equal(result.deliveries.today.length, 1)
  assert.equal(result.deliveries.today[0].giverName, 'A••••• P•••••')
  assert.equal(result.deliveries.today[0].giverPhone, '••••••3210')
  assert.equal(result.deliveries.today[0].requesterAddress, 'Private location hidden for review')
  assert.equal(result.messagingFailures.length, 1)
  assert.deepEqual(buildLiveOverview(bundle, { range: '24h', now, privacyMode: true }).activity, [], '24 hour view does not relabel a seven-day event series')
})

test('live overview keeps aggregate headline metrics when detail coverage is partial', () => {
  const partial = structuredClone(bundle)
  partial.sourceCoverage.orders = { state: 'partial', reason: 'Coverage cannot be proven.' }
  partial.sourceCoverage.requests = { state: 'partial', reason: 'Coverage cannot be proven.' }
  partial.sourceCoverage.submissions = { state: 'partial', reason: 'Coverage cannot be proven.' }
  partial.sourceCoverage.items = { state: 'partial', reason: 'Coverage cannot be proven.' }
  partial.analytics.periodTotals.gives = 42
  partial.analytics.productTotals = { donation_submitted: 4, item_viewed: 9, claim_started: 5, claim_submitted: 3 }

  const overview = buildLiveOverview(partial, { range: '7d', now, privacyMode: true })
  assert.equal(overview.deliveries.state, 'partial')
  assert.equal(overview.kpis.find((metric) => metric.id === 'drops').value, 42)
  assert.equal(overview.kpis.find((metric) => metric.id === 'drops').source, 'Production analytics mirror')
  assert.equal(overview.activity[0].label, 'Drop submit events')

  const drop = buildLiveDropFunnel(partial)
  assert.equal(drop.steps.find((step) => step.id === 'submitted').value, 4)
  assert.equal(drop.steps.find((step) => step.id === 'persisted').value, null)

  const claim = buildLiveClaimFunnel(partial)
  assert.equal(claim.steps.find((step) => step.id === 'viewed').value, 9)
  assert.equal(claim.steps.find((step) => step.id === 'scheduled').value, null)
  assert.equal(claim.steps.find((step) => step.id === 'matched').value, null)
})

test('authenticated live admin mode preserves complete operational identity', () => {
  const overview = buildLiveOverview(bundle, { range: '7d', now, privacyMode: false })
  const delivery = overview.deliveries.today[0]
  assert.equal(delivery.giverName, 'Actual Person')
  assert.equal(delivery.giverPhone, '9876543210')
  assert.equal(delivery.requesterName, 'Claiming Person')
  assert.equal(delivery.requesterAddress, 'Private destination')

  const wall = buildLiveInventoryPage(bundle, 'wall', new URLSearchParams('limit=10'), { privacyMode: false })
  assert.equal(wall.items[0].dropper.email, 'actual@example.com')
  assert.equal(wall.items[0].dropper.phone, '9876543210')

  const support = buildLiveSupportPage(bundle, new URLSearchParams('view=all&limit=20'), { privacyMode: false })
  assert.ok(support.items.some((row) => row.email === 'chat@example.com'))
  assert.ok(support.items.some((row) => row.preview === 'Please help me'))
})

test('live inventory returns actual joined drops and wall items with pagination language', () => {
  const drops = buildLiveInventoryPage(bundle, 'drops', new URLSearchParams('limit=10'), { privacyMode: true })
  const wall = buildLiveInventoryPage(bundle, 'wall', new URLSearchParams('limit=10'), { privacyMode: true })
  assert.equal(drops.items.length, 1)
  assert.equal(drops.items[0].items[0].title, 'Blue shirt')
  assert.equal(wall.items.length, 1)
  assert.equal(wall.items[0].claims[0].id, 'claim-1')
  assert.equal(drops.nextCursor, null)
})

test('missing Give stages stay unavailable instead of becoming synthetic zeroes', () => {
  const result = buildLiveDropFunnel(bundle)
  assert.equal(result.steps.find((step) => step.id === 'photos').value, null)
  assert.equal(result.steps.find((step) => step.id === 'auth').value, null)
})

test('live deliveries include scheduled production orders and communication truth', () => {
  const result = buildLiveOperationsPage(bundle, 'deliveries', new URLSearchParams('view=today&limit=10'), { now, privacyMode: true })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].timing, 'scheduled')
  assert.equal(result.items[0].action.label, 'Coordinate handover')
  assert.equal(result.items[0].nextAction.label, 'Coordinate handover')
  assert.equal(result.items[0].notifications.email.latest.status, 'failed')
  assert.equal(result.items[0].notifications.sms.latest.status, 'sent')
  assert.equal(result.items[0].map.state, 'unavailable')
})

test('failed and missing notification reads remain unavailable instead of becoming authoritative empty audits', () => {
  for (const notifications of [
    new Map([['claim-1', { state: 'unavailable', events: [], reason: 'Production notification history read failed.' }]]),
    new Map(),
  ]) {
    const data = structuredClone(bundle)
    data.notifications = notifications
    const delivery = buildLiveOperationsPage(data, 'deliveries', new URLSearchParams('view=today&limit=10'), { now, privacyMode: true }).items[0]
    for (const channel of ['email', 'sms']) {
      assert.equal(delivery.notifications[channel].state, 'unavailable')
      assert.equal(delivery.notifications[channel].counts, null)
      assert.equal(delivery.notifications[channel].latest, null)
    }
    const history = buildLiveCommunications(data, 'claim-1', { privacyMode: true })
    assert.equal(history.coverage, 'unavailable')
    assert.match(history.sources[0].reason, /not read|failed/i)
    assert.deepEqual(history.items, [])
  }
})

test('bounded legacy notification history preserves attempts but suppresses exact counts and latest assertions', () => {
  const data = structuredClone(bundle)
  const events = Array.from({ length: 50 }, (_, index) => ({
    id: `n-${index}`, channel: index % 2 ? 'sms' : 'email', status: 'sent',
    createdAt: `2026-09-30T05:${String(index).padStart(2, '0')}:00.000Z`,
  }))
  data.notifications = new Map([['claim-1', { state: 'partial', events, reason: 'Legacy endpoint returns at most 50 attempts without continuation.' }]])
  const delivery = buildLiveOperationsPage(data, 'deliveries', new URLSearchParams('view=today&limit=10'), { now, privacyMode: true }).items[0]
  assert.equal(delivery.notifications.email.state, 'partial')
  assert.equal(delivery.notifications.email.counts, null)
  assert.equal(delivery.notifications.email.latest, null)
  assert.equal(delivery.notifications.email.attempts.length, 25)
  const history = buildLiveCommunications(data, 'claim-1', { privacyMode: true })
  assert.equal(history.coverage, 'partial')
  assert.equal(history.items.length, 50)
  assert.match(history.sources[0].reason, /50 attempts/i)
})

test('live operation detail preserves recorded courier state and redacts courier phone for privacy review', () => {
  const data = structuredClone(bundle)
  data.notifications = bundle.notifications
  Object.assign(data.requests[0], {
    courierBookedVia: 'shadowfax_api', shadowfaxOrderId: 'SF-1', shadowfaxAwb: 'AWB-1',
    shadowfaxTrackingUrl: 'https://track.example/SF-1', shadowfaxStatus: 'BOOKED',
    borzoCourier: { name: 'Rider Person', phone: '9876543210' },
    borzoPaidBy: 'reloved_subsidy', borzoSubsidyIndex: 9,
  })
  const detail = buildLiveOperationsPage(data, 'deliveries', new URLSearchParams('limit=10'), { now, privacyMode: true }).items[0]
  assert.equal(detail.courier.shadowfax.awb, 'AWB-1')
  assert.equal(detail.courier.payment.subsidyIndex, 9)
  assert.equal(detail.courier.borzo.courierPhone, '••••••3210')
})

test('live courier prerequisites use separate submission pincode and claim note fallback', () => {
  const data = structuredClone(bundle)
  data.notifications = bundle.notifications
  data.items[0].pickupLocality = 'Giver building'
  data.submissions[0].pincode = '400051'
  data.requests[0].requesterAddress = 'Receiver building'
  data.requests[0].note = 'PIN 400053'
  data.orders[0].requesterAddress = 'Receiver building'
  data.orders[0].note = 'PIN 400053'
  const detail = buildLiveOperationsPage(data, 'deliveries', new URLSearchParams('limit=10'), { now, privacyMode: false }).items[0]
  assert.equal(detail.courierPrerequisites.pickupPincode, '400051')
  assert.equal(detail.courierPrerequisites.dropPincode, '400053')
})

test('live attention uses recorded notification text and focused claim routes', () => {
  const page = buildLiveAttentionPage(bundle, new URLSearchParams('limit=25'), { now, privacyMode: false })
  const failure = page.items.find((item) => item.category === 'messaging')
  assert.equal(failure.recorded.error, 'provider error')
  assert.equal(failure.nextAction.href, '/admin/orders?claimId=claim-1')
  assert.equal(failure.entityLabel, 'Blue shirt')
  assert.equal(failure.actions[0].primary, true)
})

test('live delivery actions explain the next source-backed operational step', () => {
  const scheduled = structuredClone(bundle)
  scheduled.notifications = bundle.notifications
  scheduled.requests[0].giverLogistics = 'porter_arranged'
  scheduled.requests[0].pickupAddressConfirmedByGiver = true
  scheduled.requests[0].dropAddressConfirmedByClaimer = true
  scheduled.orders[0].giverLogistics = 'porter_arranged'
  scheduled.orders[0].pickupAddressConfirmedByGiver = true
  scheduled.orders[0].dropAddressConfirmedByClaimer = true
  const ready = buildLiveOperationsPage(scheduled, 'deliveries', new URLSearchParams('view=today&limit=10'), { now, privacyMode: true })
  assert.equal(ready.items[0].action.label, 'Confirm courier arranged offline')

  const unscheduled = structuredClone(bundle)
  unscheduled.notifications = bundle.notifications
  delete unscheduled.requests[0].agreedSlotAt
  delete unscheduled.orders[0].agreedSlotAt
  const waiting = buildLiveOperationsPage(unscheduled, 'deliveries', new URLSearchParams('view=unscheduled&limit=10'), { now, privacyMode: true })
  assert.equal(waiting.items[0].action.label, 'Coordinate schedule')
})

test('live support combines actual chat and contact sources without fixture fallback', () => {
  const result = buildLiveSupportPage(bundle, new URLSearchParams('view=all&limit=20'), { privacyMode: true })
  assert.equal(result.items.length, 2)
  assert.deepEqual(new Set(result.items.map((row) => row.source)), new Set(['ask_reloved', 'contact_form']))
  assert.ok(result.items.every((row) => !row.email || row.email.includes('•••')))
  assert.ok(result.items.every((row) => row.preview === 'Message hidden for privacy review.'))
  assert.ok(result.items.every((row) => !row.preview.includes('Please help me')))
})

test('privacy review redacts free text and coarsens recorded coordinates', () => {
  const privateBundle = structuredClone(bundle)
  privateBundle.notifications = new Map([['claim-1', [{
    id: 'private-notification', channel: 'email', status: 'failed',
    createdAt: '2026-09-30T05:45:00.000Z', error: 'Call 9876543210 at exact address',
    subject: 'Exact private subject', previewBody: 'Private full message body',
  }]]])
  privateBundle.submissions[0].latitude = 19.123456
  privateBundle.submissions[0].longitude = 72.987654
  privateBundle.requests[0].requesterLatitude = 19.234567
  privateBundle.requests[0].requesterLongitude = 72.876543
  privateBundle.requests[0].note = 'Call 9876543210 at exact address'
  privateBundle.orders[0].opsNote = 'Meet beside the private doorway'
  const delivery = buildLiveOperationsPage(privateBundle, 'deliveries', new URLSearchParams('view=today&limit=10'), { now, privacyMode: true }).items[0]
  assert.deepEqual(delivery.map.pickup, { latitude: 19.12, longitude: 72.99 })
  assert.deepEqual(delivery.map.destination, { latitude: 19.23, longitude: 72.88 })
  assert.equal(delivery.note, 'Private note hidden for review.')
  assert.equal(delivery.opsNote, 'Private note hidden for review.')
  assert.equal(delivery.notifications.email.latest.error, 'Provider failure recorded; details hidden for review.')
})

test('live attention is grouped from source records and failed communications', () => {
  const result = buildLiveAttentionPage(bundle, new URLSearchParams('category=all&limit=25'), { now, privacyMode: true })
  assert.ok(result.items.some((row) => row.type === 'failed_email'))
  assert.ok(result.items.some((row) => row.category === 'support'))
  assert.ok(result.items.some((row) => row.category === 'delivery'))
})

test('live analytics preserves complete operational charts while external behavior reads remain unavailable', () => {
  bundle.analytics.giveFunnel = { started: 5, submitted: 4, on_wall: 3, reloved: 1 }
  bundle.analytics.claimFunnel = { item_viewed: 12, claim_started: 4, claim_submitted: 2, matched: 2, reloved: 1 }
  bundle.analytics.itemStatus = { available: 8, being_matched: 2, claimed: 1, reloved: 4, other: 0 }
  bundle.analytics.insights = {
    declines: { acceptRate: 50 },
    speed: { medianMatchHours: 6, matchSampleSize: 2, medianReloveHours: 48, reloveSampleSize: 1 },
    supplyDemand: [{ label: 'Tops', given: 8, claimed: 2 }],
    byGender: { supply: [{ label: 'Women', count: 5 }], demand: [{ label: 'Women', count: 2 }] },
    topAreas: { gives: [{ label: 'Bandra West', count: 5 }], claims: [{ label: 'Andheri West', count: 2 }] },
  }
  const result = buildLiveAnalyticsSnapshot(bundle, '7d', {
    now,
    capabilities: { posthog: false, searchConsole: false, ga4: false, crux: false, pageSpeed: false },
    pageSpeed: { state: 'unavailable', message: 'PageSpeed quota unavailable.', devices: [] },
    bundles: { totalBytes: 1_200_000, jsBytes: 1_000_000, assets: [{ name: 'app.js', bytes: 1_000_000 }] },
    integrationStatuses: {
      edesy: { configured: true },
      borzo: { configured: true, mode: 'api' },
      shiprocket: { configured: true, walletReady: true },
      shadowfax: { configured: false },
      templates: { templates: [{ channel: 'email', brevoTemplateId: 'configured' }, { channel: 'sms', msg91TemplateId: 'configured' }] },
    },
  })
  assert.equal(result.sections.overview.metrics.find((metric) => metric.id === 'users').value, 21)
  assert.equal(result.sections.overview.metrics.find((metric) => metric.id === 'matched').value, 2)
  assert.equal(result.sections.traffic.state, 'not_configured')
  assert.equal(result.sections.search.state, 'not_configured')
  assert.equal(result.sections.performance.lab.state, 'unavailable')
  assert.deepEqual(result.sections.product.categories, [{ id: 'tops', label: 'Tops', supply: 8, demand: 2 }])
  assert.ok(result.sections.product.wallStatus.some((row) => row.id === 'available' && row.value === 8))
  assert.ok(result.sections.dataHealth.issues.some((issue) => issue.id === 'failedNotifications'))
  assert.equal(result.sections.dataHealth.integrations.find((row) => row.id === 'firestore').status, 'healthy')
  assert.equal(result.sections.dataHealth.integrations.find((row) => row.id === 'posthog').status, 'not_configured')
  assert.equal(result.sections.dataHealth.integrations.find((row) => row.id === 'edesy').status, 'healthy')
  assert.equal(result.sections.dataHealth.integrations.find((row) => row.id === 'borzo').status, 'healthy')
  assert.equal(result.sections.dataHealth.integrations.find((row) => row.id === 'shiprocket').status, 'healthy')
  assert.equal(result.sections.dataHealth.integrations.find((row) => row.id === 'shadowfax').status, 'not_configured')
})

test('unproven collection coverage suppresses entity totals but preserves daily event charts', () => {
  const bounded = structuredClone(bundle)
  bounded.submissions = Array.from({ length: 200 }, (_, index) => ({
    id: `drop-${index}`,
    createdAt: '2026-09-29T08:00:00.000Z',
  }))
  bounded.sourceCoverage.submissions = { state: 'partial', reason: 'The deployed endpoint reached its read limit.' }
  bounded.analytics.series = [{ day: '2026-09-30', product: { donation_submitted: 4, claim_submitted: 2 } }]
  bounded.analytics.productTotals = { donation_submitted: 4, claim_submitted: 2 }
  const result = buildLiveAnalyticsSnapshot(bounded, '14d', { now, capabilities: { brevo: true, msg91: true } })
  assert.equal(result.range, '14d')
  assert.equal(result.sections.product.state, 'partial')
  assert.equal(result.sections.product.categories.length, 0)
  assert.ok(result.sections.product.metrics.every(metric => metric.value === null))
  assert.ok(result.sections.dataHealth.issues.every(issue => issue.count === null))
  assert.ok(result.sections.overview.activity.some(series => series.points.some(point => point.value !== null)))
  assert.equal(result.sections.overview.metrics.find(metric => metric.id === 'drops').value, null)
  assert.equal(result.sections.funnels.drop.steps.find(step => step.id === 'submitted').value, 4)
  assert.equal(result.sections.funnels.drop.steps.find(step => step.id === 'persisted').value, null)
  assert.match(result.sections.dataHealth.integrations.find(row => row.id === 'firestore').detail, /cannot be proven/i)
  assert.doesNotMatch(result.sections.dataHealth.integrations.find(row => row.id === 'firestore').detail, /reached/i)
  assert.notEqual(result.sections.dataHealth.integrations.find(row => row.id === 'brevo').status, 'healthy')
})

test('live selected and comparison periods publish the exact UTC analytics mirror window', () => {
  const snapshotTime = new Date('2026-09-30T20:00:00Z') // October 1, 01:30 IST
  for (const [range, from, previousFrom, previousTo] of [
    ['7d', '2026-09-24', '2026-09-17', '2026-09-23'],
    ['14d', '2026-09-17', '2026-09-03', '2026-09-16'],
    ['30d', '2026-09-01', '2026-08-02', '2026-08-31'],
  ]) {
    const result = buildLiveAnalyticsSnapshot({ analytics: { range: { from, to: '2026-09-30' } } }, range, { now: snapshotTime })
    assert.deepEqual(result.period, { from, to: '2026-09-30', previousFrom, previousTo })
    assert.equal(result.asOf, snapshotTime.toISOString())
    assert.equal(result.timezone, 'UTC')
  }
})
