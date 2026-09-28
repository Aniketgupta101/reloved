import assert from 'node:assert/strict'
import { mkdir, writeFile, rename } from 'node:fs/promises'
import { withPublicBrowser, installFixtures, assertNoOverflow, assertPublicFonts } from './public-browser-harness.mjs'

// Synthetic local fixtures. This runner never connects an account or service.
const evidence = '../Docs/UI_UX_IMPLEMENTATION_EVIDENCE'
await mkdir(evidence, { recursive: true })
const photo = '/images/wall-items/hunter-x-hunter-hisoka-tee.png'
const back = '/images/wall-items/hunter-x-hunter-hisoka-tee-back.png'
const item = { id: 'item-local', slug: 'local-tee', title: 'Graphic cotton tee', category: 'Tops', condition: 'Good', size: 'M', gender: 'unisex', quantity: 1, status: 'approved', publicStatus: 'available', publicVisibility: true, imageProcessingStatus: 'ready', locality: 'Bandra West', giverLogistics: 'receiver_collects', description: 'Small mark near the hem. See both photographs.', images: [{ storagePath: photo }, { storagePath: back }] }
const profile = { id: 'donor-local', name: 'Local Fixture', username: 'local-fixture', phone: '9999999999', email: 'fixture@example.invalid', address: 'Example building, Bandra', pincode: '400050', gender: 'unisex', onboardedAt: '2026-09-01' }
const claim = { id: 'claim-local', status: 'pending', createdAt: '2026-09-25', giverLogistics: 'porter_arranged', pickupLocality: 'Example gate, Bandra 400050', requesterName: 'Local Receiver', requesterUsername: 'receiver', submissionId: 'gift-local', item }
const gift = { id: 'gift-local', reference: 'RL-LOCAL-ONLY', status: 'approved', submittedAt: '2026-09-25', giverLogistics: 'porter_arranged', address: 'Example gate, Bandra 400050', items: [item] }
const fields = { itemTitle: item.title, category: 'Tops', gender: 'men', description: 'Cotton tee', condition: 'Good', size: 'M', quantity: 1, brand: '', age: '', defect: '', firstName: 'Local', lastName: 'Fixture', phone: profile.phone, email: profile.email, pickupLocality: 'Example building, Bandra 400050', pincode: '400050' }
const draft = { step: 1, formData: fields, photoItems: [photo, back].map((storagePath, index) => ({ storagePath, previewUrl: storagePath, groupId: 0, fileName: `fixture-${index}.png`, status: 'done' })), uploadMode: 'single', activeGroupId: 0, itemDrafts: { 0: fields } }
const thread = { thread: { id: 'thread-local', itemTitle: item.title, unreadForOwner: false }, messages: [] }
const fixtures = {
  'POST /api/analytics/events': { ok: true },
  'GET /api/items': request => ({ items: new URL(request.url()).searchParams.get('status') === 'reloved' ? [{ ...item, publicStatus: 'reloved', status: 'reloved' }] : [item] }),
  'GET /api/items/local-tee': { item },
  'GET /api/donor/profile': { profile },
  'GET /api/donor/submissions': { submissions: [gift] },
  'GET /api/donor/item-requests': { requests: [claim], weeklyUsed: 1, weeklyLimit: 2 },
  'GET /api/donor/item-requests/claim-local': { request: claim },
  'GET /api/donor/incoming-claims': { claims: [claim] },
  'GET /api/donor/notifications': { notifications: [], unreadCount: 0 },
  'GET /api/donor/notifications/unread-count': { unreadCount: 0 },
  'GET /api/track/RL-LOCAL-ONLY': { submission: gift },
  'POST /api/donor/threads/open': thread,
  'GET /api/donor/threads/thread-local': thread,
}
const families = [
  ['home', '/', '.public-home'], ['wall', '/wall', '.public-wall'],
  ['item', '/wall/local-tee', '.public-item-gallery'], ['give', '/give', '.public-give-stage'],
  ['account', '/account?tab=giving', '.public-account'], ['claim', '/account/claims/claim-local', '.public-lifecycle'],
  ['gift', '/account/gifts/gift-local?item=item-local', '.public-lifecycle'],
  ['track', '/track/RL-LOCAL-ONLY', '.public-track-items'], ['faq', '/faq', '.public-support'],
  ['story', '/about', '.public-support'], ['contact', '/contact', '.public-support'],
  ['standards', '/standards', '.public-support'], ['partner', '/partner', '.public-support'],
  ['map', '/map', '.public-support'], ['love', '/love', '.public-support'],
  ['system', '/local-missing-page', '.public-support'],
]
const results = []
await withPublicBrowser(async (browser, baseURL) => {
  async function setup(width, recording = false) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce', serviceWorkers: 'block', ...(recording ? { recordVideo: { dir: evidence, size: { width, height: 900 } } } : {}) })
    context.setDefaultTimeout(5000)
    context.setDefaultNavigationTimeout(20000)
    await context.addInitScript(({ origin, draft }) => {
      if (location.origin !== origin) return
      if (!sessionStorage.getItem('evidence-signed-out')) localStorage.setItem('reloved_donor_token', 'local-browser-fixture-only')
      if (!sessionStorage.getItem('evidence-draft-seeded')) {
        localStorage.setItem('reloved_give_draft', JSON.stringify(draft))
        sessionStorage.setItem('evidence-draft-seeded', 'true')
      }
      navigator.geolocation.getCurrentPosition = (_success, failure) => failure({ code: 1, message: 'Synthetic denied' })
    }, { origin: new URL(baseURL).origin, draft })
    const audit = await installFixtures(context, baseURL, fixtures)
    const page = await context.newPage()
    return { context, page, audit }
  }
  async function settle(page, selector) {
    await page.locator(selector).first().waitFor()
    await page.locator('h1').first().waitFor()
    await page.evaluate(async () => {
      await document.fonts.ready
      // Eagerly decode lazy photographs before saving full-page evidence.
      for (const image of document.images) { image.loading = 'eager'; await image.decode() }
    })
    await page.waitForTimeout(150)
  }
  async function auditPage(page) {
    await assertNoOverflow(page)
    await assertPublicFonts(page)
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true)
    assert.deepEqual(await page.evaluate(() => [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src)), [])
  }
  for (const width of [320, 390, 768, 1440]) {
    const { context, page, audit } = await setup(width)
    try {
      for (const [name, path, selector] of families) {
        await page.goto(baseURL + path)
        await settle(page, selector)
        await auditPage(page)
        if ([390, 1440].includes(width)) {
          await page.evaluate(() => scrollTo(0, 0))
          await page.screenshot({ path: `${evidence}/${name}-${width}.png`, fullPage: true })
        }
        results.push({ name, width, check: 'fonts, images, overflow, reduced motion', passed: true })
      }
      // Test real customer navigation and aliases within a persistent session.
      await page.goto(baseURL + '/drop')
      await settle(page, '.public-wall')
      await page.locator('.public-item-card').first().click()
      await page.waitForURL('**/drop/local-tee')
      await settle(page, '.public-item-gallery')
      await auditPage(page)
      await page.goto(baseURL + '/wall/local-tee')
      await settle(page, '.public-item-gallery')
      results.push({ name: 'catalogue navigation and both aliases', width, passed: true })
      // All scoped content, including the shared header/footer, receives pressure.
      for (const [name, path, selector] of families.filter(([name]) => ['wall', 'give', 'claim', 'contact', 'system'].includes(name))) {
        await page.goto(baseURL + path)
        await settle(page, selector)
        await page.evaluate(() => {
          const values = [...document.querySelectorAll('.public-experience, .public-experience *')].map(el => [el, getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight])
          for (const [el, size, line] of values) { el.style.fontSize = `${parseFloat(size) * 2}px`; if (line.endsWith('px')) el.style.lineHeight = `${parseFloat(line) * 2}px` }
        })
        await assertNoOverflow(page)
        if ([320, 768].includes(width)) await page.screenshot({ path: `${evidence}/text-200-${name}-${width}.png`, fullPage: true })
        results.push({ name, width, check: '200% computed text including shared shell', passed: true })
      }
      // Login redirects authenticated donors to Account; inspect the actual signed-out screen.
      await page.evaluate(() => { sessionStorage.setItem('evidence-signed-out', 'true'); localStorage.removeItem('reloved_donor_token') })
      for (const path of ['/account/login', '/partner/login', '/admin/login']) {
        await page.goto(baseURL + path)
        await page.locator('h1').first().waitFor()
        assert.equal(await page.locator('.public-experience').count(), 0, `${path} excludes public typography`)
      }
      assert.deepEqual(audit.violations, [])
      assert.deepEqual(audit.errors, [])
      results.push({ name: 'scope isolation and network/browser audit', width, passed: true })
      console.log(`PASS integrated routes, shell pressure and request audit ${width}`)
    } finally { await context.close() }
  }
  const { context, page, audit } = await setup(390, true)
  const video = page.video()
  try {
    await page.goto(baseURL + '/')
    await settle(page, '.public-home')
    await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    const menu = page.getByRole('dialog', { name: 'Site menu' })
    await menu.waitFor()
    await page.waitForTimeout(500)
    await menu.locator('a[href="/drop"]').click()
    await page.waitForURL('**/drop')
    await settle(page, '.public-wall')
    await page.getByRole('button', { name: /^Filter/ }).click()
    await page.getByRole('dialog', { name: 'Narrow results' }).getByLabel('Category', { exact: true }).selectOption('Tops')
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.locator('.public-item-card').first().click()
    await settle(page, '.public-item-gallery')
    await page.getByRole('button', { name: 'Next photo', exact: true }).click()
    await page.waitForTimeout(650)
    await page.goto(baseURL + '/give')
    await settle(page, '.public-give-stage')
    await page.waitForTimeout(650)
    await page.locator('.public-give-actions').getByRole('button', { name: /^Continue/ }).click()
    await page.getByRole('heading', { name: 'Item Details', exact: true }).waitFor()
    await page.waitForTimeout(650)
    await page.goto(baseURL + '/account/claims/claim-local')
    await settle(page, '.public-lifecycle')
    const cancel = page.getByRole('button', { name: 'Cancel claim', exact: true })
    await cancel.click()
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(650)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(650)
    assert.deepEqual(audit.violations, [])
    assert.deepEqual(audit.errors, [])
    results.push({ name: 'recorded menu/filter/gallery/Give/lifecycle interaction', passed: true })
  } finally { await context.close() }
  await rename(await video.path(), `${evidence}/interaction-review.webm`)
})
await writeFile(`${evidence}/verification.json`, JSON.stringify({ fixtureMode: 'synthetic local API fixtures; no live writes or external service connections', browser: 'headless local Chrome', widths: [320, 390, 768, 1440], results }, null, 2) + '\n')
console.log(`PASS ${results.length} integrated checks and actual-app recording`)
