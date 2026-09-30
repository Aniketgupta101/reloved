import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildLiveAttentionPage,
  buildLiveAnalyticsSnapshot,
  buildLiveInventoryPage,
  buildLiveOperationsPage,
  buildLiveOverview,
  buildLiveSupportPage,
} from './admin-live-readonly-data.mjs'

const now = new Date('2026-09-30T06:30:00.000Z')
const bundle = {
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
})

test('live attention is grouped from source records and failed communications', () => {
  const result = buildLiveAttentionPage(bundle, new URLSearchParams('category=all&limit=25'), { now, privacyMode: true })
  assert.ok(result.items.some((row) => row.type === 'failed_email'))
  assert.ok(result.items.some((row) => row.category === 'support'))
  assert.ok(result.items.some((row) => row.category === 'delivery'))
})

test('live analytics preserves operational charts and reports missing external reads honestly', () => {
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
  })
  assert.equal(result.sections.overview.metrics.find((metric) => metric.id === 'users').value, 21)
  assert.equal(result.sections.traffic.state, 'not_configured')
  assert.equal(result.sections.search.state, 'not_configured')
  assert.equal(result.sections.performance.lab.state, 'unavailable')
  assert.equal(result.sections.product.categories[0].label, 'Tops')
  assert.ok(result.sections.product.wallStatus.length > 0)
  assert.ok(result.sections.dataHealth.issues.some((issue) => issue.id === 'failedNotifications'))
  assert.equal(result.sections.dataHealth.integrations.find((row) => row.id === 'firestore').status, 'healthy')
  assert.equal(result.sections.dataHealth.integrations.find((row) => row.id === 'posthog').status, 'not_configured')
})
