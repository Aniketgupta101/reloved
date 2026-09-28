import assert from 'node:assert/strict'
import { withPublicBrowser, installFixtures, assertNoOverflow } from './public-browser-harness.mjs'
const photo = '/images/wall-items/hunter-x-hunter-hisoka-tee.png'
const draft = { step: 1, formData: {}, photoItems: [1, 2].map(index => ({ storagePath: photo, previewUrl: photo, groupId: 0, fileName: `fixture-${index}.png`, status: 'done' })), uploadMode: 'single', activeGroupId: 0, itemDrafts: {} }
await withPublicBrowser(async (browser, baseURL) => {
  let passed = 0; const failures = []
  for (const width of [320, 390]) for (const scale of [1, 2]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
    context.setDefaultTimeout(4000); context.setDefaultNavigationTimeout(15000)
    await context.addInitScript(({ origin, draft }) => { if (location.origin === origin) localStorage.setItem('reloved_give_draft', JSON.stringify(draft)) }, { origin: new URL(baseURL).origin, draft })
    const audit = await installFixtures(context, baseURL, { 'POST /api/analytics/events': { ok: true } })
    const page = await context.newPage()
    try {
      await page.goto(baseURL + '/give'); await page.locator('.public-give-photo-tile').first().waitFor()
      if (scale === 2) await page.evaluate(() => {
        const values = [...document.querySelectorAll('.public-experience, .public-experience *')].map(el => [el, getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight])
        for (const [el, size, line] of values) { el.style.fontSize = `${parseFloat(size) * 2}px`; if (line.endsWith('px')) el.style.lineHeight = `${parseFloat(line) * 2}px` }
      })
      const defects = await page.evaluate(() => {
        const found = []
        for (const el of document.querySelectorAll('.public-give-progress span')) if (el.scrollWidth > el.clientWidth) found.push(`Clipped progress: ${el.textContent}`)
        for (const el of document.querySelectorAll('.public-give-photo-tile > span.bottom-2')) if (el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight) * 2 + 8) found.push('Photo status covers photograph')
        for (const el of document.querySelectorAll('.public-give-add-photos button')) {
          const range = document.createRange(); range.selectNodeContents(el)
          if (range.getClientRects().length > 1) found.push(`Split action word: ${el.textContent.trim()}`)
        }
        return found
      })
      assert.deepEqual(defects, [], 'photo labels, progress and actions must remain readable')
      await assertNoOverflow(page); assert.deepEqual(audit.errors, []); assert.deepEqual(audit.violations, [])
      passed++; console.log(`PASS Give photo/progress/action readability ${width} at ${scale * 100}% text`)
    } catch (error) { failures.push(`${width}/${scale}: ${error.message}`); console.error(`FAIL ${width}/${scale}: ${error.message}`) }
    finally { await context.close() }
  }
  console.log(`${passed} passed / ${failures.length} failed`)
  assert.deepEqual(failures, [])
})
