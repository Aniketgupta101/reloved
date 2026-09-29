import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const root = new URL('../', import.meta.url)
async function component(path) {
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
      'import.meta.env': JSON.stringify({ VITE_DEV_ADMIN_BYPASS: 'true' }),
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

test('support cards distinguish sources and expose existing reply paths', async () => {
  const { SupportCard } = await component('src/components/admin/AdminSupport.tsx')
  const chat = render(SupportCard, { row: { id: 'chat:t', sourceId: 't', source: 'ask_reloved', state: 'unread', person: 'Synthetic Visitor', email: 'visitor@synthetic.invalid', phone: null, subject: 'Ask Reloved', preview: 'Help', occurredAt: '2026-09-29T10:00:00Z', linked: { itemId: null, dropId: null, claimId: null } }, onOpenChat: () => {} })
  const contact = render(SupportCard, { row: { id: 'contact:c', sourceId: 'c', source: 'contact_form', state: 'open', person: 'Synthetic Sender', email: 'sender@synthetic.invalid', phone: null, subject: 'Question', preview: 'Message', occurredAt: '2026-09-29T10:00:00Z', linked: { itemId: null, dropId: null, claimId: null } }, onOpenChat: () => {} })
  assert.match(chat, /Ask Reloved chat/)
  assert.match(chat, /Open conversation/)
  assert.match(contact, /Contact form/)
  assert.match(contact, /Email reply/)
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

test("inventory shows hidden items, real linked people, and honest unavailable funnel steps", async () => {
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
    "Receiver",
    "View details",
  ])
    assert.ok(html.includes(value), value);
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
  assert.match(coverage,/Limited communication history/);
  assert.match(coverage,/Inventory records in this view loaded/);
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
 assert.match(render(OperationsMap,{rows:[row]}),/Map unavailable/);
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
    source.match(/if \(!operationCanMutate\(resource\.status, busy\)\)/g)
      ?.length >= 2,
    'both record mutations and masked calls guard stale retained data',
  )
  assert.match(source, /masking !== "ready" \|\|\s*!available \|\|\s*resource\.status === "stale"/)
})
