import { chromium } from "playwright"

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.on("console", (msg) => console.log("CONSOLE", msg.type(), msg.text().slice(0, 400)))
page.on("requestfailed", (req) => {
  if (req.url().includes("posthog")) console.log("FAIL", req.url(), req.failure()?.errorText)
})
page.on("request", (req) => {
  const u = req.url()
  if (u.includes("posthog") || u.includes("/e/") || u.includes("/i/v0") || u.includes("g/collect")) {
    console.log("REQ", req.method(), u.slice(0, 220))
  }
})

await page.goto("https://reloved-digital.web.app/", { waitUntil: "networkidle", timeout: 60000 })
await page.waitForTimeout(2000)
await page.evaluate(() => {
  window.posthog.debug(true)
  window.posthog.capture("verify_manual_ping", { source: "agent_verify" })
  window.posthog.capture("$pageview")
})
await page.waitForTimeout(6000)
await browser.close()
