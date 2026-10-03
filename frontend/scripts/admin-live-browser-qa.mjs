import assert from 'node:assert/strict'
import { mkdir, rm, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const origin = process.env.ADMIN_LIVE_REVIEW_URL || 'http://127.0.0.1:3200'
const privacyMode = process.env.ADMIN_LIVE_PRIVACY_MODE === '1'
const evidenceDir = privacyMode
  ? resolve(process.cwd(), '../Docs/admin-control-center-evidence/live-readonly')
  : resolve(process.cwd(), 'qa-artifacts/admin-live-private')
const videoDir = resolve(evidenceDir, 'video-raw')
await mkdir(evidenceDir, { recursive: true })
await rm(videoDir, { recursive: true, force: true })
await mkdir(videoDir, { recursive: true })

const pages = [
  ['overview', '/admin'],
  ['notifications', '/admin/notifications'],
  ['drops', '/admin/donations'],
  ['wall', '/admin/items'],
  ['claims', '/admin/item-requests'],
  ['deliveries', '/admin/orders'],
  ['support', '/admin/messages'],
  ['analytics-overview', '/admin/analytics'],
  ['analytics-acquisition', '/admin/analytics?view=acquisition'],
  ['analytics-behavior', '/admin/analytics?view=behavior'],
  ['analytics-drop-funnel', '/admin/analytics?view=drop-funnel'],
  ['analytics-claim-funnel', '/admin/analytics?view=claim-funnel'],
  ['analytics-device-geo', '/admin/analytics?view=device-geo'],
  ['analytics-fulfillment', '/admin/analytics?view=fulfillment'],
  ['analytics-product', '/admin/analytics?view=product'],
  ['analytics-search', '/admin/analytics?view=search'],
  ['analytics-performance', '/admin/analytics?view=performance'],
  ['analytics-data-health', '/admin/analytics?view=data-health'],
]
const responsiveViews = [
  ['overview-1280', '/admin', 1280, 900],
  ['overview-1024', '/admin', 1024, 768],
  ['overview-768', '/admin', 768, 1024],
  ['overview-390', '/admin', 390, 844],
  ['overview-320', '/admin', 320, 760],
  ['support-390', '/admin/messages', 390, 844],
  ['deliveries-390', '/admin/orders', 390, 844],
  ['analytics-behavior-390', '/admin/analytics?view=behavior', 390, 844],
  ['analytics-device-geo-320', '/admin/analytics?view=device-geo', 320, 760],
]

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' })
const page = await context.newPage()
const consoleErrors = []
const pageErrors = []
const tourRequests = []
let phase = 'tour'
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push({ phase, text: message.text() })
})
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('request', (request) => {
  const url = new URL(request.url())
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    tourRequests.push({ phase, method: request.method(), origin: url.origin, path: url.pathname })
  }
})

const modeResponse = await page.request.get(origin + '/api/health')
assert.equal(modeResponse.status(), 200, 'local live adapter health')
assert.equal(
  (await modeResponse.json()).mode,
  'production-read-only',
  'local live adapter must enforce production read-only mode',
)

for (const [name, path] of pages) {
  const response = await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 120_000 })
  assert.equal(response?.status(), 200, `${name} document response`)
  await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(350)
  const body = await page.locator('body').innerText()
  assert.doesNotMatch(
    body,
    /@synthetic\.invalid|LOCAL FIXTURE DATA|LIVE READ-ONLY · PRODUCTION DATA|Switch local review data mode/,
  )
  if (privacyMode) {
    assert.doesNotMatch(body, /\b\d{10}\b/, `${name} contains an unmasked 10-digit phone number`)
    assert.doesNotMatch(body, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, `${name} contains an unmasked email address`)
  }
  await page.screenshot({ path: resolve(evidenceDir, `${name}-1440.png`), fullPage: true })
}

// Capture the real production detail surfaces without invoking mutations. These
// are the operator parity views that expose Wall edit controls, contact tools,
// communication history, and courier actions in read-only mode.
async function firstLiveId(path) {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath)
    if (!response.ok) throw new Error(`Could not load ${requestPath}: ${response.status}`)
    const payload = await response.json()
    return payload?.items?.[0]?.id || null
  }, path)
}

await page.setViewportSize({ width: 1440, height: 1000 })
await page.goto(origin + '/admin/items', { waitUntil: 'networkidle', timeout: 120_000 })
const wallId = await firstLiveId('/api/admin/control-center/wall?limit=1')
assert.ok(wallId, 'live Wall must provide at least one item for detail evidence')
await page.goto(origin + `/admin/items?itemId=${encodeURIComponent(wallId)}`, { waitUntil: 'networkidle', timeout: 120_000 })
await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 30_000 })
await page.getByText('Read-only review', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 })
await page.screenshot({ path: resolve(evidenceDir, 'wall-edit-readonly-1440.png'), fullPage: true })

await page.setViewportSize({ width: 390, height: 844 })
await page.goto(origin + '/admin/orders', { waitUntil: 'networkidle', timeout: 120_000 })
const deliveryId = await firstLiveId('/api/admin/control-center/deliveries?view=all&status=all&limit=1')
assert.ok(deliveryId, 'live delivery history must provide at least one detail record')
await page.goto(origin + `/admin/orders?claimId=${encodeURIComponent(deliveryId)}`, { waitUntil: 'networkidle', timeout: 120_000 })
await page.getByRole('heading', { name: 'Delivery details' }).waitFor({ state: 'visible', timeout: 30_000 })
await page.getByText('Read-only review', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 })
await page.screenshot({ path: resolve(evidenceDir, 'delivery-actions-390.png'), fullPage: true })

