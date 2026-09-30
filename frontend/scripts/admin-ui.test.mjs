import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const root = new URL('../', import.meta.url)
async function component(path, importMetaEnv = { VITE_DEV_ADMIN_BYPASS: 'true' }) {
  await mkdir(new URL('qa-artifacts/admin-control-center/test-modules', root), {
    recursive: true,
  })
  const outfile = fileURLToPath(
    new URL(
      'qa-artifacts/admin-control-center/test-modules/' +
        path.split('/').at(-1) +
        '.mjs',
      root,
    ),
  )
  await build({
    entryPoints: [fileURLToPath(new URL(path, root))],
    outfile,
    bundle: true,
    packages: 'external',
    format: 'esm',
    platform: 'node',
    loader: { '.css': 'empty' },
    define: {
      'import.meta.env': JSON.stringify(importMetaEnv),
    },
    logLevel: 'silent',
  })
  return import(outfile)
}
const render = (Element, props = {}) =>
  renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/admin'] },
      React.createElement(Element, props),
    ),
  )

test('shell exposes all primary and real secondary routes, accessible mobile menu and skip link', async () => {
  const { AdminLayout } = await component(
    'src/components/layout/AdminLayout.tsx',
  )
  const html = render(AdminLayout)
  for (const label of [
    'Overview',
    'Notifications',
    'Drops',
    'Wall',
    'Claims',
    'Deliveries',
    'Support',
    'Analytics',
    'Automations',
    'Bulk upload',
    'Partner applications',
    'Waitlist',
    'Peer chats',
  ])
    assert.ok(html.includes(label), label)
  assert.match(html, /aria-controls="admin-navigation"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /href="#admin-main"/)
  assert.match(html, /aria-current="page"/)
})

test('new routes are registered under authenticated admin layout and secondary routes remain', async () => {
  const source = await readFile(new URL('src/App.tsx', root), 'utf8')
  for (const route of [
    'notifications',
    'automations',
    'bulk-upload',
    'partners',
    'needs',
    'allocations',
    'peer-chats',
    'waitlist',
  ])
    assert.ok(source.includes('path="/admin/' + route + '"'), route)
})

test('overview retains the existing Wall reconciliation action and blocks it in live review', async () => {
  const source = await readFile(new URL('src/pages/admin/AdminDashboard.tsx', root), 'utf8')
  assert.match(source, /\/api\/admin\/sync-wall-statuses/)
  assert.match(source, /Sync Wall statuses · Read-only/)
  assert.match(source, /disabled=\{ADMIN_LIVE_READ_ONLY \|\| syncing \|\| resource\.refreshing\}/)
})

test('overview attention routes expose focused contact and courier actions without duplicating backend actions', async () => {
  const { AttentionActions } = await component(
    'src/components/admin/AdminOverviewContent.tsx',
  )
  const delivery = {
    id: 'delivery-attention',
    category: 'deliveries',
    severity: 'critical',
    type: 'overdue_delivery',
    title: 'Delivery is overdue',
    description: 'Operator follow-up is required.',
    entity: { type: 'claim', id: 'claim-1' },
    occurredAt: '2026-09-30T10:00:00Z',
    dueAt: '2026-09-30T09:00:00Z',
    nextAction: {
      label: 'Open delivery',
      href: '/admin/orders?claimId=claim-1',
    },
    actions: [
      {
        label: 'Open delivery',
        href: '/admin/orders?claimId=claim-1',
        kind: 'view',
        primary: true,
      },
      {
        label: 'Contact people',
        href: '/admin/orders?claimId=claim-1#masked-calls',
        kind: 'view',
      },
    ],
  }
  const html = render(AttentionActions, { item: delivery })
  assert.equal((html.match(/Contact people/g) || []).length, 1)
  assert.match(html, /href="\/admin\/orders\?claimId=claim-1#courier-operations"/)
  assert.match(html, /Courier actions/)

  const claim = {
    ...delivery,
    id: 'claim-attention',
    category: 'claims',
    type: 'pending_claim',
    nextAction: {
      label: 'Open claim',
      href: '/admin/item-requests?claimId=claim-1',
    },
    actions: [],
  }
  const claimHtml = render(AttentionActions, { item: claim })
  assert.match(claimHtml, /href="\/admin\/item-requests\?claimId=claim-1#masked-calls"/)
  assert.doesNotMatch(claimHtml, /Courier actions/)
})

test('notification category filters retain critical items from that category', async () => {
  const { notificationGroupFor, notificationMatchesFilter } = await component(
    'src/pages/admin/AdminNotifications.tsx',
  )
  const criticalMessage = {
    id: 'failed-email',
    category: 'messaging',
    severity: 'critical',
    type: 'failed_email',
    title: 'Email delivery failed',
    description: 'Recorded failure',
    entity: { type: 'claim', id: 'claim-1' },
    occurredAt: '2026-09-30T10:00:00Z',
    dueAt: null,
    nextAction: { label: 'Open delivery', href: '/admin/orders' },
  }
  assert.equal(notificationGroupFor(criticalMessage), 'urgent')
  assert.equal(notificationMatchesFilter(criticalMessage, 'urgent'), true)
  assert.equal(notificationMatchesFilter(criticalMessage, 'messaging'), true)
  assert.equal(notificationMatchesFilter(criticalMessage, 'claims'), false)
})

