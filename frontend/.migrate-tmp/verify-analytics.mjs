import { chromium } from "playwright"

const BASE = "https://reloved-digital.web.app"
const summary = {
  gtmScriptLoaded: false,
  gtmRequests: 0,
  gaCollectOk: 0,
  gaCollectFail: 0,
  posthogCaptureOk: 0,
  posthogCaptureFail: 0,
  namedCtaSeenInPosthogBody: false,
  pagesVisited: [],
  errors: [],
}

function classify(url) {
  if (url.includes("googletagmanager.com/gtm.js")) return "gtm_js"
  if (url.includes("googletagmanager.com/gtag/js")) return "gtag_js"
  if (url.includes("google-analytics.com/g/collect") || url.includes("analytics.google.com/g/collect")) return "ga_collect"
  if (url.includes("posthog.com") && (url.includes("/e/") || url.includes("/i/") || url.includes("/batch") || url.includes("/capture"))) return "posthog"
  if (url.includes("i.posthog.com") || url.includes("us.i.posthog.com") || url.includes("eu.i.posthog.com")) return "posthog"
  return null
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

page.on("response", async (res) => {
  try {
    const url = res.url()
    const kind = classify(url)
    const ok = res.status() >= 200 && res.status() < 400
    if (kind === "gtm_js" && ok) {
      summary.gtmScriptLoaded = true
      summary.gtmRequests += 1
    }
    if (kind === "ga_collect") {
      if (ok || res.status() === 204) summary.gaCollectOk += 1
      else summary.gaCollectFail += 1
    }
    if (kind === "posthog") {
      if (ok || res.status() === 204) summary.posthogCaptureOk += 1
      else summary.posthogCaptureFail += 1
      // Peek for named event in POST body when possible
      try {
        const req = res.request()
        const post = req.postData()
        if (post && post.includes("cta_drop_item_clicked")) summary.namedCtaSeenInPosthogBody = true
      } catch {}
    }
  } catch (e) {
    summary.errors.push(String(e))
  }
})

async function visit(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60000 })
  summary.pagesVisited.push(path)
  await page.waitForTimeout(1500)
}

try {
  await visit("/")
  // Click Drop an item CTA if present
  const drop = page.getByRole("link", { name: /drop an item/i }).first()
  if (await drop.count()) {
    await drop.click()
    await page.waitForTimeout(2000)
    summary.pagesVisited.push("/give (via CTA)")
  } else {
    await visit("/give")
  }
  await visit("/drop")
  await visit("/track")
  await visit("/love")
  // Flush beacons
  await page.waitForTimeout(3000)
} catch (e) {
  summary.errors.push(String(e))
} finally {
  await browser.close()
}

console.log(JSON.stringify(summary, null, 2))
