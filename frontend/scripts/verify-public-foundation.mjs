import assert from 'node:assert/strict'
import { withPublicBrowser, installFixtures, assertNoOverflow, assertPublicFonts, assertTargets } from './public-browser-harness.mjs'

await withPublicBrowser(async (browser, baseURL) => {
  const failures = []
  const check = async (name, run) => {
    try { await run(); console.log(`PASS ${name}`) }
    catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name}: ${error.message}`) }
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
  context.setDefaultTimeout(5000)
  const audit = await installFixtures(context, baseURL, { 'POST /api/analytics/events': { ok: true } })
  const page = await context.newPage()
  await page.goto(`${baseURL}/about`)
  await page.locator('h1').waitFor()
  await check('public scope and loaded fonts', async () => {
    assert.equal(await page.locator('.public-experience').count(), 1, 'public route needs opt-in wrapper')
    await assertPublicFonts(page)
  })
  await check('approved header/footer marks and destination preservation', async () => {
    assert.equal(await page.locator('header img[src*="RELOVED_Primary_Wordmark_Black"]').count(), 1)
    assert.equal(await page.locator('footer img[src*="RELOVED_Signature_Badge"]').count(), 1)
    for (const href of ['/drop', '/give', '/track', '/map', '/love', '/about', '/partner', '/faq', '/contact', '/standards', '/privacy', '/terms']) {
      assert.ok(await page.locator(`footer a[href="${href}"]`).count(), `Missing footer destination ${href}`)
    }
    await assertTargets(page.locator('header a, header button, footer a'))
  })
  await check('visible keyboard focus', async () => {
    await page.keyboard.press('Tab')
    const outline = await page.locator(':focus').evaluate(el => getComputedStyle(el).outlineWidth)
    assert.ok(parseFloat(outline) >= 2, `Expected 2px focus outline, got ${outline}`)
  })
  await check('responsive shell and mobile focus/scroll behavior', async () => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await assertNoOverflow(page)
      await assertTargets(page.locator('header a, header button, footer a'))
    }
    await page.setViewportSize({ width: 390, height: 844 })
    const trigger = page.getByRole('button', { name: 'Open menu' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Site menu' })
    await dialog.waitFor()
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'focus must enter menu')
    const controls = dialog.locator('a, button')
    await assertTargets(controls)
    await controls.last().focus()
    await page.keyboard.press('Tab')
    assert.equal(await controls.first().evaluate(el => el === document.activeElement), true, 'forward focus wraps')
    await page.keyboard.press('Shift+Tab')
    assert.equal(await controls.last().evaluate(el => el === document.activeElement), true, 'backward focus wraps')
    assert.equal(await dialog.evaluate(el => el.getAnimations().length), 0, 'reduced motion disables sheet animation')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'focus returns to menu trigger')
    assert.equal(await page.evaluate(() => document.body.style.overflow), '')
    await trigger.click()
    await page.getByRole('dialog').getByRole('link', { name: 'Wall of Kindness', exact: true }).click()
    await page.waitForURL('**/drop')
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => document.body.style.overflow), '')
  })
  await check('contextual primary action', async () => {
    await page.goto(`${baseURL}/give`)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.locator('header').waitFor()
    assert.equal(await page.locator('header a[href="/give"]').count(), 0, 'Give route must not repeat its current primary action')
  })
  await check('excluded donor and partner routes retain original typography and scope', async () => {
    for (const path of ['/account/login', '/account/onboarding', '/partner/login', '/admin/login']) {
      await page.goto(`${baseURL}${path}`)
      await page.locator('input').first().waitFor()
      assert.equal(await page.locator('.public-experience').count(), 0)
      assert.doesNotMatch(await page.locator('input').first().evaluate(el => getComputedStyle(el).fontFamily), /Reloved Public/)
    }
    await page.goto(`${baseURL}/give/not-a-route`)
    await page.getByRole('heading', { name: '404' }).waitFor()
    assert.equal(await page.locator('.public-experience').count(), 0, 'recovery 404 must remain excluded even under a public prefix')
  })
  await check('network and console safety', async () => {
    assert.deepEqual(audit.violations, [])
    assert.deepEqual(audit.errors, [])
  })
  await context.close()
  assert.deepEqual(failures, [], 'Public foundation checks failed')
})
