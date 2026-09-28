import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { withPublicBrowser, installFixtures, fixtureResponse, assertNoOverflow, assertPublicFonts, assertTargets } from './public-browser-harness.mjs'
const evidence = '../.local-proof/task-4/public-account'
await mkdir(evidence, { recursive: true })
const photo = '/images/wall-items/hunter-x-hunter-hisoka-tee.png'
const back = '/images/wall-items/hunter-x-hunter-hisoka-tee-back.png'
const profile = { id: 'donor-local', name: 'Local Fixture', username: 'local-fixture', phone: '9999999999', email: 'fixture@example.invalid', address: 'Example building, Bandra', pincode: '400050', gender: 'unisex', onboardedAt: '2026-09-01' }
const item = { id: 'item-local', slug: 'local-tee', title: 'Graphic cotton tee', category: 'Tops', condition: 'Good', size: 'M', gender: 'unisex', quantity: 1, status: 'available', publicStatus: 'available', publicVisibility: true, imageProcessingStatus: 'ready', images: [{ storagePath: photo }, { storagePath: back }] }
const request = { id: 'claim-local', status: 'pending', createdAt: '2026-09-25', giverLogistics: 'porter_arranged', pickupLocality: 'Example gate, Bandra 400050', requesterName: 'Local Receiver', requesterUsername: 'receiver', submissionId: 'gift-local', item }
const submission = { id: 'gift-local', reference: 'RL-LOCAL-ONLY', status: 'approved', submittedAt: '2026-09-25', giverLogistics: 'porter_arranged', address: 'Example gate, Bandra 400050', items: [item] }
const note = { id: 'note-local', role: 'giver', type: 'item_claimed', title: 'A claim on your item', itemTitle: item.title, body: 'Open your gift to respond.', href: '/account', requestId: request.id, read: false, createdAt: '2026-09-25' }
const thread = { thread: { id: 'thread-local', itemTitle: item.title, unreadForOwner: false }, messages: [] }
const claimPath = '/account/claims/claim-local'
const giftPath = '/account/gifts/gift-local?item=item-local'
await withPublicBrowser(async (browser, baseURL) => {
  let passed = 0; const failures = []
  const check = async (name, run) => { if (process.env.ACCOUNT_CHECK_FILTER && !name.includes(process.env.ACCOUNT_CHECK_FILTER)) return; try { await run(); passed++; console.log(`PASS ${name}`) } catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name}: ${error.message}`) } }
  async function scenario(run, { width = 390, path = '/account?tab=giving', claim = request, gift = submission, empty = false, notifications = [], signedIn = true, fixtures = {}, expectedErrors = [] } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce', serviceWorkers: 'block' }); context.setDefaultTimeout(3500)
    context.setDefaultNavigationTimeout(15000)
    await context.addInitScript(({ signedIn, origin }) => { if (location.origin === origin && signedIn) localStorage.setItem('reloved_donor_token', 'local-browser-fixture-only') }, { signedIn, origin: new URL(baseURL).origin })
    const writes = []; const fixtureErrors = []
    const localFixtures = {
      'POST /api/analytics/events': { ok: true },
      'GET https://photon.komoot.io/api/?q=Example+gate%2C+Bandra&limit=6&lat=19.076&lon=72.8777&lang=en': { features: [] },
      'GET https://photon.komoot.io/api/?q=Example+building%2C+Bandra&limit=6&lat=19.076&lon=72.8777&lang=en': { features: [] },
      'GET /api/donor/profile': { profile },
      'GET /api/donor/submissions': () => ({ submissions: empty ? [] : [gift] }),
      'GET /api/donor/item-requests': () => ({ requests: empty ? [] : [claim], weeklyUsed: 1, weeklyLimit: 2 }),
      'GET /api/donor/item-requests/claim-local': () => ({ request: claim }),
      'GET /api/donor/incoming-claims': { claims: empty ? [] : [{ ...request }] },
      'GET /api/donor/notifications': () => ({ notifications, unreadCount: notifications.filter(n => !n.read).length }),
      'GET /api/donor/notifications/unread-count': { unreadCount: 0 },
      'POST /api/donor/threads/open': req => { const body = req.postDataJSON(); assert.ok(['claim', 'donation', 'peer'].includes(body.subjectType)); assert.equal(body.subjectId, body.subjectType === 'donation' ? 'gift-local' : 'claim-local'); writes.push(body); return thread },
      'GET /api/donor/threads/thread-local': thread,
      ...fixtures,
    }
    for (const [key, value] of Object.entries(localFixtures)) if (typeof value === 'function') localFixtures[key] = async req => { try { return await value(req) } catch (error) { fixtureErrors.push(`${key}: ${error.message}`); return { error: 'Local fixture contract failed' } } }
    const audit = await installFixtures(context, baseURL, localFixtures)
    const page = await context.newPage()
    try {
      await page.goto(baseURL + path); await run(page, audit, writes); await assertNoOverflow(page)
      assert.deepEqual(fixtureErrors, [], 'exact fixture contracts')
      for (const key of Object.keys(fixtures).filter(key => !key.startsWith('GET '))) assert.ok(audit.requests.includes(key), `expected request: ${key}`)
      assert.deepEqual(audit.violations, [], 'all network reads/writes must be explicit local fixtures')
      assert.deepEqual(audit.errors.filter(e => !expectedErrors.some(p => p.test(e))), [], 'no unexpected browser errors')
    } finally { await context.close() }
  }
  const scope = page => page.locator('.public-account, .public-lifecycle')
  async function ready(page) { await page.getByRole('heading', { name: item.title, exact: true }).waitFor() }
  async function capture(page, name) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }) }
  const exact = (req, expected) => { assert.deepEqual(req.postDataJSON(), expected); assert.equal(req.headers().authorization, 'Bearer local-browser-fixture-only'); return { ok: true } }
  for (const width of [320, 390, 768, 1440]) {
    await check(`account tabs, current items and hierarchy ${width}`, () => scenario(async page => {
      await page.getByRole('heading', { name: 'Your drops', exact: true }).waitFor()
      assert.equal(await page.locator('.public-account').count(), 1, 'account needs approved scoped layout')
      await page.getByRole('link', { name: item.title, exact: true }).last().waitFor()
      assert.ok((await page.getByRole('heading', { name: 'Your drops', exact: true }).boundingBox()).y < (await page.getByText('Submissions', { exact: true }).boundingBox()).y, 'current items before metrics')
      await assertPublicFonts(page); await assertTargets(scope(page).locator('button, a')); await capture(page, `giving-${width}`)
      for (const [label, tab, heading] of [['Claims', 'claiming', "Items you've requested"], ['Notifications', 'notifications', 'Notifications'], ['Profile', 'profile', 'Your profile']]) {
        await page.getByRole('tab', { name: new RegExp(`^${label}`) }).click(); assert.ok(page.url().endsWith(`tab=${tab}`)); await page.getByRole('heading', { name: heading, exact: true }).waitFor(); await assertNoOverflow(page); await assertTargets(scope(page).locator('button, a')); await capture(page, `${tab}-${width}`)
      }
    }, { width }))
    for (const family of ['claim', 'gift']) await check(`${family} composition and contained images ${width}`, () => scenario(async page => {
      await ready(page); assert.equal(await page.locator('.public-lifecycle').count(), 1, 'detail needs approved scoped layout')
      const layout = page.locator('.public-lifecycle-layout'); const image = page.locator('.public-lifecycle-photo'); const content = page.locator('.public-lifecycle-content')
      assert.equal(await layout.evaluate(el => getComputedStyle(el).boxShadow), 'none')
      const a = await image.boundingBox(); const b = await content.boundingBox()
      assert.ok(width >= 1024 ? a.x + a.width <= b.x : a.y + a.height <= b.y, 'desktop decision columns and mobile image-first order')
      for (const img of await scope(page).locator('img').all()) { assert.equal(await img.evaluate(el => getComputedStyle(el).objectFit), 'contain'); await img.evaluate(el => el.decode()) }
      await assertTargets(scope(page).locator('button, a')); await capture(page, `${family}-${width}`)
    }, { width, path: family === 'claim' ? claimPath : giftPath }))
  }
  for (const [status, stage, label, cancel, received, peer] of [
    ['pending', null, 'Awaiting dropper', true, false, false],
    ['approved', 'awaiting_address_confirm', 'Confirm your address', true, false, true],
    ['approved', 'awaiting_schedule', 'Waiting for a delivery time', true, false, true],
    ['approved', 'schedule_proposed', 'Dropper shared a time — confirm', true, false, true],
    ['approved', 'schedule_agreed', 'Time locked — courier soon', true, false, true],
    ['approved', 'awaiting_handover', 'Courier booked', true, false, true],
    ['approved', 'handed_over', 'Delivered — confirm received', false, true, true],
    ['approved', 'received', 'Reloved', false, false, true],
    ['cancelled', null, 'Cancelled', false, false, false],
    ['rejected', null, "Couldn't match", false, false, false],
  ]) await check(`claimer status/action matrix ${status}/${stage}`, () => scenario(async (page, audit, writes) => {
    await ready(page); await page.locator('.public-lifecycle-status').filter({ hasText: label }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Cancel claim', exact: true }).count(), Number(cancel))
    assert.equal(await page.getByRole('button', { name: 'Received', exact: true }).count(), Number(received))
    assert.equal(await page.getByRole('button', { name: 'Accept', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Handed over', exact: true }).count(), 0)
    const peerButton = page.getByRole('button', { name: 'Chat with dropper', exact: true })
    if (status === 'pending' || status === 'approved') { await page.getByRole('button', { name: 'Send message', exact: true }).waitFor(); assert.equal(await peerButton.isEnabled(), peer); assert.ok(writes.some(w => w.subjectType === 'claim')) }
    else assert.equal(await peerButton.count(), 0)
    await capture(page, `claim-${status}-${stage || 'none'}`)
  }, { path: claimPath, claim: { ...request, status, handoverStage: stage, dropAddressConfirmedByClaimer: stage !== 'awaiting_address_confirm', pickupAddressConfirmedByGiver: true, proposedSlotAt: stage === 'schedule_proposed' ? '2099-10-05T12:00:00.000Z' : null, agreedSlotAt: ['schedule_agreed', 'awaiting_handover'].includes(stage) ? '2099-10-05T12:00:00.000Z' : null } }))
  for (const [status, claimStatus, stage, edit, remove, accept, handover] of [
    ['pending', null, null, true, true, false, false], ['rejected', null, null, true, false, false, false], ['approved', null, null, true, true, false, false],
    ['approved', 'pending', null, false, false, true, false], ['approved', 'approved', null, false, false, false, false],
    ['approved', 'approved', 'handed_over', false, false, false, false], ['approved', 'approved', 'received', false, false, false, false],
  ]) await check(`giver status/action matrix ${status}/${claimStatus}/${stage}`, () => scenario(async page => {
    await ready(page)
    assert.equal(await page.getByRole('button', { name: 'Edit item details', exact: true }).count(), Number(edit))
    assert.equal(await page.getByRole('button', { name: /^Remove (listing|from Wall)$/ }).count(), Number(remove))
    assert.equal(await page.getByRole('button', { name: 'Accept', exact: true }).count(), Number(accept))
    assert.equal(await page.getByRole('button', { name: 'Decline', exact: true }).count(), Number(accept))
    assert.equal(await page.getByRole('button', { name: 'Handed over', exact: true }).count(), Number(handover))
    assert.equal(await page.getByRole('button', { name: 'Received', exact: true }).count(), 0)
    await capture(page, `gift-${status}-${claimStatus}-${stage}`)
  }, { path: giftPath, gift: { ...submission, status, giverLogistics: 'receiver_collects', items: [{ ...item, claim: claimStatus ? { ...request, status: claimStatus, handoverStage: stage, giverLogistics: 'receiver_collects' } : null }] } }))
  for (const tab of ['giving', 'claiming', 'notifications']) await check(`empty ${tab}`, () => scenario(async page => { await page.getByText(tab === 'giving' ? 'Nothing here yet.' : tab === 'claiming' ? 'No claims yet' : 'No alerts yet', { exact: true }).waitFor(); await capture(page, `empty-${tab}`) }, { path: `/account?tab=${tab}`, empty: true }))
  await check('cancel claim exact payload', () => scenario(async page => { await ready(page); await page.getByRole('button', { name: 'Cancel claim', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancel claim', exact: true }).click(); await page.getByText('Claim cancelled', { exact: true }).waitFor() }, { path: claimPath, fixtures: { 'POST /api/donor/item-requests/claim-local/cancel': req => exact(req, {}) } }))
  await check('giver accept and decline exact payload', async () => {
    for (const decision of ['accept', 'decline']) await scenario(async page => { await ready(page); await page.getByRole('button', { name: decision === 'accept' ? 'Accept' : 'Decline', exact: true }).click(); if (decision === 'decline') await page.getByRole('button', { name: "Confirm — couldn't match", exact: true }).click(); await page.waitForTimeout(200) }, { path: giftPath, gift: { ...submission, items: [{ ...item, claim: request }] }, fixtures: { 'POST /api/donor/item-requests/claim-local/giver-decision': req => exact(req, decision === 'accept' ? { decision: 'accept' } : { decision: 'decline', reason: 'too_far' }) } })
  })
  await check('chat default open, peer gating and exact send', () => scenario(async (page, audit, writes) => {
    await ready(page); await page.getByRole('button', { name: 'Send message', exact: true }).waitFor(); await page.getByTestId('chat-draft-input').fill('Local fixture hello'); await page.getByRole('button', { name: 'Send message', exact: true }).click(); await page.getByText('Local fixture hello', { exact: false }).waitFor(); await page.getByRole('button', { name: 'Chat with dropper', exact: true }).click(); await page.waitForTimeout(100); assert.ok(writes.some(w => w.subjectType === 'peer'))
  }, { path: claimPath, claim: { ...request, status: 'approved', giverLogistics: 'receiver_collects' }, fixtures: { 'POST /api/donor/threads/thread-local/messages': req => { exact(req, { text: 'Local fixture hello' }); return { ...thread, messages: [{ id: 'message-local', text: 'Local fixture hello', senderRole: 'donor', senderName: 'Local', createdAt: '2026-09-25' }] } } } }))
  await check('address validation and exact confirm payload', () => scenario(async page => {
    await ready(page); const address = page.getByPlaceholder('Building name, street/landmark, area'); await address.fill(''); await page.getByPlaceholder('e.g. 400053').fill(''); assert.equal(await page.getByRole('button', { name: 'Confirm address', exact: true }).isDisabled(), true)
    await address.fill('Example gate, Bandra'); await page.getByPlaceholder('e.g. 400053').fill('400050'); await page.getByRole('button', { name: 'Confirm address', exact: true }).click(); await page.waitForTimeout(200)
  }, { path: claimPath, claim: { ...request, status: 'approved', handoverStage: 'awaiting_address_confirm' }, fixtures: { 'POST /api/donor/item-requests/claim-local/confirm-address': req => exact(req, { address: 'Example gate, Bandra', pincode: '400050' }) } }))
  await check('schedule accept and unavailable exact payload', async () => {
    for (const decision of ['accept', 'unavailable']) await scenario(async page => { await ready(page); if (decision === 'accept') await page.getByRole('button', { name: 'I’ll be there', exact: true }).click(); else { await page.getByRole('button', { name: 'Not free / have a query', exact: true }).click(); await page.getByRole('button', { name: 'Send to dropper', exact: true }).click() } await page.waitForTimeout(200) }, { path: claimPath, claim: { ...request, status: 'approved', handoverStage: 'schedule_proposed', dropAddressConfirmedByClaimer: true, proposedSlotAt: '2099-10-05T12:00:00.000Z', proposedSlotBy: 'giver' }, fixtures: { 'POST /api/donor/item-requests/claim-local/respond-schedule': req => exact(req, decision === 'accept' ? { decision, slotAt: '2099-10-05T12:00:00.000Z' } : { decision }) } })
  })
  await check('handover and receipt exact payload', async () => {
    await scenario(async page => { await ready(page); await page.getByRole('button', { name: 'Handed over', exact: true }).click(); await page.waitForTimeout(200) }, { path: giftPath, gift: { ...submission, giverLogistics: 'receiver_collects', items: [{ ...item, claim: { ...request, status: 'approved', handoverStage: 'awaiting_handover', agreedSlotAt: '2099-10-05T12:00:00.000Z', giverLogistics: 'receiver_collects' } }] }, fixtures: { 'POST /api/donor/item-requests/claim-local/handed-over': req => exact(req, {}) } })
    await scenario(async page => { await ready(page); await page.getByRole('button', { name: 'Received', exact: true }).click(); await page.getByRole('button', { name: 'Save photo', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Save photo', exact: true }).isDisabled(), true); await assertTargets(scope(page).locator('button')); await capture(page, 'receipt-dialog'); await page.locator('input[type=file]').setInputFiles('public' + photo); await page.getByPlaceholder('How did it feel? Say thanks to kindness…').fill('Thank you'); await page.getByRole('button', { name: 'Save photo', exact: true }).click(); await page.waitForTimeout(200) }, { path: claimPath, claim: { ...request, status: 'approved', handoverStage: 'handed_over', giverLogistics: 'receiver_collects' }, fixtures: { 'POST /api/donor/item-requests/claim-local/received': req => exact(req, {}), 'POST /api/donor/item-requests/claim-local/received-photo': req => { assert.match(req.headers()['content-type'], /multipart\/form-data/); const body = req.postDataBuffer().toString('latin1'); assert.match(body, /name="photo"/); assert.match(body, /name="note"\r\n\r\nThank you/); return { ok: true } } } })
  })
  await check('notification mark/read and exact gift targeting', () => scenario(async page => { await page.getByRole('button').filter({ hasText: 'A claim on your item' }).click(); await page.waitForURL('**/account/gifts/gift-local?claim=claim-local'); await ready(page) }, { path: '/account', notifications: [{ ...note }], fixtures: { 'PATCH /api/donor/notifications/read-all': req => exact(req, {}), 'PATCH /api/donor/notifications/note-local/read': req => exact(req, {}) } }))
  await check('notification error and retry', () => scenario(async page => {
    await page.getByText('Couldn’t load alerts', { exact: true }).waitFor()
    const retry = page.getByRole('button', { name: 'Retry', exact: true })
    // Initial hook and dashboard reads may overlap. Keep errors until the real
    // user click, so a pending initial read cannot remove Retry before activation.
    await retry.evaluate(el => el.addEventListener('click', () => { window.__localNotificationRetry = true }, { capture: true, once: true }))
    await retry.click(); await page.getByText('No alerts yet', { exact: true }).waitFor()
  }, { path: '/account', fixtures: { 'GET /api/donor/notifications': async req => await req.frame().evaluate(() => window.__localNotificationRetry === true) ? { notifications: [], unreadCount: 0 } : fixtureResponse({ error: 'Local unavailable' }, { status: 503 }) }, expectedErrors: [/503/] }))
  await check('loading and unavailable detail', async () => {
    await scenario(async page => { await page.locator('.public-lifecycle-loading').waitFor(); assert.equal(await page.locator('.public-lifecycle-loading').evaluate(el => getComputedStyle(el).animationName), 'none'); await ready(page) }, { path: claimPath, fixtures: { 'GET /api/donor/item-requests/claim-local': fixtureResponse({ request }, { delayMs: 700 }) } })
    await scenario(async page => { await page.getByText('Couldn’t load this claim', { exact: true }).waitFor(); await page.getByText('This claim is temporarily unavailable. Try again in a moment. No changes were made.', { exact: true }).waitFor(); assert.equal(await page.getByRole('link', { name: 'Back to account', exact: true }).count(), 1) }, { path: claimPath, fixtures: { 'GET /api/donor/item-requests/claim-local': fixtureResponse({ error: 'Local unavailable' }, { status: 503 }) }, expectedErrors: [/503/] })
  })
  await check('signed-out redirects', async () => { for (const path of ['/account', claimPath, giftPath]) await scenario(async page => { await page.waitForURL('**/account/login'); assert.equal(await page.evaluate(() => localStorage.getItem('reloved_donor_token')), null) }, { path, signedIn: false }) })
  await check('long title, 200% text and keyboard focus', async () => {
    for (const path of ['/account?tab=claiming', claimPath, giftPath]) await scenario(async page => { await scope(page).waitFor(); await page.waitForTimeout(250); await page.evaluate(() => { const values = [...document.querySelectorAll('.public-account *, .public-lifecycle *')].map(el => [el, getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight]); for (const [el, size, line] of values) { el.style.fontSize = `${parseFloat(size) * 2}px`; if (/px$/.test(line)) el.style.lineHeight = `${parseFloat(line) * 2}px` } }); await assertNoOverflow(page); await assertTargets(scope(page).locator('button, a')); const target = scope(page).locator('button, a').first(); await target.focus(); assert.notEqual(await target.evaluate(el => getComputedStyle(el).outlineStyle), 'none'); await capture(page, `text-pressure-${path.includes('claims/') ? 'claim' : path.includes('gifts/') ? 'gift' : 'account'}`) }, { width: 320, path, claim: { ...request, item: { ...item, title: 'An exceptionally long cotton graphic tee title for a complete readable garment identity' } }, gift: { ...submission, items: [{ ...item, title: 'An exceptionally long cotton graphic tee title for a complete readable garment identity' }] } })
  })
  await check('profile save preserves exact unchanged-contact payload', () => scenario(async page => {
    // This payload check starts with a hydrated profile, including unchanged contacts.
    await page.getByText(profile.email, { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Edit profile', exact: true }).click(); const form = page.locator('.public-account form'); await form.locator('input').first().fill('Updated Fixture'); await page.getByRole('button', { name: 'Save profile', exact: true }).click(); await page.getByText('Profile updated.', { exact: true }).waitFor()
  }, { path: '/account?tab=profile', fixtures: { 'GET /api/donor/profile': fixtureResponse({ profile }, { delayMs: 600 }), 'PATCH /api/donor/profile': req => { exact(req, { name: 'Updated Fixture', username: 'local-fixture', address: profile.address, pincode: '400050' }); return { profile: { ...profile, name: 'Updated Fixture' } } } } }))
  await check('item edit query and exact fields', () => scenario(async page => {
    await ready(page); await page.getByRole('button', { name: 'Save changes', exact: true }).waitFor(); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.getByText('Item updated', { exact: true }).waitFor()
  }, { path: giftPath + '&edit=1', fixtures: { 'PATCH /api/donor/items/item-local': req => exact(req, { title: item.title, description: '', category: 'Tops', condition: 'Good', size: 'M', brand: '', gender: 'unisex', quantity: 1 }) } }))
  await check('remove gift exact reason and redirect', () => scenario(async page => { await ready(page); await page.getByRole('button', { name: 'Remove from Wall', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click(); await page.waitForURL('**/account?tab=giving') }, { path: giftPath, fixtures: { 'DELETE /api/donor/submissions/gift-local': req => exact(req, { reason: '' }) } }))
  await check('self handover address exact payload', () => scenario(async page => { await ready(page); await page.getByPlaceholder('Building name, street/landmark, area').fill('Example building, Bandra'); await page.getByPlaceholder('e.g. 400053').fill('400050'); await page.getByRole('button', { name: 'Confirm address', exact: true }).click(); await page.waitForTimeout(200) }, { path: claimPath, claim: { ...request, status: 'approved', handoverStage: 'awaiting_address_confirm', giverLogistics: 'giver_sends' }, fixtures: { 'POST /api/donor/item-requests/claim-local/confirm-address': req => exact(req, { address: 'Example building, Bandra', pincode: '400050' }) } }))
  await check('giver schedule address plus preferred time exact payloads', () => scenario(async page => {
    await ready(page); await page.getByPlaceholder('Building name, street/landmark, area').fill('Example gate, Bandra'); await page.getByPlaceholder('e.g. 400053').fill('400050'); await page.getByRole('button', { name: 'Specific date', exact: true }).click(); await page.locator('input[type=date]').fill('2099-10-05'); await page.getByRole('button', { name: 'Confirm · address + preferred time', exact: true }).click(); await page.waitForTimeout(200)
  }, { path: giftPath, gift: { ...submission, items: [{ ...item, claim: { ...request, status: 'approved', handoverStage: 'awaiting_address_confirm' } }] }, fixtures: { 'POST /api/donor/item-requests/claim-local/confirm-address': req => exact(req, { address: 'Example gate, Bandra', pincode: '400050' }), 'POST /api/donor/item-requests/claim-local/propose-schedule': req => { const body = req.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['mode', 'slots']); assert.equal(body.mode, 'specific'); assert.equal(body.slots.length, 1); assert.equal(body.slots[0], '2099-10-05T12:30:00.000Z'); return { ok: true } } } }))
  await check('courier gating and waiting for receiver', async () => {
    for (const booked of [false, true]) await scenario(async page => { await ready(page); assert.equal(await page.getByRole('button', { name: 'Handed over', exact: true }).count(), Number(booked)); assert.equal(await page.getByRole('button', { name: /Book (Shiprocket|Shadowfax)/ }).count(), 0); if (!booked) await page.getByText('Waiting for the claimer to confirm they’ll be present.', { exact: true }).waitFor() }, { path: giftPath, gift: { ...submission, items: [{ ...item, claim: { ...request, status: 'approved', handoverStage: booked ? 'awaiting_handover' : 'schedule_proposed', pickupAddressConfirmedByGiver: true, dropAddressConfirmedByClaimer: true, proposedSlotAt: '2099-10-05T12:00:00.000Z', agreedSlotAt: booked ? '2099-10-05T12:00:00.000Z' : null, opsBookingStatus: booked ? 'booked' : null } }] } })
  })
  await check('query selects exact sibling and giver redirect from claim', async () => {
    await scenario(async page => { await ready(page); assert.equal(await page.getByRole('button', { name: 'Accept', exact: true }).count(), 1) }, { path: '/account/gifts/gift-local?claim=claim-local', gift: { ...submission, items: [{ ...item, id: 'first-item', title: 'Other garment' }, { ...item, claim: request }] } })
    await scenario(async page => { await page.waitForURL('**/account/gifts/gift-local?claim=claim-local'); await ready(page) }, { path: claimPath, fixtures: { 'GET /api/donor/item-requests/claim-local': { role: 'giver', giftHref: '/account/gifts/gift-local?claim=claim-local' } } })
  })
  await check('lifecycle dialog keyboard entry, trap and return', () => scenario(async page => { await ready(page); const trigger = page.getByRole('button', { name: 'Cancel claim', exact: true }); await trigger.focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor(); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), true, 'dialog must receive keyboard focus'); for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), true) } await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0); assert.equal(await trigger.evaluate(el => el === document.activeElement), true) }, { path: claimPath }))
  await check('compact account rows and scoped gift loading', async () => {
    await scenario(async page => { const card = page.locator('.public-account-items > div').first(); await card.waitFor(); const bounds = await card.boundingBox(); const children = await card.locator(':scope > *').all(); const heights = await Promise.all(children.map(async child => (await child.boundingBox()).height)); assert.ok(bounds.height <= Math.max(...heights) + 30, 'account row must not reserve empty grid rows') })
    await scenario(async page => { await page.locator('.public-lifecycle-loading').waitFor(); await ready(page) }, { path: giftPath, fixtures: { 'GET /api/donor/submissions': fixtureResponse({ submissions: [submission] }, { delayMs: 700 }) } })
  })
  await check('prompt dialog returns focus to its trigger', () => scenario(async page => { await ready(page); const trigger = page.getByRole('button', { name: 'Remove from Wall', exact: true }); await trigger.focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0); assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'prompt modal must return focus to Remove') }, { path: giftPath }))
  await check('finished handover has no obsolete schedule or address actions', async () => {
    for (const stage of ['handed_over', 'received']) for (const path of [claimPath, giftPath]) await scenario(async page => { await ready(page); assert.equal(await page.getByRole('button', { name: /^(Confirm address|Confirm · address|Share preferred time|I’ll be there)/ }).count(), 0, 'finished handover cannot offer address or scheduling again'); assert.equal(await page.getByText('Waiting for the dropper to share when they’re free.', { exact: true }).count(), 0); assert.equal(await page.getByText('Waiting for the claimer to confirm they’ll be present.', { exact: true }).count(), 0); }, { path, claim: { ...request, status: 'approved', handoverStage: stage }, gift: { ...submission, items: [{ ...item, claim: { ...request, status: 'approved', handoverStage: stage } }] } })
  })
  await check('completed gift leads with its current status', () => scenario(async page => { await ready(page); assert.equal(await page.locator('.public-lifecycle-status').innerText(), 'RELOVED ❤️') }, { path: giftPath, gift: { ...submission, items: [{ ...item, claim: { ...request, status: 'approved', handoverStage: 'received' } }] } }))
  await check('completed self handover has no waiting or handover instructions', () => scenario(async page => { await ready(page); assert.equal(await page.getByText('Waiting for the receiver to save a delivery building.', { exact: true }).count(), 0); assert.equal(await page.getByText('Claimer collects from your gate. Mark handed over when they’ve picked up.', { exact: true }).count(), 0) }, { path: giftPath, gift: { ...submission, giverLogistics: 'receiver_collects', items: [{ ...item, claim: { ...request, giverLogistics: 'receiver_collects', status: 'approved', handoverStage: 'received' } }] } }))
  await check('receipt mark remains legible', () => scenario(async page => { await ready(page); await page.getByRole('button', { name: 'Share a Reloved photo', exact: true }).click(); assert.notEqual(await page.getByRole('dialog').locator('.text-white').evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)', 'heart must remain visible on neutral dialog mark') }, { path: claimPath, claim: { ...request, status: 'approved', handoverStage: 'received', giverLogistics: 'receiver_collects' } }))
  await check('next action before chat and unframed decisions', () => scenario(async page => { await ready(page); const cancel = await page.getByRole('button', { name: 'Cancel claim', exact: true }).boundingBox(); const chat = await page.getByRole('button', { name: 'Chat with Reloved', exact: true }).boundingBox(); assert.ok(cancel.y < chat.y, 'next permitted action before supporting chat'); assert.equal(await page.locator('.public-lifecycle-content > div').nth(1).evaluate(el => getComputedStyle(el).borderLeftWidth), '0px', 'decision area uses a separator rather than a repeated frame') }, { path: claimPath }))
  for (const width of [320, 390, 768, 1440]) await check(`review1 custom calendar distinct targets ${width}`, () => scenario(async page => {
    await ready(page)
    await page.getByRole('button', { name: 'Custom (multi-date)', exact: true }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const days = page.locator('.public-lifecycle .grid-cols-7').filter({ has: page.locator('button') }).locator('button')
    await assertTargets(days)
    const boxes = await Promise.all((await days.all()).map(day => day.boundingBox()))
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]; const b = boxes[j]
      assert.ok(Math.min(a.x + a.width, b.x + b.width) <= Math.max(a.x, b.x) || Math.min(a.y + a.height, b.y + b.height) <= Math.max(a.y, b.y), `calendar dates ${i + 1}/${j + 1} must not overlap`)
    }
    const first = days.locator('xpath=self::*[not(@disabled)]').first()
    const second = days.locator('xpath=self::*[not(@disabled)]').nth(1)
    for (const day of [first, second]) {
      await day.scrollIntoViewIfNeeded()
      assert.equal(await day.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit === el || el.contains(hit) }), true, 'date owns its physical center target')
      const box = await day.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      assert.equal(await day.getAttribute('aria-pressed'), 'true')
      assert.ok((await day.getAttribute('aria-label')).length > 8, 'date has full accessible date')
    }
    await first.focus(); await page.keyboard.press('Enter'); assert.equal(await first.getAttribute('aria-pressed'), 'false'); assert.equal(await second.getAttribute('aria-pressed'), 'true')
    await assertNoOverflow(page); await capture(page, `review1-calendar-${width}`)
  }, { width, path: giftPath, gift: { ...submission, items: [{ ...item, claim: { ...request, status: 'approved', pickupAddressConfirmedByGiver: true, handoverStage: 'awaiting_schedule' } }] } }))

  await check('review1 visible dialog rebinds across same-component history and loading', () => scenario(async page => {
    await ready(page)
    await page.evaluate(() => { history.pushState({ ...history.state, idx: (history.state?.idx || 0) + 1, key: 'next-claim' }, '', '/account/claims/claim-next'); dispatchEvent(new PopStateEvent('popstate', { state: history.state })) })
    await page.getByRole('heading', { name: 'Second local claim', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Cancel claim', exact: true }).click(); await page.getByRole('dialog').waitFor()
    await page.goBack(); await page.locator('.public-lifecycle-loading').waitFor()
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden', 'loading without dialog must release scroll')
    await ready(page); await page.getByRole('dialog').waitFor()
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), true, 'the remounted visible dialog owns focus')
    for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab']) { await page.keyboard.press(key); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), true) }
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0)
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden')
    assert.equal(await page.evaluate(() => document.activeElement.isConnected && !document.activeElement.closest('[role=dialog]')), true)
    await page.getByRole('button', { name: 'Cancel claim', exact: true }).click()
    await page.evaluate(() => { history.pushState({ ...history.state, idx: (history.state?.idx || 0) + 1, key: 'account' }, '', '/account'); dispatchEvent(new PopStateEvent('popstate', { state: history.state })) })
    await page.getByRole('heading', { name: 'Your account', exact: true }).waitFor()
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden', 'unmount must release scroll')
    assert.equal(await page.evaluate(() => document.activeElement.matches('.public-header a')), true, 'removed route trigger returns focus to persistent navigation')
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.isConnected && !document.activeElement.closest('[role=dialog]')), true)
  }, { path: claimPath, fixtures: { 'GET /api/donor/item-requests/claim-local': fixtureResponse({ request }, { delayMs: 600 }), 'GET /api/donor/item-requests/claim-next': { request: { ...request, id: 'claim-next', item: { ...item, title: 'Second local claim' } } }, 'POST /api/donor/threads/open': req => { assert.ok(['claim-local', 'claim-next'].includes(req.postDataJSON().subjectId)); return thread } } }))

  await check('review1 terminal courier history never gives future instructions', async () => {
    for (const stage of ['handed_over', 'received']) for (const opsBookingStatus of ['booked', 'delivered']) for (const path of [claimPath, giftPath]) {
      const terminal = { ...request, status: 'approved', handoverStage: stage, pickupAddressConfirmedByGiver: true, dropAddressConfirmedByClaimer: true, agreedSlotAt: '2026-09-25T12:00:00.000Z', opsBookingStatus }
      await scenario(async page => {
        await ready(page); await page.getByText('Agreed time', { exact: true }).waitFor()
        const text = await scope(page).innerText()
        assert.doesNotMatch(text, /Reloved will book the courier|Be ready at the building gate|tap Handed over below|Reloved books the courier after you agree a time/)
        assert.equal(await page.getByRole('button', { name: 'Handed over', exact: true }).count(), 0)
        assert.equal(await page.getByRole('button', { name: 'Received', exact: true }).count(), Number(path === claimPath && stage === 'handed_over'))
        await capture(page, `review1-${path === claimPath ? 'claim' : 'gift'}-${stage}-${opsBookingStatus}`)
      }, { path, claim: terminal, gift: { ...submission, items: [{ ...item, claim: terminal }] } })
    }
  })
  console.log(`\n${passed} account/lifecycle checks passed; ${failures.length} failed.`)
  if (failures.length) throw new Error(failures.join('\n'))
})
