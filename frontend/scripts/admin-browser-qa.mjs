import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const origin = 'http://127.0.0.1:3100'
const output = new URL(
  '../qa-artifacts/admin-control-center/phase-1/',
  import.meta.url,
)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: 'reduce',
})
const unexpected = [],
  requests = [],
  errors = []
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  requests.push({ origin: url.origin, path: url.pathname })
  if (url.origin !== origin) {
    unexpected.push(url.href)
    return route.abort()
  }
  return route.continue()
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
const visible = async (locator) => {
  await locator.waitFor({ state: 'visible' })
  assert.ok(await locator.isVisible())
}
const noOverflow = async () =>
  assert.ok(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('.admin-main *, .admin-sidebar *'))
        .filter((el) => el.getClientRects().length)
        .every((el) => {
          const box = el.getBoundingClientRect()
          return box.left >= -1 && box.right <= innerWidth + 1
        }),
    ),
    'visible admin content must fit viewport',
  )
const screenshot = async (name) => {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: fileURLToPath(new URL(name + '.png', output)),
    fullPage: true,
  })
}
try {
  const documentResponse = await page.goto(origin + '/admin')
  const documentHtml = await documentResponse.text()
  assert.match(documentHtml, /\/assets\/index-[^"']+\.js/)
  assert.ok(!documentHtml.includes('/@vite/client'), 'serve the production build, not a development server')
  assert.ok(!/googletagmanager|google-analytics|fonts\.googleapis/.test(documentHtml), 'local built HTML contains no remote trackers or fonts')
  await page.waitForURL('**/admin/login')
  await page.locator('input[type=email]').fill('admin@synthetic.invalid')
  await page.locator('input[type=password]').fill('synthetic-local-admin')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL('**/admin')
  await visible(
    page.getByRole('heading', { name: 'Today’s deliveries', exact: false }),
  )
  await visible(
    page.getByText('SYNTHETIC QA delivery today', { exact: true }).first(),
  )
  assert.equal(
    await page.getByRole('button', { name: '30 days', exact: true }).count(),
    0,
  )
  assert.equal(await page.locator('.admin-kpi').count(), 6)
  const apiResponse = await page.request.get(
    origin + '/api/admin/control-center/overview?range=7d',
    {
      headers: {
        Authorization:
          'Bearer ' +
          (await page.evaluate(() =>
            localStorage.getItem('reloved_admin_token'),
          )),
      },
    },
  )
  assert.equal(apiResponse.status(), 200)
  const snapshot = await apiResponse.json()
  assert.equal(
    await page
      .locator('.admin-kpi')
      .filter({ hasText: 'Users' })
      .first()
      .locator('.admin-kpi-value')
      .textContent(),
    String(snapshot.kpis.find((k) => k.id === 'users').value),
  )
  await page.locator('.admin-item-photo img').first().waitFor()
  await page.waitForFunction(() =>
    (() => {
      const img = document.querySelector('.admin-item-photo img')
      return img && img.complete && img.naturalWidth > 0
    })(),
  )
  await noOverflow()
  await screenshot('overview-1440')
  await page.screenshot({
    path: fileURLToPath(new URL('overview-1440-viewport.png', output)),
  })
  await page.route('**/api/admin/control-center/overview?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"Synthetic refresh failure"}',
    }),
  )
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await visible(page.getByRole('alert'))
  assert.match(
    await page.getByRole('alert').innerText(),
    /showing previous data/,
  )
  assert.match(
    await page.getByRole('alert').innerText(),
    /Last successful snapshot/,
  )
  assert.equal(await page.locator('.admin-kpi').count(), 6)
  await screenshot('overview-stale-1440')
  await page.unroute('**/api/admin/control-center/overview?*')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await page.getByRole('alert').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '24h', exact: true }).click()
  await page.waitForResponse(
    (response) =>
      response.url().includes('overview?range=24h') &&
      response.status() === 200,
  )
  await visible(
    page.getByRole('heading', { name: 'Today’s deliveries', exact: false }),
  )
  await page.getByRole('button', { name: '7 days', exact: true }).click()
  await page.waitForResponse(
    (response) =>
      response.url().includes('overview?range=7d') && response.status() === 200,
  )
  await page
    .getByRole('navigation', { name: 'Admin navigation', exact: true })
    .getByRole('link', { name: 'Notifications', exact: true })
    .click()
  await visible(
    page.getByRole('heading', { name: 'Needs attention', exact: true }),
  )
  await noOverflow()
  await screenshot('notifications-1440')
  for (const name of ['Messaging', 'Delivery', 'Claims', 'Support']) {
    await page.getByRole('button', { name, exact: true }).click()
    await visible(page.getByRole('heading', { name, exact: true }))
    assert.ok(
      (await page
        .getByRole('button', { name, exact: true })
        .getAttribute('aria-pressed')) === 'true',
    )
  }
  await page
    .getByRole('button', { name: 'Needs attention', exact: true })
    .click()
  await visible(
    page.getByRole('heading', { name: 'Needs attention', exact: true }),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow()
  await screenshot('notifications-390')
  const menu = page.getByRole('button', {
    name: 'Open admin menu',
    exact: true,
  })
  await menu.focus()
  await page.keyboard.press('Enter')
  assert.equal(
    await page
      .getByRole('button', { name: 'Close admin menu', exact: true })
      .getAttribute('aria-expanded'),
    'true',
  )
  await screenshot('navigation-390')
  await page.keyboard.press('Escape')
  assert.ok(await menu.evaluate((el) => el === document.activeElement))
  await page.keyboard.press('Enter')
  await page
    .getByRole('navigation', { name: 'Admin navigation', exact: true })
    .getByRole('link', { name: 'Overview', exact: true })
    .click()
  await visible(
    page.getByRole('heading', { name: 'Today’s deliveries', exact: false }),
  )
  assert.ok(
    await page
      .locator('#admin-main')
      .evaluate((el) => el === document.activeElement),
  )
  assert.equal(
    await page
      .getByRole('button', { name: 'Open admin menu', exact: true })
      .getAttribute('aria-expanded'),
    'false',
  )
  await noOverflow()
  await screenshot('overview-390')
  await page.screenshot({
    path: fileURLToPath(new URL('overview-390-viewport.png', output)),
  })
  await page.setViewportSize({ width: 320, height: 740 })
  await noOverflow()
  await screenshot('overview-320')
  await page.setViewportSize({ width: 1440, height: 1050 })
  const deliveryHref = await page
    .getByRole('link', { name: 'Open delivery', exact: true })
    .first()
    .getAttribute('href')
  assert.match(deliveryHref, /^\/admin\/orders\?claimId=/)
  await page
    .getByRole('link', { name: 'Open delivery', exact: true })
    .first()
    .click()
  await page.waitForURL('**/admin/orders?claimId=*')
  await visible(page.getByRole('heading', { name: 'Deliveries', exact: true }))
  assert.deepEqual(
    unexpected,
    [],
    'no requests to production or vendor origins',
  )
  assert.deepEqual(errors, [], 'no uncaught browser errors')
  await writeFile(
    new URL('proof.json', output),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        origin,
        signedAdmin: true,
        productionBuild: true,
        requests: requests.length,
        origins: [...new Set(requests.map((r) => r.origin))],
        unexpected,
        errors,
        screenshots: [
          'overview-1440',
          'overview-stale-1440',
          'notifications-1440',
          'notifications-390',
          'navigation-390',
          'overview-390',
          'overview-320',
        ],
        verified: [
          'real JWT login',
          'same-origin API matches rendered KPI',
          'Firestore fixture photo rendering',
          'dated stale data retained and retry recovers',
          '24h/7d range selection',
          'all attention categories',
          '390px keyboard menu Escape and route focus',
          '320px/390px/1440px content bounds',
          'registered delivery link',
        ],
      },
      null,
      2,
    ),
  )
  console.log(
    'PASS: signed-admin Phase 1 browser flow, screenshots and network proof at ' +
      fileURLToPath(output),
  )
} finally {
  await browser.close()
}