test('courier controls use provider-specific routes and disable unready or duplicate bookings', async () => {
  const { courierCommands, executeCourierCommand, safeTrackingUrl } = await component('src/lib/adminCourierActions.ts')
  const base = { id: 'claim-1', claimStatus: 'approved', logistics: 'porter_arranged', opsBookingStatus: 'ready_to_book', deliveryStatus: null, handoverStage: 'schedule_agreed', courierPrerequisites: { pickupAddress: 'Mumbai building', dropAddress: 'Mumbai building', pickupPincode: '400001', dropPincode: '400002', state: 'complete' }, pickupAddress: 'Mumbai building', requesterAddress: 'Mumbai building', courier: {
    bookedVia: null, borzo: { orderId: null, status: null }, shiprocket: { orderId: null, status: null }, shadowfax: { orderId: null, status: null }, payment: { paidBy: null },
  } }
  const ready = { borzo: { configured: true }, shiprocket: { configured: true, walletReady: true }, shadowfax: { configured: true } }
  const commands = courierCommands(base, ready)
  assert.equal(commands.find((a) => a.id === 'borzo_book').path, '/api/admin/item-requests/claim-1/borzo/book')
  assert.equal(commands.find((a) => a.id === 'shiprocket_book').available, true)
  assert.equal(commands.find((a) => a.id === 'shadowfax_book').available, true)
  assert.equal(courierCommands(base, { borzo: { configured: false } }).find((a) => a.id === 'borzo_book').available, false)
  const booked = structuredClone(base)
  booked.courier.borzo.orderId = 'B-1'
  assert.equal(courierCommands(booked, ready).find((a) => a.id === 'shiprocket_book').available, false)
  assert.equal(courierCommands(booked, ready).find((a) => a.id === 'borzo_cancel').available, true)
  const manual = structuredClone(base)
  manual.courier.bookedVia = 'porter_manual'
  assert.equal(courierCommands(manual, ready).find((a) => a.id === 'borzo_book').available, false)
  assert.equal(courierCommands(manual, ready).find((a) => a.id === 'porter_payment').available, true)
  const selfPickup = structuredClone(base)
  selfPickup.logistics = 'receiver_collects'
  assert.equal(courierCommands(selfPickup, ready).find((a) => a.id === 'borzo_book').available, false)
  assert.equal(courierCommands(selfPickup, ready).find((a) => a.id === 'porter_payment').available, false)
  assert.equal(safeTrackingUrl('javascript:alert(1)'), null)
  assert.equal(safeTrackingUrl('https://track.example/order'), 'https://track.example/order')
  for (const opsBookingStatus of ['booked', 'out_for_delivery', 'delivered']) {
    const manualStage = { ...base, opsBookingStatus }
    for (const provider of ['borzo', 'shiprocket', 'shadowfax'])
      assert.equal(courierCommands(manualStage, ready).find((a) => a.id === `${provider}_book`).available, false)
    assert.equal(courierCommands(manualStage, ready).find((a) => a.id === 'porter_payment').available, true)
  }
  const terminal = { ...base, deliveryStatus: 'delivered' }
  assert.equal(courierCommands(terminal, ready).find((a) => a.id === 'borzo_book').available, false)
  const lowWallet = { ...ready, shiprocket: { configured: true, walletReady: false } }
  assert.equal(courierCommands(base, lowWallet).find((a) => a.id === 'shiprocket_estimate').available, true)
  assert.equal(courierCommands(base, lowWallet).find((a) => a.id === 'shiprocket_book').available, false)
  const activeShiprocket = structuredClone(base)
  activeShiprocket.courier.shiprocket.orderId = 'SR-1'
  assert.equal(courierCommands(activeShiprocket, lowWallet).find((a) => a.id === 'shiprocket_cancel').available, true)
  const canceledShadowfax = structuredClone(base)
  canceledShadowfax.opsBookingStatus = 'booked'
  canceledShadowfax.deliveryStatus = 'rider_dispatched'
  canceledShadowfax.handoverStage = 'awaiting_handover'
  canceledShadowfax.courier.bookedVia = 'shadowfax_api'
  canceledShadowfax.courier.shadowfax.orderId = 'SFX-1'
  canceledShadowfax.courier.shadowfax.status = 'CANCELED'
  assert.equal(
    courierCommands(canceledShadowfax, ready).find((a) => a.id === 'shadowfax_book').available,
    true,
    'a confirmed provider cancellation must make the explicit cancel-then-book path usable',
  )
  canceledShadowfax.deliveryStatus = 'picked_up'
  assert.equal(
    courierCommands(canceledShadowfax, ready).find((a) => a.id === 'shadowfax_book').available,
    false,
    'a picked-up delivery remains irreversible even if provider status later says canceled',
  )
  const embeddedOnly = { ...base, pickupAddress: 'Mumbai building', requesterAddress: 'Another building' }
  assert.equal(courierCommands(embeddedOnly, ready).find((a) => a.id === 'shiprocket_book').available, true)
  const displayOnlyPincodes = {
    ...base,
    pickupAddress: 'Mumbai 400001',
    requesterAddress: 'Mumbai 400002',
    courierPrerequisites: { ...base.courierPrerequisites, pickupPincode: null, dropPincode: null, state: 'partial' },
  }
  assert.equal(courierCommands(displayOnlyPincodes, ready).find((a) => a.id === 'shiprocket_book').available, false)
  const refreshed = structuredClone(base)
  refreshed.courier.shiprocket.orderId = 'SR-after-refresh'
  refreshed.courier.shiprocket.status = 'BOOKED'
  const posts = []
  const outcome = await executeCourierCommand('borzo_book', base, ready, {
    getLatest: async () => refreshed,
    post: async (path) => { posts.push(path); return { ok: true } },
  })
  assert.equal(outcome.status, 'blocked')
  assert.deepEqual(posts, [], 'cross-provider refresh must never issue a second booking POST')
  const cancelA = structuredClone(base)
  cancelA.courier.shadowfax.orderId = 'SFX-A'
  cancelA.courier.shadowfax.status = 'BOOKED'
  const cancelB = structuredClone(cancelA)
  cancelB.courier.shadowfax.orderId = 'SFX-B'
  const cancelPosts = []
  const staleCancel = await executeCourierCommand('shadowfax_cancel', cancelA, ready, {
    getLatest: async () => cancelB,
    post: async (path) => { cancelPosts.push(path); return { ok: true } },
  })
  assert.equal(staleCancel.status, 'blocked')
  assert.deepEqual(cancelPosts, [], 'a confirmation for provider order A must never cancel replacement order B')

  for (const [commandId, provider, identity] of [
    ['borzo_sync', 'borzo', 'B-1'],
    ['borzo_cancel', 'borzo', 'B-1'],
    ['shiprocket_cancel', 'shiprocket', 'SR-1'],
    ['shadowfax_cancel', 'shadowfax', 'AWB-1'],
  ]) {
    const current = structuredClone(base)
    current.courier[provider].orderId = identity
    current.courier[provider].status = 'BOOKED'
    if (provider === 'shadowfax') {
      current.courier.shadowfax.orderId = 'SFX-1'
      current.courier.shadowfax.awb = identity
    }
    const writes = []
    const completed = await executeCourierCommand(commandId, current, ready, {
      getLatest: async () => structuredClone(current),
      post: async (path, body) => { writes.push({ path, body }); return { ok: true } },
    })
    assert.equal(completed.status, 'complete')
    assert.deepEqual(writes[0].body, { expectedProviderIdentity: identity })
  }
})

