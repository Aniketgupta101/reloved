import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { withPublicBrowser, installFixtures } from './public-browser-harness.mjs'
const evidence = '../.local-proof/task-6/header-pressure'
await mkdir(evidence, { recursive: true })
const widths = [767, 768, 769, 1199, 1200, 1201, 1279, 1280, 1281, 1439, 1440, 1441]
const profile = { name: 'Local Fixture', username: 'local-fixture', email: 'fixture@example.invalid', phone: '9999999999', onboardedAt: '2026-09-01' }
await withPublicBrowser(async (browser, baseURL) => {
  const failures = []; let passed = 0
  async function scenario(name, run, { width = 1200, scale = 1, path = '/contact' } = {}) {
    if (process.env.HEADER_CHECK_FILTER && !name.includes(process.env.HEADER_CHECK_FILTER)) return
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
    context.setDefaultTimeout(4000); context.setDefaultNavigationTimeout(15000)
    await context.addInitScript(origin => { if (location.origin === origin) localStorage.setItem('reloved_donor_token', 'local-browser-fixture-only') }, new URL(baseURL).origin)
    const audit = await installFixtures(context, baseURL, {
      'POST /api/analytics/events': { ok: true }, 'GET /api/donor/profile': { profile },
      'GET /api/donor/submissions': { submissions: [] }, 'GET /api/donor/item-requests': { requests: [] },
      'GET /api/donor/incoming-claims': { claims: [] }, 'GET /api/donor/notifications': { notifications: [], unreadCount: 0 },
      'GET /api/donor/notifications/unread-count': { unreadCount: 0 },
    })
    const page = await context.newPage()
    try {
      await page.goto(baseURL + path); await page.locator('h1').first().waitFor()
      await page.evaluate(() => document.fonts.ready)
      if (scale === 2) await page.evaluate(() => {
        const values = [...document.querySelectorAll('.public-experience, .public-experience *')].map(el => [el, getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight])
        for (const [el, size, line] of values) { el.style.fontSize = `${parseFloat(size) * 2}px`; if (line.endsWith('px')) el.style.lineHeight = `${parseFloat(line) * 2}px` }
      })
      await run(page)
      assert.deepEqual(audit.errors, []); assert.deepEqual(audit.violations, [])
      passed++; console.log(`PASS ${name}`)
    } catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name}: ${error.message}`) }
    finally { await context.close() }
  }
  async function bounds(page, selector = '.public-header') {
    const defects = await page.locator(selector).evaluate(root => {
      const errors = []
      for (const el of root.querySelectorAll('a, button')) {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue
        const name = el.getAttribute('aria-label') || el.textContent.trim() || 'brand'
        if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) errors.push(`${name} control outside viewport: ${r.left}..${r.right}`)
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
          const node = walker.currentNode; if (!node.textContent.trim()) continue
          const range = document.createRange(); range.selectNodeContents(node)
          for (const text of range.getClientRects()) if (text.width && (text.left < Math.max(0, r.left) - 1 || text.right > Math.min(innerWidth, r.right) + 1 || text.top < r.top - 1 || text.bottom > r.bottom + 1)) errors.push(`${name} text clipped`)
        }
      }
      return errors
    })
    assert.deepEqual(defects, [], 'all visible navigation controls and text fit')
  }
  async function openMenu(page) {
    await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Site menu' }); await dialog.waitFor()
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true)
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
    const controls = dialog.locator('a, button'); await controls.last().focus(); await page.keyboard.press('Tab')
    assert.equal(await controls.first().evaluate(el => el === document.activeElement), true)
    await page.keyboard.press('Shift+Tab'); assert.equal(await controls.last().evaluate(el => el === document.activeElement), true)
    return dialog
  }
  for (const width of widths) for (const scale of [1, 2]) await scenario(`header bounds ${width} at ${scale * 100}%`, async page => {
    await bounds(page)
    assert.equal(await page.getByRole('navigation', { name: 'Main navigation', exact: true }).isVisible() || await page.getByRole('button', { name: 'Open menu', exact: true }).isVisible(), true)
    if ([768, 1200, 1440].includes(width)) await page.screenshot({ path: `${evidence}/contact-${width}-text-${scale * 100}.png` })
  }, { width, scale })
  await scenario('normal breakpoint menu resize cleanup', async page => {
    const dialog = await openMenu(page); await page.setViewportSize({ width: 1200, height: 900 })
    await dialog.waitFor({ state: 'detached' }); assert.equal(await page.evaluate(() => document.body.style.overflow), '')
    assert.equal(await page.evaluate(() => document.body.hasAttribute('data-mobile-menu')), false)
    assert.equal(await page.locator(':modal').count(), 0); await bounds(page)
    assert.equal(await page.locator('.public-header .public-brand').evaluate(el => el === document.activeElement), true)
  }, { width: 768 })
  await scenario('enlarged menu stays usable on resize then restores desktop focus', async page => {
    const dialog = await openMenu(page)
    for (const width of [1200, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await bounds(page)
      assert.equal(await page.getByRole('button', { name: 'Open menu', exact: true }).isVisible(), true)
      assert.equal(await dialog.isVisible(), true); assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
    }
    await page.evaluate(() => { for (const el of document.querySelectorAll('.public-experience, .public-experience *')) { el.style.removeProperty('font-size'); el.style.removeProperty('line-height') } })
    await dialog.waitFor({ state: 'detached' }); assert.equal(await page.evaluate(() => document.body.style.overflow), '')
    assert.equal(await page.locator('.public-header .public-brand').evaluate(el => el === document.activeElement), true)
    await bounds(page)
  }, { width: 768, scale: 2 })
  for (const scale of [1, 2]) for (const [path, target] of [['/contact', '/give'], ['/give', null], ['/account', '/drop']]) await scenario(`contextual CTA ${path} at ${scale * 100}%`, async page => {
    let scope = page.locator('.public-header')
    if (await page.getByRole('button', { name: 'Open menu', exact: true }).isVisible()) scope = await openMenu(page)
    const primary = scope.locator('.public-nav-primary')
    assert.equal(await primary.count(), target ? 1 : 0)
    if (target) { assert.equal(await primary.getAttribute('href'), target); assert.equal(await primary.isVisible(), true) }
    await bounds(page, await page.getByRole('dialog').count() ? '.public-menu' : '.public-header')
    if (await page.getByRole('dialog').count()) {
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' })
      assert.equal(await page.evaluate(() => document.body.style.overflow), '')
      assert.equal(await page.getByRole('button', { name: 'Open menu', exact: true }).evaluate(el => el === document.activeElement), true)
    }
  }, { scale, path })
  console.log(`${passed} header checks passed; ${failures.length} failed`)
  assert.deepEqual(failures, [])
})
