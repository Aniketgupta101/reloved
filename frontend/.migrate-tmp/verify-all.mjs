import { chromium } from "playwright"

const BASE = "https://reloved-digital.web.app"
const out = {
  gtmLoaded: false,
  gaCollect: 0,
  posthogIngest: 0,
  posthogIsBot: null,
  namedCaptureAttempted: false,
  searchConsoleOk: false,
  pages: [],
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  viewport: { width: 1440, height: 900 },
})
const page = await context.newPage()

page.on("response", (res) => {
  const u = res.url()
  const s = res.status()
  if (u.includes("googletagmanager.com/gtm.js") && s < 400) out.gtmLoaded = true
  if (u.includes("/g/collect") && (s === 204 || s < 400)) out.gaCollect += 1
  if (u.includes("us.i.posthog.com") && (u.includes("/i/v0/e") || u.includes("/e/")) && s < 400) {
    out.posthogIngest += 1
  }
})

await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 })
out.pages.push("/")
await page.waitForTimeout(2500)
out.posthogIsBot = await page.evaluate(() => window.posthog?._is_bot?.() ?? null)

await page.evaluate(() => {
  window.posthog?.capture("verify_manual_ping", { source: "agent_verify" })
  window.posthog?.capture("cta_drop_item_clicked", { source: "agent_verify" })
})
out.namedCaptureAttempted = true
await page.waitForTimeout(3000)

for (const path of ["/drop", "/give", "/track", "/love"]) {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 })
  out.pages.push(path)
  await page.waitForTimeout(1200)
}

// Search Console verification file
const sc = await context.request.get(BASE + "/google73770936f3df6033.html")
out.searchConsoleOk = sc.ok() && (await sc.text()).includes("google-site-verification")

await browser.close()
console.log(JSON.stringify(out, null, 2))