await page.setViewportSize({ width: 320, height: 760 })
await page.goto(origin + '/admin/item-requests', { waitUntil: 'networkidle', timeout: 120_000 })
const claimId = await firstLiveId('/api/admin/control-center/claims?view=all&status=all&limit=1')
assert.ok(claimId, 'live claims must provide at least one detail record')
await page.goto(origin + `/admin/item-requests?claimId=${encodeURIComponent(claimId)}`, { waitUntil: 'networkidle', timeout: 120_000 })
await page.getByRole('heading', { name: 'Claim details' }).waitFor({ state: 'visible', timeout: 30_000 })
await page.getByText('Read-only review', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 })
await page.screenshot({ path: resolve(evidenceDir, 'claim-actions-320.png'), fullPage: true })

for (const [name, path, width, height] of responsiveViews) {
  await page.setViewportSize({ width, height })
  await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 30_000 })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    `${name} has horizontal page overflow`,
  )
  await page.screenshot({ path: resolve(evidenceDir, `${name}.png`), fullPage: true })
}

await page.setViewportSize({ width: 390, height: 844 })
await page.goto(origin + '/admin/messages', { waitUntil: 'networkidle', timeout: 120_000 })
await page.addStyleTag({ content: ':root { font-size: 200% !important; }' })
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  true,
  'support at 200% text has horizontal page overflow',
)
await page.screenshot({ path: resolve(evidenceDir, 'support-390-text-200.png'), fullPage: true })

const normalWrites = tourRequests.filter((request) => request.phase === 'tour' && !['GET', 'HEAD'].includes(request.method))
const approvedRemoteReads = tourRequests.filter(
  (request) =>
    request.phase === 'tour' &&
    request.method === 'GET' &&
    request.origin === 'https://storage.googleapis.com',
)
const unexpectedRemoteRequests = tourRequests.filter(
  (request) =>
    request.phase === 'tour' &&
    request.origin !== origin &&
    !(request.method === 'GET' && request.origin === 'https://storage.googleapis.com'),
)
assert.deepEqual(normalWrites, [], 'normal live review issued a browser write request')
assert.deepEqual(unexpectedRemoteRequests, [], 'browser made an unexpected remote request')

phase = 'barrier-probe'
const barrier = await page.evaluate(async () => {
  const response = await fetch('/api/admin/control-center/overview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  return { status: response.status, body: await response.json() }
})
assert.deepEqual(barrier, { status: 405, body: { error: 'Live review is read-only.' } })

await context.close()

const videoContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  colorScheme: 'light',
  reducedMotion: 'reduce',
  recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
})
const videoPage = await videoContext.newPage()
for (const path of [
  '/admin', '/admin/notifications', '/admin/orders', '/admin/messages',
  '/admin/analytics', '/admin/analytics?view=acquisition', '/admin/analytics?view=behavior',
  '/admin/analytics?view=drop-funnel', '/admin/analytics?view=claim-funnel',
  '/admin/analytics?view=device-geo', '/admin/analytics?view=fulfillment',
  '/admin/analytics?view=product', '/admin/analytics?view=search',
  '/admin/analytics?view=performance', '/admin/analytics?view=data-health',
]) {
  await videoPage.goto(origin + path, { waitUntil: 'networkidle', timeout: 120_000 })
  await videoPage.waitForTimeout(700)
}
const recordedVideo = videoPage.video()
await videoContext.close()
if (recordedVideo) await rename(await recordedVideo.path(), resolve(evidenceDir, 'live-readonly-walkthrough.webm'))
await browser.close()

const proof = {
  reviewedAt: new Date().toISOString(),
  mode: 'PRODUCTION · READ ONLY',
  privacyMode,
  pagesReviewed: pages.map(([name]) => name),
  responsiveViews: responsiveViews.map(([name]) => name),
  operatorDetailViews: ['wall-edit-readonly-1440', 'delivery-actions-390', 'claim-actions-320'],
  textPressure: 'support at 390px with 200% root text',
  screenshotsCaptured: pages.length + responsiveViews.length + 4,
  productionBrowserWrites: 0,
  loopbackNormalTourWrites: 0,
  approvedRemoteImageReads: approvedRemoteReads.length,
  unexpectedRemoteRequests: 0,
  localBarrierProbe: barrier,
  consoleErrors: consoleErrors.filter((entry) => entry.phase === 'tour'),
  pageErrors,
}
assert.deepEqual(consoleErrors.filter((entry) => entry.phase === 'tour'), [])
assert.deepEqual(pageErrors, [])
await writeFile(resolve(evidenceDir, 'network-write-barrier-proof.json'), JSON.stringify(proof, null, 2) + '\n')
console.log(JSON.stringify({
  ok: true,
  screenshots: pages.length + responsiveViews.length + proof.operatorDetailViews.length + 1,
  video: 'live-readonly-walkthrough.webm',
  proof: 'network-write-barrier-proof.json',
}))