test('focused contact and courier links scroll and focus the loaded detail section', async () => {
  const { focusOperationHash } = await component('src/components/admin/InventoryClaimFocusPanel.tsx')
  const effects = []
  const node = { focus: () => effects.push('focus'), scrollIntoView: () => effects.push('scroll') }
  const root = { getElementById: (id) => id === 'courier-operations' ? node : null }
  assert.equal(focusOperationHash('#courier-operations', root), true)
  assert.deepEqual(effects, ['focus', 'scroll'])
  assert.equal(focusOperationHash('#unexpected', root), false)
})

test('same-ID refreshed courier detail invalidates the open booking confirmation', async () => {
  const { pendingCourierCommand } = await component('src/components/admin/CourierOperations.tsx')
  const detail = {
    id: 'same-claim', claimStatus: 'approved', logistics: 'porter_arranged',
    opsBookingStatus: 'ready_to_book', deliveryStatus: null, handoverStage: 'schedule_agreed',
    courierPrerequisites: { pickupAddress: 'Pickup', dropAddress: 'Drop', pickupPincode: '400001', dropPincode: '400002', state: 'complete' },
    courier: { bookedVia: null, borzo: { orderId: null, status: null }, shiprocket: { orderId: null, status: null }, shadowfax: { orderId: null, status: null }, payment: { paidBy: null } },
  }
  const statuses = { borzo: { configured: true }, shiprocket: { configured: true, walletReady: true }, shadowfax: { configured: true } }
  assert.equal(pendingCourierCommand('borzo_book', detail, statuses).available, true)
  const refreshed = structuredClone(detail)
  refreshed.courier.shiprocket.orderId = 'SR-other-operator'
  refreshed.courier.shiprocket.status = 'BOOKED'
  const pending = pendingCourierCommand('borzo_book', refreshed, statuses)
  assert.equal(pending.available, false)
  assert.match(pending.reason, /already recorded/i)
})

