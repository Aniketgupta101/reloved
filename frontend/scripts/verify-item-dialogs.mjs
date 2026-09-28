import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { withPublicBrowser, installFixtures } from './public-browser-harness.mjs'
const evidence = '../.local-proof/task-6/item-dialogs'
await mkdir(evidence, { recursive: true })
const item = { id: 'dialog-local', slug: 'dialog-local', title: 'Synthetic dialogue tee', publicStatus: 'available', giverLogistics: 'receiver_collects', category: 'Tops', condition: 'Good', size: 'M', images: [{ storagePath: '/images/wall-items/hunter-x-hunter-hisoka-tee.png' }] }
const profile = { name: 'Local Fixture', username: 'local-fixture', phone: '9999999999', email: 'fixture@example.invalid', address: 'Example building, Bandra', onboardedAt: '2026-09-01' }
await withPublicBrowser(async (browser, baseURL) => {
  const failures = []; let passed = 0
  const cases = [
    ...[320, 1440].flatMap(width => ['claim', 'help', 'partner'].map(name => ({ width, height: 900, name }))),
    ...['forward', 'back'].map(transition => ({ width: 320, height: 600, name: 'claim', transition })),
  ]
  for (const { width, height, name, transition } of cases) {
    const caseName = transition ? `${name} ${width}x${height} ${transition}` : `${name} ${width}`
    if (process.env.ITEM_DIALOG_FILTER && !caseName.includes(process.env.ITEM_DIALOG_FILTER)) continue
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' })
    context.setDefaultTimeout(4000); context.setDefaultNavigationTimeout(15000)
    await context.addInitScript(origin => { if (location.origin === origin) localStorage.setItem('reloved_donor_token', 'local-browser-fixture-only') }, new URL(baseURL).origin)
    const claims = []
    const audit = await installFixtures(context, baseURL, {
      'GET /api/items/dialog-local': { item }, 'GET /api/donor/profile': { profile },
      'GET /api/donor/item-requests': { requests: [], weeklyUsed: 0, weeklyLimit: 2 },
      'GET /api/donor/notifications/unread-count': { unreadCount: 0 },
      'GET /api/donor/notifications': { notifications: [], unreadCount: 0 },
      'POST /api/analytics/events': { ok: true },
      'POST /api/donor/item-requests': request => { claims.push(request.postDataJSON()); return { ok: true } },
    })
    const page = await context.newPage()
    try {
      await page.goto(baseURL + '/drop/dialog-local')
      await page.getByRole('heading', { name: item.title, exact: true }).waitFor({ timeout: 15000 })
      const trigger = page.getByRole('button', { name: name === 'claim' ? 'Claim this item' : name === 'help' ? 'Need help?' : 'Are you an NGO or delivery partner?', exact: true })
      await trigger.click()
      const overlay = page.locator('.public-item-detail > .fixed').last()
      await overlay.waitFor()
      await page.waitForTimeout(100)
      assert.equal(await overlay.evaluate(el => el.contains(document.activeElement)), true, `${name}: focus enters actual overlay`)
      const dialog = overlay.getByRole('dialog')
      assert.equal(await dialog.count(), 1, 'named dialog semantics')
      assert.ok(await dialog.getAttribute('aria-label') || await dialog.getAttribute('aria-labelledby'))
      const controls = dialog.locator('button:enabled, a[href], input:enabled, textarea:enabled, select:enabled, [tabindex="0"]').filter({ visible: true })
      await controls.last().focus(); await page.keyboard.press('Tab')
      assert.equal(await controls.first().evaluate(el => el === document.activeElement), true, 'Tab wraps to first')
      await page.keyboard.press('Shift+Tab')
      assert.equal(await controls.last().evaluate(el => el === document.activeElement), true, 'Shift+Tab wraps to last')
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
      assert.equal(await page.getByRole('button', { name: 'Open help', exact: true }).isVisible(), false, 'floating help must not cover or compete with the modal')
      if (name === 'claim') {
        if (transition) {
          await dialog.locator('input').first().fill('Retained Fixture Name')
          await dialog.locator('textarea').fill('Retained fixture note')
        }
        await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
        await dialog.getByText('Step 2 of 2', { exact: true }).waitFor()
        assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'step transition retains dialog focus')
        if (transition) {
          if (transition === 'back') {
            await dialog.getByRole('button', { name: 'Back', exact: true }).click()
            await dialog.getByText('Step 1 of 2', { exact: true }).waitFor()
            assert.equal(await dialog.locator('input').first().inputValue(), 'Retained Fixture Name')
            assert.equal(await dialog.locator('textarea').inputValue(), 'Retained fixture note')
          }
          const focus = await dialog.evaluate(el => {
            const active = document.activeElement
            const bounds = active?.getBoundingClientRect()
            const frame = el.getBoundingClientRect()
            return {
              visible: !!bounds && el.contains(active) && bounds.height > 0 && bounds.top >= Math.max(0, frame.top) && bounds.bottom <= Math.min(innerHeight, frame.bottom),
              tag: active?.tagName, top: bounds?.top, bottom: bounds?.bottom,
              dialogTop: frame.top, dialogBottom: frame.bottom, scrollTop: el.scrollTop,
            }
          })
          assert.equal(focus.visible, true, `${transition} step must own visible focus: ${JSON.stringify(focus)}`)
          assert.equal(await dialog.getByRole('heading', { name: item.title, exact: true }).evaluate(el => el === document.activeElement), true, 'step heading owns focus')
        }
      }
      const captureName = transition ? `${name}-${width}x${height}-${transition}` : `${name}-${width}`
      await page.screenshot({ path: `${evidence}/${captureName}.png`, fullPage: false })
      await page.keyboard.press('Escape'); await overlay.waitFor({ state: 'detached' })
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'Escape returns trigger focus')
      assert.equal(await page.evaluate(() => document.body.style.overflow), '')
      await trigger.click(); await overlay.waitFor()
      await overlay.getByRole('button', { name: 'Close', exact: true }).first().click()
      await overlay.waitFor({ state: 'detached' })
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'close returns trigger focus')
      assert.equal(await page.evaluate(() => document.body.style.overflow), '')
      if (name === 'claim') {
        await trigger.click()
        await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
        for (const checkbox of await dialog.getByRole('checkbox').all()) await checkbox.check()
        await dialog.getByRole('button', { name: 'I Accept - Send request', exact: true }).click()
        const receipt = page.getByRole('dialog', { name: 'Request sent!', exact: true })
        await receipt.waitFor()
        assert.equal(await receipt.evaluate(el => el.contains(document.activeElement)), true, 'success after refetch owns focus')
        assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
        const receiptControls = receipt.locator('button:enabled, a[href]').filter({ visible: true })
        await receiptControls.last().focus(); await page.keyboard.press('Tab')
        assert.equal(await receiptControls.first().evaluate(el => el === document.activeElement), true)
        await page.keyboard.press('Escape'); await receipt.waitFor({ state: 'detached' })
        assert.equal(await page.evaluate(() => document.body.style.overflow), '')
        assert.equal(await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement !== document.body && document.activeElement.getClientRects().length > 0), true)
        assert.deepEqual(claims, [{ itemId: item.id, requesterName: profile.name, requesterUsername: profile.username, requesterPhone: profile.phone, requesterAddress: profile.address, note: '', acceptedTerms: true, personalUse: true, latitude: null, longitude: null }])
      }
      // Route navigation must remove document-level traps and scroll locks.
      await trigger.click(); await overlay.waitFor()
      await page.evaluate(() => { history.pushState({}, '', '/about'); dispatchEvent(new PopStateEvent('popstate')) })
      await page.getByRole('heading', { name: 'Our Story.', exact: true }).waitFor()
      assert.equal(await page.evaluate(() => document.body.style.overflow), '')
      await page.locator('.public-header a').first().focus()
      assert.equal(await page.locator('.public-header a').first().evaluate(el => el === document.activeElement), true)
      assert.deepEqual(audit.errors, []); assert.deepEqual(audit.violations, [])
      assert.deepEqual(audit.requests.filter(key => !key.startsWith('GET ') && key !== 'POST /api/analytics/events' && key !== 'POST /api/donor/item-requests'), [])
      passed++; console.log(`PASS ${caseName} overlay keyboard and cleanup`)
    } catch (error) { failures.push(`${caseName}: ${error.message}`); console.error(`FAIL ${caseName}: ${error.message}`) }
    finally { await context.close() }
  }
  console.log(`${passed} passed / ${failures.length} failed`)
  assert.deepEqual(failures, [])
})
