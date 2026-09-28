import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { withPublicBrowser, installFixtures, fixtureResponse, assertNoOverflow, assertTargets } from './public-browser-harness.mjs'

const photo = '/images/wall-items/hunter-x-hunter-hisoka-tee.png'
const back = '/images/wall-items/hunter-x-hunter-hisoka-tee-back.png'
const inventory = ['available', 'being_matched', 'claimed', 'available'].map((publicStatus, index) => ({
  id: `fixture-${index}`, slug: `fixture-${index}`, title: index === 3 ? 'Cotton trousers' : `Graphic tee ${index + 1}`,
  category: index === 3 ? 'Bottoms' : 'Tops', gender: 'men', condition: index === 3 ? 'Excellent' : 'Good',
  locality: 'Bandra West', size: 'M', quantity: 1, publicStatus,
  description: 'Small mark near the hem. See both photographs.', giverLogistics: 'receiver_collects',
  images: [{ storagePath: photo }, { storagePath: back }],
}))
const widths = [320, 390, 768, 1440]
const evidence = '../.local-proof/task-2/public-browse'
await mkdir(evidence, { recursive: true })

async function capture(page, name, fullPage = false) {
  await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage })
}

await withPublicBrowser(async (browser, baseURL) => {
  const failures = []
  const check = async (name, run) => {
    try { await run(); console.log(`PASS ${name}`) }
    catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name}: ${error.message}`) }
  }
  async function scenario(width, path, fixtures, run, { signedIn = false, expectedFailure = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
    context.setDefaultTimeout(3000)
    await context.addInitScript(({ signedIn, appOrigin }) => {
      // Session fixtures belong only to the app document, never sandbox frames.
      if (window.top !== window || location.origin !== appOrigin) return
      if (signedIn) localStorage.setItem('reloved_donor_token', 'local-browser-fixture-only')
      // Keep geolocation deterministic and prove the ordinary guest path.
      navigator.geolocation.getCurrentPosition = (_success, failure) => failure({ code: 1, message: 'Fixture denied' })
    }, { signedIn, appOrigin: new URL(baseURL).origin })
    const audit = await installFixtures(context, baseURL, {
      'POST /api/analytics/events': { ok: true },
      'GET /api/donor/notifications/unread-count': { unreadCount: 0 },
      'GET /api/donor/notifications': { notifications: [], unreadCount: 0 },
      'GET /api/donor/profile': { profile: { onboardedAt: '2026-09-01', phone: '9999999999', email: 'fixture@example.invalid' } },
      'GET /api/donor/item-requests': { weeklyUsed: 2, weeklyLimit: 2 },
      ...fixtures,
    })
    const page = await context.newPage()
    try {
      await page.goto(`${baseURL}${path}`)
      await page.locator('h1').waitFor()
      await run(page, audit)
      await assertNoOverflow(page)
      assert.deepEqual(audit.violations, [], 'no unfulfilled or unapproved external requests')
      assert.deepEqual(audit.requests.filter(key => !key.startsWith('GET ') && key !== 'POST /api/analytics/events'), [], 'no product writes')
      const unexpectedErrors = expectedFailure ? audit.errors.filter(error =>
        !error.includes('503 (Service Unavailable)') && !error.includes('Failed to load Wall of Kindness items: Error: Fixture unavailable')) : audit.errors
      assert.deepEqual(unexpectedErrors, [], 'no unexpected browser errors')
    } finally { await context.close() }
  }

  async function checkCards(page, scope = page) {
    const cards = scope.locator('.public-item-card')
    assert.ok(await cards.count() > 0, 'image-led public item cards must be present')
    for (const card of await cards.all()) {
      const img = card.locator('img')
      await img.scrollIntoViewIfNeeded()
      await img.evaluate(el => el.decode())
      assert.equal(await img.evaluate(el => getComputedStyle(el).objectFit), 'contain')
      assert.match(await img.getAttribute('src'), /^\/images\/wall-items\/thumbs\//, 'card preserves the resolved original photo, without canvas cropping')
      assert.equal(await card.locator(':scope > div').evaluate(el => getComputedStyle(el).borderWidth), '1px')
      const shadow = await card.locator(':scope > div').evaluate(el => getComputedStyle(el).boxShadow)
      assert.ok(!shadow.includes('0px 0px'), `card has no hard offset shadow: ${shadow}`)
    }
  }

  for (const width of widths) {
    for (const [name, items] of [['normal', inventory], ['sparse', inventory.slice(0, 1)], ['empty', []]]) {
      await check(`Home ${name} ${width}`, () => scenario(width, '/', {
        'GET /api/items': request => ({ items: new URL(request.url()).searchParams.get('status') === 'reloved' ? [] : items }),
      }, async page => {
        const hero = page.locator('.public-home-hero')
        assert.equal(await hero.count(), 1, 'Home retains its scoped wall hero')
        assert.equal(await hero.getByRole('heading', { name: 'The Digital Wall of Kindness' }).count(), 1)
        assert.equal(await hero.locator('.public-item-card').count(), items.filter(item => item.publicStatus === 'available').length)
        await assertTargets(hero.locator('a, button'))
        assert.equal(await hero.locator('a[href="/give"]').count(), 1)
        assert.equal(await hero.locator('a[href="/drop"]').count(), 1)
        if (items.length) await checkCards(page, hero)
        if (name === 'sparse') {
          const card = await hero.locator('.public-item-card').boundingBox()
          assert.ok(Math.abs(card.x + card.width / 2 - width / 2) < 4, 'single item centered without phantom columns')
        }
        if (name === 'empty') assert.equal(await hero.locator('.public-hero-grid').count(), 0, 'empty hero omits vacant inventory grid')
        if (width === 390 || width === 1440) await capture(page, `home-${name}-${width}`)
      }))
    }

    await check(`Wall cards, search, filters and sheet ${width}`, () => scenario(width, '/wall', { 'GET /api/items': { items: inventory } }, async page => {
      await page.getByRole('heading', { name: 'Graphic tee 1', exact: true }).waitFor()
      await checkCards(page)
      const trigger = page.getByRole('button', { name: /^Filter/ })
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: 'Narrow results' })
      await dialog.waitFor()
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'focus enters filter panel')
      const controls = dialog.locator('button, select')
      await assertTargets(controls)
      if (width < 640) {
        assert.equal(await dialog.evaluate(el => el.matches(':modal')), true, 'mobile filter must make background inert')
        assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
        await controls.last().focus()
        await page.keyboard.press('Tab')
        assert.equal(await controls.first().evaluate(el => el === document.activeElement), true)
      }
      await dialog.getByLabel('Category', { exact: true }).selectOption('Bottoms')
      await page.getByRole('button', { name: 'Done · 1', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'focus returns to filter trigger')
      assert.equal(await page.evaluate(() => document.body.style.overflow), '')
      assert.equal(await page.locator('.public-item-card').count(), 1)
      await page.getByRole('button', { name: 'Clear', exact: true }).click()
      await page.getByRole('heading', { name: 'Graphic tee 1', exact: true }).waitFor()
      await trigger.click()
      await dialog.getByLabel('For', { exact: true }).selectOption('Men')
      await dialog.getByLabel('Size', { exact: true }).selectOption('M')
      await dialog.getByLabel('Condition', { exact: true }).selectOption('Good')
      await page.getByRole('button', { name: 'Done · 3', exact: true }).waitFor()
      await dialog.getByRole('button', { name: /^Nearby/ }).click()
      assert.equal(await dialog.getByRole('button', { name: /^Nearby/ }).getAttribute('aria-pressed'), 'true')
      await page.keyboard.press('Escape')
      await page.getByText('Share your location (or finish onboarding with a building) to filter giver-sends within 3 km.', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Clear', exact: true }).click()
      await page.getByRole('heading', { name: 'Cotton trousers', exact: true }).waitFor()
      if (width < 640) {
        await trigger.click()
        await page.setViewportSize({ width: 768, height: 900 })
        await dialog.waitFor({ state: 'detached' })
        assert.equal(await page.evaluate(() => document.body.style.overflow), '')
        assert.equal(await page.locator(':modal').count(), 0, 'resize removes mobile inertness')
        await page.setViewportSize({ width, height: 900 })
      }
      await page.getByRole('searchbox', { name: 'Search the Wall' }).fill('does-not-exist')
      await page.getByRole('heading', { name: 'No items match', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Clear all', exact: true }).click()
      await page.getByRole('heading', { name: 'Graphic tee 1', exact: true }).waitFor()
      assert.equal(await page.locator('.public-item-card').count(), 4)
      for (const label of ['Being Matched', 'Claimed']) assert.ok(await page.locator('.public-item-card').getByText(label, { exact: true }).count())
      if (width === 390 || width === 1440) await capture(page, `wall-${width}`, true)
    }))
    await check(`Wall loading ${width}`, () => scenario(width, '/drop', { 'GET /api/items': fixtureResponse({ items: inventory }, { delayMs: 1200 }) }, async page => {
      await page.getByRole('status', { name: 'Loading items' }).waitFor()
      await page.getByRole('heading', { name: 'Graphic tee 1', exact: true }).waitFor()
    }))
    let failWall = true
    await check(`Wall failure ${width}`, () => scenario(width, '/drop', { 'GET /api/items': () => failWall ? fixtureResponse({ error: 'Fixture unavailable' }, { status: 503 }) : { items: inventory } }, async page => {
      await page.getByRole('alert').waitFor()
      assert.equal(await page.getByRole('heading', { name: 'No items on the wall yet' }).count(), 0, 'failure is not empty inventory')
      failWall = false
      await page.getByRole('button', { name: 'Try again', exact: true }).click()
      await page.getByRole('heading', { name: 'Graphic tee 1', exact: true }).waitFor()
      assert.equal(await page.getByRole('alert').count(), 0, 'retry replaces error with inventory')
    }, { expectedFailure: true }))

    for (const [name, overrides, action] of [
      ['available', {}, 'Claim this item'], ['matched', { publicStatus: 'being_matched' }, 'Already matched'],
      ['claimed', { publicStatus: 'claimed' }, 'Already matched'], ['unavailable', { publicStatus: 'withdrawn' }, 'No longer available'],
      ['owner', { isOwnListing: true }, 'This is your listing'], ['limit', {}, 'Weekly claim limit reached'],
      ['long-title', { title: 'Graphic tee with a deliberately long title and detailed original condition information for the next person' }, 'Claim this item'],
    ]) {
      await check(`Item ${name} ${width}`, () => scenario(width, '/drop/fixture-0', { 'GET /api/items/fixture-0': { item: { ...inventory[0], ...overrides } } }, async page => {
        const gallery = page.locator('.public-item-gallery')
        assert.equal(await gallery.count(), 1, 'detail has a deliberate gallery region')
        const cta = page.getByRole('button', { name: action, exact: true })
        assert.equal(await cta.isDisabled(), !['available', 'long-title'].includes(name))
        if (name === 'unavailable') {
          assert.equal(await page.locator('.public-item-summary').getByText('Withdrawn', { exact: true }).count(), 1, 'withdrawn summary must not advertise availability')
          assert.equal(await page.locator('.public-item-summary').getByText('Available', { exact: true }).count(), 0)
        }
        await assertTargets(page.locator('.public-item-detail button, .public-item-detail a'))
        await page.getByRole('button', { name: 'Next photo', exact: true }).click()
        assert.match(await gallery.locator('img').first().getAttribute('src'), /hisoka-tee-back/)
        assert.equal(await page.getByRole('button', { name: 'Photo 2', exact: true }).getAttribute('aria-pressed'), 'true')
        await page.getByRole('button', { name: 'Photo 1', exact: true }).click()
        if (width < 1024) {
          const button = await cta.boundingBox()
          const facts = await page.locator('.public-item-facts').boundingBox()
          assert.ok(button.y < facts.y, 'mobile decision precedes secondary facts')
        }
        if (name === 'available' && [390, 1440].includes(width)) await capture(page, `item-${width}`, true)
        if (name === 'available') {
          await cta.click()
          await page.waitForURL('**/account/login?redirect=%2Fdrop%2Ffixture-0')
        }
      }, { signedIn: name === 'limit' }))
    }
  }
  assert.deepEqual(failures, [], 'Public browse checks failed')
})