test('live read-only mode disables all browser analytics capture paths', async () => {
  const analytics = await component('src/lib/analytics.ts', {
    VITE_ADMIN_LIVE_READ_ONLY: '1',
    VITE_ADMIN_LOCAL_QA: '',
    VITE_POSTHOG_PROJECT_TOKEN: '',
  })
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const calls = { gtag: 0, beacon: 0, fetch: 0, timers: 0 }
  globalThis.window = {
    location: { hostname: '127.0.0.1', href: 'http://127.0.0.1:3200/admin?claimId=private' },
    dataLayer: [],
    gtag: () => { calls.gtag += 1 },
    setInterval: () => { calls.timers += 1; return 1 },
    clearInterval: () => {},
  }
  globalThis.document = { title: '' }
  globalThis.fetch = async () => { calls.fetch += 1; return new Response('{}') }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { sendBeacon: () => { calls.beacon += 1; return true } },
  })
  try {
    analytics.track(analytics.AnalyticsEvent.itemViewed, { slug: 'private-item' })
    analytics.identifyDonor('private-user')
    analytics.resetAnalyticsIdentity()
    analytics.trackPageView('/admin/orders', '?claimId=private')
    assert.deepEqual(calls, { gtag: 0, beacon: 0, fetch: 0, timers: 0 })
    assert.deepEqual(globalThis.window.dataLayer, [])
    assert.equal(globalThis.document.title, 'reloved | Admin')
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.fetch = previousFetch
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else delete globalThis.navigator
  }
})

test('support cards distinguish sources and expose the stored support chat identity', async () => {
  const { SupportCard, SupportEmptyState, supportCanMutate } = await component('src/components/admin/AdminSupport.tsx')
  let opened = ''
  const chat = render(SupportCard, { row: { id: 'chat:t', sourceId: 't', chatSubjectId: 'synthetic-user-uid', source: 'ask_reloved', state: 'unread', person: 'Synthetic Visitor', email: 'visitor@synthetic.invalid', phone: null, subject: 'Ask Reloved', preview: 'Help', occurredAt: '2026-09-29T10:00:00Z', linked: { itemId: null, dropId: null, claimId: null } }, onOpenChat: id => { opened = id } })
  const contact = render(SupportCard, { row: { id: 'contact:c', sourceId: 'c', source: 'contact_form', state: 'open', person: 'Synthetic Sender', email: 'sender@synthetic.invalid', phone: null, subject: 'Question', preview: 'Message', occurredAt: '2026-09-29T10:00:00Z', linked: { itemId: null, dropId: null, claimId: null } }, onOpenChat: () => {} })
  assert.match(chat, /Ask Reloved chat/)
  assert.match(chat, /Open conversation/)
  SupportCard({ row: { id: 'chat:t', sourceId: 't', chatSubjectId: 'synthetic-user-uid', source: 'ask_reloved', state: 'unread', person: 'Synthetic Visitor', email: null, phone: null, subject: 'Ask Reloved', preview: 'Help', occurredAt: null, linked: { itemId: null, dropId: null, claimId: null } }, onOpenChat: id => { opened = id } }).props.children.at(-1).props.onClick()
  assert.equal(opened, 'synthetic-user-uid')
  assert.match(contact, /Contact form/)
  const linked = render(SupportCard, { row: { id: 'contact:linked', sourceId: 'linked', source: 'contact_form', state: 'open', person: 'Linked', email: null, phone: null, subject: 'Linked', preview: 'Message', occurredAt: null, linked: { itemId: null, dropId: 'drop-1', claimId: null } }, onOpenChat: () => {} })
  assert.match(linked, /\/admin\/donations\?submissionId=drop-1/)
  assert.equal(supportCanMutate('ready', false), true)
  assert.equal(supportCanMutate('stale', false), false)
  const staleChat = render(SupportCard, { row: { id: 'chat:stale', sourceId: 'stale', chatSubjectId: 'stale-user', source: 'ask_reloved', state: 'unread', person: 'Stale', email: null, phone: null, subject: 'Ask Reloved', preview: 'Help', occurredAt: null, linked: { itemId: null, dropId: null, claimId: null } }, onOpenChat: () => {}, mutationsDisabled: true })
  assert.match(staleChat, /disabled=""/)
  assert.match(staleChat, /Open conversation · Read-only/)
  const readOnlyContact = render(SupportCard, { row: { id: 'contact:readonly', sourceId: 'readonly', source: 'contact_form', state: 'open', person: 'Read only', email: 'readonly@synthetic.invalid', phone: null, subject: 'Question', preview: 'Message', occurredAt: null, linked: { itemId: null, dropId: null, claimId: null } }, onOpenChat: () => {}, mutationsDisabled: true })
  assert.match(readOnlyContact, /Email reply · Read-only/)
  assert.match(readOnlyContact, /Mark actioned · Read-only/)
  assert.match(contact, /Email reply/)
  const bounded = render(SupportEmptyState, { view: 'unread', data: { coverage: 'partial', nextCursor: 'continue' } })
  assert.match(bounded, /Continue to the next page/)
  assert.doesNotMatch(bounded, /confirmed empty/i)
})

