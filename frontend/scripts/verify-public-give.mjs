import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { withPublicBrowser, installFixtures, fixtureResponse, assertNoOverflow, assertPublicFonts, assertTargets } from './public-browser-harness.mjs'
const photo = '/images/wall-items/hunter-x-hunter-hisoka-tee.png'
const back = '/images/wall-items/hunter-x-hunter-hisoka-tee-back.png'
const evidence = '../.local-proof/task-3/public-give'
await mkdir(evidence, { recursive: true })
const item = { itemTitle: 'Graphic tee', category: 'Tops', gender: 'men', description: 'Cotton tee', condition: 'Good', size: 'M', quantity: 1, brand: '', age: '', defect: '' }
const fields = { ...item, firstName: 'Local', lastName: 'Fixture', phone: '9999999999', email: 'fixture@example.invalid', pickupLocality: 'Example building, Bandra 400050', pincode: '400050' }
const photos = [photo, back].map((storagePath, index) => ({ storagePath, previewUrl: storagePath, groupId: index, fileName: `fixture-${index}.png`, status: 'done' }))
const draft = (step = 1, extra = {}) => ({ step, formData: fields, photoItems: photos, uploadMode: 'bulk', activeGroupId: 0, itemDrafts: { 0: item, 1: { ...item, itemTitle: 'Second tee' } }, ...extra })
const profile = { name: 'Local Fixture', username: 'local-fixture', phone: fields.phone, email: fields.email, address: fields.pickupLocality, pincode: fields.pincode, onboardedAt: '2026-09-01' }
await withPublicBrowser(async (browser, baseURL) => {
  const failures = []; let passed = 0
  const check = async (name, run) => { if (process.env.GIVE_CHECK_FILTER && !name.includes(process.env.GIVE_CHECK_FILTER)) return; try { await run(); passed++; console.log(`PASS ${name}`) } catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name}: ${error.message}`) } }
  async function scenario(run, { width = 390, seed, signedIn = false, savedProfile = true, path = '/give', fixtures = {}, expectedErrors = [] } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' }); context.setDefaultTimeout(3000)
    context.setDefaultNavigationTimeout(15000)
    await context.addInitScript(({ seed, signedIn, origin }) => {
      if (window.top !== window || location.origin !== origin) return
      if (signedIn) localStorage.setItem('reloved_donor_token', 'local-browser-fixture-only')
      if (seed && !sessionStorage.getItem('give-fixture-seeded')) { localStorage.setItem('reloved_give_draft', JSON.stringify(seed)); sessionStorage.setItem('give-fixture-seeded', 'true') }
    }, { seed, signedIn, origin: new URL(baseURL).origin })
    const audit = await installFixtures(context, baseURL, { 'POST /api/analytics/events': { ok: true }, 'GET /api/donor/notifications/unread-count': { unreadCount: 0 }, 'GET /api/donor/notifications': { notifications: [], unreadCount: 0 }, 'GET /api/donor/profile': { profile: savedProfile ? profile : { ...profile, onboardedAt: null } }, ...fixtures })
    const page = await context.newPage()
    try {
      await page.goto(baseURL + path); await page.locator('h1').waitFor({ timeout: 15000 }); await run(page, audit); await assertNoOverflow(page)
      assert.deepEqual(audit.violations, [], 'all writes are explicit local fixtures')
      assert.deepEqual(audit.errors.filter(error => !expectedErrors.some(pattern => pattern.test(error))), [], 'no unexpected browser errors')
    } finally { await context.close() }
  }
  const stage = page => page.locator('.public-give-stage')
  const next = page => page.locator('.public-give-actions').getByRole('button', { name: /^Continue/ })
  async function capture(page, name) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }) }
  async function checkPhotos(page) {
    const images = stage(page).locator('img'); assert.ok(await images.count() > 0)
    for (const img of await images.all()) { assert.equal(await img.evaluate(el => getComputedStyle(el).objectFit), 'contain', 'complete source photo visible'); await img.evaluate(el => el.decode()) }
  }
  for (const width of [320, 390, 768, 1440]) {
    await check(`selected photos, groups, targets and progress ${width}`, () => scenario(async page => {
      assert.equal(await page.locator('.public-give').count(), 1, 'Give needs approved scoped layout')
      const progress = page.getByRole('list', { name: 'Drop progress' })
      assert.equal(await progress.getByRole('listitem').count(), 5); assert.equal(await progress.locator('[aria-current="step"]').innerText(), 'Photo')
      assert.equal(await progress.evaluate(el => el.scrollWidth <= el.clientWidth), true)
      assert.equal(await page.getByRole('button', { name: 'Multiple Items', exact: true }).getAttribute('aria-pressed'), 'true')
      const groups = page.locator('.public-give-photo-group'); assert.equal(await groups.count(), 2, 'photos grouped by item'); await checkPhotos(page)
      const box = await groups.first().locator('img').boundingBox(); assert.ok(box.height >= 140)
      await assertTargets(page.locator('.public-give button')); await assertPublicFonts(page)
      assert.equal(await page.locator('.public-give-actions').evaluate(el => getComputedStyle(el).position), 'static')
      assert.ok((await page.getByTestId('privacy-photo-notice').boundingBox()).y > box.y, 'photos before privacy guidance')
      await capture(page, `photos-${width}`)
    }, { width, seed: draft() }))
    await check(`details and review ${width}`, () => scenario(async page => {
      await page.getByRole('heading', { name: 'Item Details', exact: true }).waitFor()
      assert.equal(await page.getByLabel('Item Title *', { exact: true }).inputValue(), item.itemTitle)
      await page.getByRole('button', { name: /^Item 2/ }).click(); assert.equal(await page.getByLabel('Item Title *', { exact: true }).inputValue(), 'Second tee')
      await capture(page, `details-${width}`); await next(page).click(); await page.getByRole('heading', { name: 'Review your drop' }).waitFor()
      assert.equal(await page.locator('.public-give-review-item').count(), 2)
      for (const card of await page.locator('.public-give-review-item').all()) assert.equal(await card.locator('img').count(), 1)
      const handoverHeading = await stage(page).getByRole('heading', { name: 'Pickup & delivery' }).boundingBox()
      const editAddress = await page.getByRole('button', { name: 'Edit address', exact: true }).boundingBox()
      assert.ok(handoverHeading.x + handoverHeading.width + 8 <= editAddress.x || handoverHeading.y + handoverHeading.height + 8 <= editAddress.y, 'review heading and Edit address need visible separation')
      await checkPhotos(page); await assertTargets(page.locator('.public-give button')); await capture(page, `review-${width}`)
    }, { width, seed: draft(2), signedIn: true }))
    await check(`receipt reference and links ${width}`, () => scenario(async page => {
      const receipt = page.locator('.public-give-success'); assert.equal(await receipt.count(), 1, 'receipt needs approved scoped composition')
      assert.equal(await receipt.getByText('LOCAL-FIXTURE-ONLY', { exact: true }).count(), 1)
      for (const href of ['/account', '/drop']) assert.equal(await receipt.locator(`a[href="${href}"]`).count(), 1)
      assert.match(await receipt.innerText(), /Reloved covers courier for early rides/); await assertTargets(receipt.locator('a, button'))
      assert.equal(await receipt.evaluate(el => getComputedStyle(el.firstElementChild).boxShadow), 'none'); await capture(page, `success-${width}`)
    }, { width, path: '/give/success/LOCAL-FIXTURE-ONLY?logistics=porter_arranged' }))
  }
  await check('approved canvas, initial focus and full photo well', () => scenario(async page => {
    await stage(page).waitFor(); await page.waitForTimeout(250)
    assert.equal(await page.locator('.public-experience > .fixed[aria-hidden="true"]').isVisible(), false, 'Give uses the approved ivory canvas')
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'H2', 'initial visit must not force a heading focus ring')
    const tile = await page.locator('.public-give-photo-tile').first().boundingBox()
    const well = await page.locator('.public-give-photos').first().boundingBox()
    assert.ok(well.width - tile.width < 20, 'one-photo well uses full available width')
  }, { width: 1440, seed: draft() }))
  await check('empty photo step and camera/gallery semantics', () => scenario(async page => {
    assert.equal(await next(page).isDisabled(), true); assert.equal(await page.locator('input[type="file"][capture="environment"]').count(), 1)
    assert.equal(await page.locator('input[type="file"][multiple]').getAttribute('capture'), null); await assertTargets(page.locator('.public-give button')); await capture(page, 'empty-390')
  }))
  await check('group reassignment, mode conversion and keyboard remove', () => scenario(async page => {
    await page.getByRole('button', { name: 'Item 1 (1)', exact: true }).click()
    await page.getByRole('button', { name: 'Move photo 2 to Item 1', exact: true }).focus(); await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelectorAll('.public-give-photo-group').length === 1)
    assert.equal(await page.locator('.public-give-photo-group img').count(), 2)
    await page.getByRole('button', { name: 'One Item', exact: true }).click(); assert.equal(await page.getByRole('button', { name: 'One Item', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: 'Multiple Items', exact: true }).click(); assert.equal(await page.locator('.public-give-photo-group').count(), 2)
    await page.getByRole('button', { name: 'Remove photo 1', exact: true }).focus(); await page.keyboard.press('Enter')
    assert.equal(await page.locator('.public-give-photo-group img').count(), 1); await page.waitForTimeout(500)
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('reloved_give_draft')).photoItems.map(p => p.groupId)), [1], 'remove must not also regroup')
  }, { seed: draft() }))
  await check('single validation announced, labels and step focus', () => scenario(async page => {
    await page.getByRole('heading', { name: 'Item Details', exact: true }).waitFor(); await next(page).click()
    await page.getByRole('alert').filter({ hasText: 'Add title, for, and size (when required) before continuing.' }).waitFor()
    await page.getByLabel('Item Title *', { exact: true }).fill('Updated title'); await page.getByLabel('Size *', { exact: true }).selectOption('M'); await next(page).click()
    await page.getByRole('heading', { name: 'Sign in to post' }).waitFor(); await page.waitForFunction(() => document.activeElement?.tagName === 'H2')
    assert.match(await page.locator(':focus').innerText(), /Sign in to post/)
  }, { seed: draft(2, { uploadMode: 'single', photoItems: [photos[0]], formData: { ...fields, itemTitle: '', size: '' } }) }))
  await check('guest login exact draft and return URL', () => scenario(async page => {
    await page.getByRole('heading', { name: 'Item Details', exact: true }).waitFor(); await next(page).click(); await page.getByRole('heading', { name: 'Sign in to post' }).waitFor()
    await page.getByRole('button', { name: 'Sign in with email' }).click(); await page.waitForURL('**/account/login?redirect=%2Fgive')
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('reloved_give_draft')))
    assert.equal(stored.awaitingLogin, true); assert.equal(stored.step, 6); assert.equal(stored.formData.itemTitle, item.itemTitle); assert.deepEqual(stored.photoItems.map(p => p.groupId), [0, 1])
  }, { seed: draft(2) }))
  await check('login return and saved reassurance', () => scenario(async page => {
    await page.getByRole('heading', { name: 'Review your drop' }).waitFor(); await page.getByTestId('login-resume-note').filter({ hasText: 'Welcome back — your drop draft was restored.' }).waitFor()
    assert.deepEqual(await page.getByRole('list', { name: 'Drop progress' }).getByRole('listitem').allTextContents(), ['Photo', 'Details', 'Review', 'Post'])
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click(); assert.equal(await page.getByTestId('login-resume-note').count(), 0)
  }, { seed: draft(8, { awaitingLogin: true }), signedIn: true }))
  await check('incomplete profile retains You and onboarding return', () => scenario(async page => {
    await page.getByRole('heading', { name: 'Item Details', exact: true }).waitFor()
    assert.deepEqual(await page.getByRole('list', { name: 'Drop progress' }).getByRole('listitem').allTextContents(), ['Photo', 'Details', 'You', 'Review', 'Post'])
    await next(page).click(); await page.waitForURL('**/account/onboarding?redirect=%2Fgive')
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('reloved_give_draft')).awaitingLogin), true)
  }, { seed: draft(2), signedIn: true, savedProfile: false }))
  await check('terms, submission loading/failure/retry and single payload', async () => {
    const sent = []
    await scenario(async page => {
      await page.getByRole('heading', { name: 'Terms & submit' }).waitFor(); const submit = page.getByRole('button', { name: 'I Accept - Submit' })
      assert.equal(await submit.isDisabled(), true); await page.locator('#give-declaration').check(); assert.equal(await submit.isDisabled(), true); await page.locator('#give-terms').check(); await submit.click()
      await page.getByRole('button', { name: 'Submitting...' }).waitFor(); await page.getByRole('alert').filter({ hasText: 'Local fixture retry' }).waitFor()
      assert.equal(await page.evaluate(() => Boolean(localStorage.getItem('reloved_give_draft'))), true)
      await submit.click(); await page.waitForURL('**/give/success/LOCAL-POST?logistics=porter_arranged'); assert.equal(await page.evaluate(() => localStorage.getItem('reloved_give_draft')), null)
      assert.equal(sent.length, 2); assert.deepEqual(sent[0], sent[1]); assert.equal(sent[1].itemTitle, item.itemTitle)
      for (const [key, value] of Object.entries({ giverLogistics: 'porter_arranged', porterPaidBy: 'receiver', declaration: 'true', acceptedTerms: 'true', pickupLocality: fields.pickupLocality })) assert.equal(sent[1][key], value)
      assert.deepEqual(JSON.parse(sent[1].photoStoragePaths), [photo])
    }, { signedIn: true, seed: draft(7, { uploadMode: 'single', photoItems: [photos[0]] }), fixtures: { 'POST /api/donations': request => { sent.push(request.postDataJSON()); return sent.length === 1 ? fixtureResponse({ error: 'Local fixture retry' }, { status: 500, delayMs: 350 }) : { reference: 'LOCAL-POST', imageProcessingStatus: 'ready' } } }, expectedErrors: [/500 \(Internal Server Error\)/, /Error saving donation: Error: Local fixture retry/] })
  })
  await check('bulk submission preserves separate group photos and titles', async () => {
    const sent = []
    await scenario(async page => {
      await page.getByRole('heading', { name: 'Terms & submit' }).waitFor(); await page.locator('#give-declaration').check(); await page.locator('#give-terms').check(); await page.getByRole('button', { name: 'I Accept - Submit' }).click()
      await page.waitForURL('**/give/success/LOCAL-BULK-2?logistics=porter_arranged'); assert.deepEqual(sent.map(p => p.itemTitle), ['Graphic tee', 'Second tee']); assert.deepEqual(sent.map(p => JSON.parse(p.photoStoragePaths)), [[photo], [back]])
    }, { signedIn: true, seed: draft(7), fixtures: { 'POST /api/donations': request => { sent.push(request.postDataJSON()); return { reference: `LOCAL-BULK-${sent.length}`, imageProcessingStatus: 'ready' } } } })
  })
  await check('real photo selection/compression, catalog then cutout and skip', async () => {
    // Exercise both paths within the same regression: Skip must preserve a real
    // manual edit, while ordinary Continue must still apply the catalog title.
    for (const skip of [true, false]) {
      const modes = []
      let releaseCatalog
      const catalogGate = new Promise(resolve => { releaseCatalog = resolve })
      try {
        await scenario(async page => {
          const processingRequests = []
          page.on('request', request => {
            if (new URL(request.url()).pathname === '/api/donations/analyze-photos') processingRequests.push(request)
          })
          await page.locator('input[type="file"][multiple]').setInputFiles({ name: 'local-photo.png', mimeType: 'image/png', buffer: await readFile(`public${photo}`) })
          await page.getByRole('img', { name: 'Upload 1', exact: true }).waitFor()
          await next(page).click()
          await page.getByRole('button', { name: 'AI reading photos…', exact: true }).waitFor()
          const expectedTitle = skip ? 'My manually entered title' : 'AI title'
          if (skip) {
            await page.getByTestId('skip-autofill').click()
            await page.getByLabel('Item Title *', { exact: true }).fill(expectedTitle)
          }
          // Hold catalog completion until after the manual edit, so the test
          // cannot accidentally exercise only an already-completed request.
          const cutoutResponse = page.waitForResponse(response => {
            const url = new URL(response.url())
            return url.pathname === '/api/donations/analyze-photos' && url.searchParams.get('mode') === 'cutout'
          })
          releaseCatalog()
          assert.equal(await (await cutoutResponse).finished(), null)
          await Promise.all(processingRequests.map(async request => {
            const response = await request.response()
            assert.ok(response?.ok(), 'catalog and cutout responses must succeed')
            assert.equal(await response.finished(), null)
          }))
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          await page.waitForFunction(title => {
            const saved = JSON.parse(localStorage.getItem('reloved_give_draft') || 'null')
            return saved?.formData.itemTitle === title && saved?.step === 2
          }, expectedTitle)
          assert.deepEqual(modes, ['catalog', 'cutout'])
          assert.equal(await page.getByRole('heading', { name: 'Item Details', exact: true }).count(), 1)
          assert.equal(await page.getByLabel('Item Title *', { exact: true }).inputValue(), expectedTitle)
          const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('reloved_give_draft')))
          assert.equal(saved.formData.itemTitle, expectedTitle, 'completed enrichment preserves the correct persisted title')
          assert.equal(saved.step, 2, 'both paths persist Details, without an extra advance')
        }, { fixtures: { 'POST /api/donations/analyze-photos': async request => {
          const mode = new URL(request.url()).searchParams.get('mode')
          modes.push(mode)
          assert.match(request.headers()['content-type'], /multipart\/form-data/)
          assert.match(request.postData(), /name="photos"; filename="give-0\./)
          assert.match(request.postData(), /name="mode"/)
          if (mode === 'catalog') await catalogGate
          return { results: [{ ok: true, originalName: 'give-0.png', storagePath: photo, suggestion: { ...item, title: 'AI title' }, bgRemoved: mode === 'cutout' }] }
        } } })
      } finally { releaseCatalog() }
    }
  })
  await check('AI failure supports manual details and a successful retry', async () => {
    const modes = []
    await scenario(async page => {
      await page.getByRole('button', { name: 'Multiple Items', exact: true }).click()
      await page.locator('input[type="file"][multiple]').setInputFiles(await Promise.all([photo, back].map(async (path, i) => ({ name: `local-${i}.png`, mimeType: 'image/png', buffer: await readFile(`public${path}`) }))))
      await page.getByRole('img', { name: 'Upload 2', exact: true }).waitFor(); await next(page).click()
      await page.getByRole('heading', { name: 'Item Details', exact: true }).waitFor()
      await page.getByTestId('multi-incomplete-hint').filter({ hasText: 'still need a TITLE' }).waitFor()
      await page.getByTestId('retry-ai-remaining').click()
      await page.waitForFunction(() => document.querySelector('#give-title')?.value === 'Recovered 1')
      await page.getByRole('button', { name: /^Item 2/ }).click()
      assert.equal(await page.getByLabel('Item Title *', { exact: true }).inputValue(), 'Recovered 2')
      assert.deepEqual(modes, ['catalog', 'cutout', 'full'])
      await next(page).click(); await page.getByRole('heading', { name: 'Sign in to post' }).waitFor()
    }, { fixtures: { 'POST /api/donations/analyze-photos': request => {
      const mode = new URL(request.url()).searchParams.get('mode'); modes.push(mode)
      return fixtureResponse({ results: [0, 1].map(i => mode === 'full'
        ? { ok: true, originalName: `give-${i}.png`, storagePath: i ? back : photo, suggestion: { ...item, title: `Recovered ${i + 1}` }, bgRemoved: true }
        : { ok: false, originalName: `give-${i}.png`, error: 'Local fixture unavailable' }) }, { delayMs: 250 })
    } } })
  })
  await check('session expiry keeps consent and draft for login return', () => scenario(async page => {
    await page.getByRole('heading', { name: 'Terms & submit' }).waitFor(); await page.locator('#give-declaration').check(); await page.locator('#give-terms').check()
    await page.getByRole('button', { name: 'I Accept - Submit' }).click(); await page.waitForURL('**/account/login?redirect=%2Fgive')
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('reloved_give_draft')))
    assert.equal(stored.awaitingLogin, true); assert.equal(stored.step, 7); assert.equal(stored.formData.acceptedTerms, true); assert.equal(stored.photoItems.length, 1)
  }, { signedIn: true, seed: draft(7, { uploadMode: 'single', photoItems: [photos[0]] }), fixtures: { 'POST /api/donations': fixtureResponse({ error: 'Unauthorized session' }, { status: 401 }) }, expectedErrors: [/401 \(Unauthorized\)/, /Error saving donation: Error: Unauthorized session/] }))
  await check('saved draft refresh and Start fresh preserve existing storage semantics', () => scenario(async page => {
    await page.getByRole('heading', { name: 'Item Details', exact: true }).waitFor(); await page.getByLabel('Item Title *', { exact: true }).fill('Saved local edit')
    await page.waitForTimeout(550); await page.reload(); await page.getByRole('heading', { name: 'Item Details', exact: true }).waitFor()
    assert.equal(await page.getByLabel('Item Title *', { exact: true }).inputValue(), 'Saved local edit')
    await page.getByTestId('login-resume-note').filter({ hasText: 'Draft restored — continue where you left off.' }).waitFor()
    await page.getByTestId('clear-give-draft').click(); await page.getByRole('heading', { name: 'Drop something. Pass it on.' }).waitFor()
    assert.equal(await page.evaluate(() => localStorage.getItem('reloved_give_draft')), null); assert.equal(await next(page).isDisabled(), true)
  }, { signedIn: true, seed: draft(2) }))
  await check('You fields and recognition retain contact validation and privacy options', () => scenario(async page => {
    await page.getByRole('heading', { name: 'Donor Details', exact: true }).waitFor()
    assert.equal(await next(page).isDisabled(), true)
    await page.getByLabel('First Name *', { exact: true }).fill('Local')
    assert.equal(await next(page).isDisabled(), false, 'authenticated contact remains valid')
    await page.getByLabel('Keep me anonymous', { exact: true }).check(); assert.equal(await page.getByLabel('Keep me anonymous', { exact: true }).isChecked(), true)
    await assertTargets(page.locator('.public-give button, .public-give label:has(input[type=radio])'))
    await capture(page, 'you-390')
  }, { signedIn: true, savedProfile: false, seed: draft(3, { formData: { ...fields, firstName: '', phone: '', email: '' } }) }))
  await check('200% text, reduced motion, focus and keyboard-height viewport', () => scenario(async page => {
    await stage(page).waitFor(); await page.addStyleTag({ content: 'html { font-size: 200%; }' }); await assertNoOverflow(page); await capture(page, 'text-200-390')
    await page.getByRole('button', { name: 'One Item', exact: true }).focus(); await page.keyboard.press('Tab'); assert.ok(parseFloat(await page.locator(':focus').evaluate(el => getComputedStyle(el).outlineWidth)) >= 2)
    assert.equal(await stage(page).evaluate(el => el.getAnimations({ subtree: true }).some(a => a.playState === 'running')), false)
    await page.setViewportSize({ width: 390, height: 360 }); await next(page).scrollIntoViewIfNeeded(); const box = await next(page).boundingBox(); assert.ok(box.y >= 0 && box.y + box.height <= 360)
  }, { seed: draft() }))
  console.log(`${passed} Give checks passed; ${failures.length} failed`); assert.deepEqual(failures, [], 'Public Give checks failed')
})