test('live read-only detail views preserve production action names while disabling triggers', async () => {
  const inventory = await readFile(new URL('src/components/admin/AdminInventory.tsx', root), 'utf8')
  const claim = await readFile(new URL('src/components/admin/InventoryClaimFocusPanel.tsx', root), 'utf8')
  for (const label of [
    'Approve drop',
    'Mark reviewing',
    'Decline drop',
    'Decline item',
    'Hide from Wall',
    'Publish on Wall',
    'Edit metadata · Read-only',
    'Open dropper conversation · Read-only',
  ]) assert.ok(inventory.includes(label), label)
  for (const label of [
    'Accept claim · Read-only',
    "Couldn't match · Read-only",
    'Ops ↔ Claimer',
    'Ops ↔ Giver',
    'Claimer ↔ Giver',
    'Open claim conversation · Read-only',
    'Preview template · Read-only',
    'Copy pickup',
    'Copy destination',
    'Copy all details',
  ]) assert.ok(claim.includes(label), label)
  assert.match(claim, /disabled=\{[\s\S]*ADMIN_LIVE_READ_ONLY/)
})

test('support deep links request exact source focus and stale or read-only data guards composers', async () => {
  const source = await readFile(new URL('src/components/admin/AdminSupport.tsx', root), 'utf8')
  assert.match(source, /searchParams\.get\("threadId"\)/)
  assert.match(source, /searchParams\.get\("messageId"\)/)
  assert.match(source, /setOpenChat\(null\)/)
  assert.match(source, /setReplyId\(null\)/)
  assert.match(source, /supportCanMutate\([\s\S]*ADMIN_LIVE_READ_ONLY/)
  assert.ok(source.match(/if \(mutationsDisabled\) return/g)?.length >= 3)
})

test('analytics metric cards render unavailable evidence honestly', async () => {
  const { AnalyticsMetricCard } = await component('src/components/admin/AdminAnalyticsContent.tsx')
  const html = render(AnalyticsMetricCard, { metric: { id: 'retention', label: 'Retention', value: null, source: 'Unavailable', definition: 'Cohort return rate', message: 'Not enough reliable data yet.' } })
  assert.match(html, /Not enough reliable data yet/)
  assert.match(html, /Cohort return rate/)
  assert.ok(!html.includes('>0<'))
})

test('resource retains dated last success on refresh failure and distinguishes empty/partial/error', async () => {
  const { reduceAdminResource, initialAdminResource } = await component(
    'src/lib/adminResource.ts',
  )
  let state = initialAdminResource()
  assert.equal(state.status, 'loading')
  state = reduceAdminResource(state, { type: 'failure' })
  assert.equal(state.status, 'error')
  const data = {
    asOf: '2026-09-29T12:00:00Z',
    coverage: 'complete',
    items: [{ id: 'one' }],
  }
  state = reduceAdminResource(state, { type: 'success', data, empty: false })
  assert.equal(state.status, 'ready')
  state = reduceAdminResource(state, { type: 'start' })
  assert.equal(state.data, data)
  state = reduceAdminResource(state, { type: 'failure' })
  assert.equal(state.status, 'stale')
  assert.equal(state.data.asOf, data.asOf)
  assert.equal(state.refreshing, false)
  state = reduceAdminResource(state, {
    type: 'success',
    data: { ...data, items: [] },
    empty: true,
  })
  assert.equal(state.status, 'empty')
  state = reduceAdminResource(state, {
    type: 'success',
    data: { ...data, coverage: 'partial', items: [] },
    empty: true,
  })
  assert.equal(
    state.status,
    'partial',
    'incomplete empty page must not assert an empty system',
  )
  state = reduceAdminResource(state, {
    type: 'success',
    data: { ...data, coverage: 'unavailable', items: [] },
    empty: true,
  })
  assert.equal(state.status, 'partial')
})

test('KPI and communication components show unavailable and failed/skipped/no-attempt distinctly', async () => {
  const { KpiCard, ChannelStatus } = await component(
    'src/components/admin/AdminOverviewContent.tsx',
  )
  const unavailable = render(KpiCard, {
    kpi: {
      id: 'users',
      label: 'Users',
      value: null,
      state: 'unavailable',
      reason: 'No trusted history',
      definition: 'Known profiles',
      source: 'profiles',
      scope: 'All time',
      href: '/admin/analytics',
    },
  })
  assert.match(unavailable, /Unavailable/)
  assert.match(unavailable, /No trusted history/)
  assert.ok(!unavailable.includes('>0<'))
  for (const status of ['failed', 'skipped', 'sent']) {
    const html = render(ChannelStatus, {
      channel: 'email',
      audit: {
        state: 'complete',
        counts: { sent: 0, failed: 1, skipped: 0 },
        latest: { status, at: null },
        attempts: [],
      },
    })
    assert.match(html, new RegExp(status, 'i'))
  }
  assert.match(
    render(ChannelStatus, {
      channel: 'sms',
      audit: {
        state: 'complete',
        counts: { sent: 0, failed: 0, skipped: 0 },
        latest: null,
        attempts: [],
      },
    }),
    /No attempt recorded/,
  )
  assert.match(
    render(ChannelStatus, {
      channel: 'sms',
      audit: { state: 'partial', counts: null, latest: null, attempts: [] },
    }),
    /coverage/i,
  )
})

test("inventory rows stay concise while retaining hidden state and honest unavailable funnel steps", async () => {
  const { InventoryRow, FunnelSteps, visibilityPatch, InventoryCoverageNotice } = await component(
    "src/components/admin/AdminInventory.tsx",
  );
  const item = {
    id: "hidden-item",
    title: "Hidden coat",
    publicVisibility: false,
    publicStatus: "claimed",
    status: "approved",
    images: [],
    dropper: {
      name: "Giver",
      username: "giver-one",
      email: "giver@example.com",
      phone: null,
      locality: "Area",
    },
    claims: [{ id: "claim", requesterName: "Receiver", status: "approved" }],
    notifications: {
      email: {
        state: "complete",
        latest: null,
        counts: { sent: 0, failed: 0, skipped: 0 },
        attempts: [],
      },
      sms: { state: "partial", latest: null, counts: null, attempts: [] },
    },
  };
  const html = render(InventoryRow, {
    row: item,
    kind: "wall",
    onOpen: () => {},
  });
  for (const value of [
    "Hidden coat",
    "Hidden",
    "Giver",
    "View details",
  ])
    assert.ok(html.includes(value), value);
  assert.ok(!html.includes("Receiver"), "claimer detail belongs in the expandable detail view");
  assert.deepEqual(visibilityPatch({ ...item, publicVisibility: true }), {
    publicVisibility: false,
  });
  assert.deepEqual(
    visibilityPatch(item),
    { publicVisibility: true },
    "restoring a claimed listing preserves claim state",
  );
  assert.deepEqual(visibilityPatch({ ...item, publicStatus: "withdrawn" }), {
    publicVisibility: true,
    status: "approved",
    publicStatus: "available",
  });
  assert.deepEqual(visibilityPatch({...item,status:"under_review"}),{publicVisibility:true,status:"approved"},"restoring a reviewed claimed item cannot reset its claim");
  const coverage = render(InventoryCoverageNotice,{kind:"wall",data:{sources:[{source:"items",state:"complete"},{source:"communication-coverage/item",state:"partial"}],nextCursor:null}});
  assert.match(coverage,/communication history is unavailable/);
  assert.match(coverage,/Earlier messages may not be available/);
  const funnel = render(FunnelSteps, {
    steps: [
      {
        id: "photos",
        label: "Photos added",
        value: null,
        source: "analyticsDaily",
        reason: "No reliable step event",
      },
    ],
  });
  assert.match(funnel, /Unavailable/);
  assert.ok(!funnel.includes(">0<"));
});

test('itemless moderation preserves original approve/review/decline actions and warns about existing side effects',async()=>{
 const {InventoryModeration, moderationConfirmation}=await component('src/components/admin/AdminInventory.tsx');
 const drop=render(InventoryModeration,{kind:'drop',status:'submitted',disabled:false,onSelect:()=>{}});
 for(const text of ['Approve drop','Mark reviewing','Decline drop'])assert.ok(drop.includes(text),text);
 const item=render(InventoryModeration,{kind:'item',status:'approved',disabled:false,onSelect:()=>{}});assert.ok(item.includes('Decline item'));
 assert.match(moderationConfirmation('drop','rejected'),/cancel.*claims/i);assert.match(moderationConfirmation('drop','approved'),/email/i);
 const source=await readFile(new URL('src/pages/admin/AdminOrders.tsx',root),'utf8');assert.match(source,/InventoryClaimFocusPanel/);
});

test('operations cards distinguish proposed times and communication failures, map fallback retains useful list context',async()=>{
 const {OperationCard,OperationsMap}=await component('src/components/admin/AdminOperations.tsx');
 const row={id:'claim',itemTitle:'Coat',itemImages:[],giverName:'Giver',requesterName:'Receiver',logistics:'receiver_collects',timing:'proposed',proposedSlotAt:'2026-09-29T10:00:00Z',pickupAddress:'Pickup building',requesterAddress:'Destination building',claimStatus:'approved',action:{kind:'coordinate',label:'Coordinate schedule'},notifications:{email:{state:'complete',latest:null,counts:{sent:0,failed:0,skipped:0},attempts:[]},sms:{state:'complete',latest:{status:'failed'},counts:{sent:0,failed:1,skipped:0},attempts:[]}},map:{state:'unavailable',pickup:null,destination:null}};
 const html=render(OperationCard,{row,onOpen:()=>{}});for(const value of ['Coat','Giver','Receiver','proposed','Pickup building','Destination building','Coordinate schedule','failed','No attempt recorded'])assert.ok(html.includes(value),value);
 assert.match(render(OperationsMap,{rows:[row]}),/Map location unavailable/);
});
test('focused operations reset confirmation state when the claim ID changes',async()=>{
 for(const page of ['AdminItemRequests','AdminOrders']){const source=await readFile(new URL(`src/pages/admin/${page}.tsx`,root),'utf8');assert.match(source,/InventoryClaimFocusPanel key=\{id\}/);}
});

test('operation mutation safety and provider email previews remain truthful', async () => {
  const {
    NotificationPreview,
    OPERATION_NOTE_MAX,
    operationCanMutate,
    safePreviewDocument,
  } = await component('src/components/admin/InventoryClaimFocusPanel.tsx')
  assert.equal(OPERATION_NOTE_MAX, 500)
  assert.equal(operationCanMutate('ready', false), true)
  assert.equal(operationCanMutate('stale', false), false)
  assert.equal(operationCanMutate('ready', true), false)
  assert.equal(operationCanMutate('ready', false, true), false)
  const previewDocument = safePreviewDocument(
    '<img src="https://tracker.example/open.gif"><style>body{color:#111}</style>',
  )
  assert.match(previewDocument, /default-src 'none'/)
  assert.match(previewDocument, /img-src data: blob:/)
  assert.doesNotMatch(previewDocument, /img-src[^;]*https:/)
  const html = render(NotificationPreview, {
    preview: {
      subject: 'Delivery update',
      htmlBody: '<strong>Provider-rendered message</strong>',
      textBody: 'Plain text fallback',
      source: 'brevo',
    },
    onClose: () => {},
  })
  assert.match(html, /sandbox=""/)
  assert.match(html, /Provider-rendered message/)
  assert.match(html, /Plain text fallback/)
  const source = await readFile(
    new URL('src/components/admin/InventoryClaimFocusPanel.tsx', root),
    'utf8',
  )
  assert.ok(
    source.match(/if \(!operationCanMutate\(resource\.status, busy, ADMIN_LIVE_READ_ONLY\)\)/g)
      ?.length >= 2,
    'record mutations guard stale and live read-only data',
  )
  assert.doesNotMatch(source, /d\.claimStatus === "approved" && !ADMIN_LIVE_READ_ONLY/)
  assert.match(source, /ADMIN_LIVE_READ_ONLY \|\|\s*busy \|\|\s*masking !== "ready"/)
  assert.match(source, /masking !== "ready" \|\|\s*!available \|\|\s*resource\.status === "stale"/)
})

test('analytics parity shows activation, operational context, sourced QR route and 24 hour control', async () => {
  const { ProductSection, FunnelsSection, AdminAnalyticsContent } = await component('src/components/admin/AdminAnalyticsContent.tsx')
  const meta = { state: 'partial', message: 'Incomplete source', source: 'Firestore' }
  const html = render(ProductSection, { data: { ...meta, metrics: [], categories: [], audiences: [], sizes: [], dropAreas: [], claimAreas: [], wallStatus: [], claimPipeline: [], roles: [], roleCoverage: '2 claims excluded from identity joins', attention: [{ id: 'aged', label: 'Available items aged 7+ days', count: null, severity: 'warning', href: '/admin/items?availability=available&visibility=visible', message: 'Current snapshot' }], attentionItems: [{ id: 'item:a', label: 'Synthetic item', href: '/admin/items?itemId=a' }] } })
  for (const value of ['Claim pipeline', 'Giver and claimer roles', '2 claims excluded', 'Available items aged', '/admin/items?itemId=a', '/qr', 'Short links are unavailable']) assert.ok(html.includes(value), value)
  const funnel = { id: 'drop', label: 'Drop journey', state: 'ready', message: 'No cohort conversion', steps: [] }
  const funnels = render(FunnelsSection, { data: { ...meta, activation: [], drop: funnel, claim: { ...funnel, id: 'claim' } } })
  assert.match(funnels, /Join and account activation/)
  const controls = render(AdminAnalyticsContent, { range: '24h', onRange() {}, view: 'overview', onView() {} })
  assert.match(controls, /aria-pressed="true">24 hours/)
  assert.match(controls, /Firestore: 7 calendar days/)
})

test('analytics information architecture renders actual PostHog aggregates without mixing operational scope', async () => {
  const {
    AnalyticsNavigation,
    AcquisitionSection,
    PostHogBehaviorSection,
    PostHogFunnelSection,
    PostHogDeviceGeoSection,
    PostHogSourceState,
    operationalAnalyticsRange,
  } = await component('src/components/admin/AdminAnalyticsContent.tsx')
  const navigation = render(AnalyticsNavigation, { view: 'overview', onView() {} })
  for (const label of [
    'Overview', 'Acquisition', 'Behavior', 'Drop funnel', 'Claim funnel',
    'Device &amp; geo', 'Fulfillment', 'Product', 'Search', 'Performance', 'Data health',
  ]) assert.ok(navigation.includes(label), label)
  assert.equal(operationalAnalyticsRange('24h'), '7d')
  assert.equal(operationalAnalyticsRange('7d'), '7d')
  assert.equal(operationalAnalyticsRange('30d'), '30d')

  const posthog = {
    status: 'connected', source: 'PostHog', range: '7d', checkedAt: '2026-09-30T10:00:00Z',
    cached: false, latencyMs: 120, message: null, retryAfterSeconds: null,
    requiredEnvironment: ['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST'],
    overview: {
      pageViews: 18, uniqueVisitors: 7, sessions: 5,
      events: [
        { id: '$pageview', label: '$pageview', events: 18, users: 7 },
        { id: 'donation_started', label: 'donation_started', events: 6, users: 5 },
        { id: 'donation_submitted', label: 'donation_submitted', events: 4, users: 4 },
        { id: 'claim_started', label: 'claim_started', events: 3, users: 3 },
      ],
    },
    traffic: [{ at: '2026-09-30', pageViews: 18, visitors: 7, sessions: 5 }],
    topPages: [{ id: '/wall', label: '/wall', events: 9, users: 5 }],
    acquisition: {
      referrers: [{ id: 'search.example', label: 'search.example', events: 7, users: 4, sessions: 3 }],
      utmSources: [{ id: 'newsletter', label: 'newsletter', events: 5, users: 3, sessions: 2 }],
      utmMediums: [{ id: 'email', label: 'email', events: 5, users: 3, sessions: 2 }],
      utmCampaigns: [{ id: 'kindness-week', label: 'kindness-week', events: 4, users: 3, sessions: 2 }],
      landingPages: [{ id: '/wall/:item', label: '/wall/:item', events: 3, users: 2, sessions: 2 }],
    },
    journeys: {
      drop: [
        { id: 'donation_started', label: 'Started', users: 6 },
        { id: 'donation_step_1', label: 'Photo', users: 6 },
        { id: 'donation_step_2', label: 'Details', users: 5 },
        { id: 'donation_step_6', label: 'Review', users: 4 },
        { id: 'donation_submitted', label: 'Submitted', users: 3 },
      ],
      claim: [
        { id: 'item_viewed', label: 'Item viewed', users: 8 },
        { id: 'claim_started', label: 'Claim started', users: 5 },
        { id: 'claim_submitted', label: 'Claim submitted', users: 3 },
      ],
    },
    wallFilters: [{ type: 'category', value: 'Outerwear', events: 8, users: 5 }],
    deviceConversion: [{ device: 'Mobile', visitors: 7, donationStarted: 4, donationSubmitted: 3, claimStarted: 2, claimSubmitted: 1 }],
    dimensions: {
      device: [{ label: 'Mobile', events: 12, users: 6 }], browser: [], os: [],
      country: [{ label: 'India', events: 16, users: 7 }], city: [],
    },
    schema: [{ event: '$pageview', properties: ['pathname', 'referrer'] }],
  }
  const acquisition = render(AcquisitionSection, { data: posthog })
  for (const value of ['Acquisition', 'search.example', 'newsletter', 'kindness-week', '/wall/:item', 'sessions', 'users']) assert.ok(acquisition.includes(value), value)
  const behavior = render(PostHogBehaviorSection, { data: posthog })
  for (const value of ['Behavior', 'Top product events', 'donation_started', 'Top pages', '/wall', 'Wall filter usage', 'Outerwear']) assert.ok(behavior.includes(value), value)
  const funnel = render(PostHogFunnelSection, { kind: 'drop', data: posthog })
  assert.match(funnel, /Photo/)
  assert.match(funnel, /Details/)
  assert.match(funnel, /Review/)
  assert.match(funnel, /1 fewer than the previous stage/)
  assert.match(funnel, /same selected period/i)
  const device = render(PostHogDeviceGeoSection, { data: posthog })
  assert.match(device, /Mobile/)
  assert.match(device, /India/)
  assert.match(device, /Give submitted/)
  assert.match(device, /Claim submitted/)
  assert.doesNotMatch(JSON.stringify({ behavior, funnel, device }), /private@example\.com/)

  const missing = render(PostHogSourceState, {
    data: { ...posthog, status: 'misconfigured', message: 'PostHog historical reads are not configured.' },
  })
  for (const name of ['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST']) assert.ok(missing.includes(name), name)

  const { PostHogRefreshNotice } = await component('src/components/admin/AdminAnalyticsContent.tsx')
  const stale = render(PostHogRefreshNotice, { status: 'stale', checkedAt: posthog.checkedAt })
  assert.match(stale, /PostHog refresh failed/)
  assert.match(stale, /last successful aggregate snapshot/)
  assert.match(stale, /Retry before using it for a current decision/)
  assert.equal(render(PostHogRefreshNotice, { status: 'ready', checkedAt: posthog.checkedAt }), '')

  const source = await readFile(new URL('src/components/admin/AdminAnalyticsContent.tsx', root), 'utf8')
  assert.match(source, /analytics\/posthog\?range=/)
  assert.match(source, /analytics\/snapshot\?range=.*operational/)
  const page = await readFile(new URL('src/pages/admin/AdminAnalytics.tsx', root), 'utf8')
  assert.match(page, /'24h' \| '7d' \| '30d'/)
  assert.doesNotMatch(page, /'14d'/)
  const css = await readFile(new URL('src/components/admin/admin-analytics.css', root), 'utf8')
  assert.match(css, /@media \(max-width: 560px\)/)
  assert.match(css, /\.analytics-nav[\s\S]*overflow-x: auto/)
})
