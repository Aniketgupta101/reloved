/**
 * Shared helpers for UAT recording scripts.
 */
import { UAT_TEST_USER } from "./setup-uat-test-user.mjs"

export { UAT_TEST_USER }

export const pause = (ms) => new Promise((r) => setTimeout(r, ms))
export const rand = (min, max) => min + Math.random() * (max - min)

export async function showCaption(page, text, ms = 2600) {
  await page.evaluate((caption) => {
    let el = document.getElementById("uat-caption")
    if (!el) {
      el = document.createElement("div")
      el.id = "uat-caption"
      Object.assign(el.style, {
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "99999",
        background: "rgba(17,17,17,0.92)",
        color: "#f4f1ea",
        padding: "12px 20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "14px",
        fontWeight: "500",
        lineHeight: "1.5",
        maxWidth: "min(560px, 90vw)",
        textAlign: "center",
        border: "1px solid rgba(244,241,234,0.35)",
        borderRadius: "4px",
        pointerEvents: "none",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      })
      document.body.appendChild(el)
    }
    el.textContent = caption
    el.style.display = "block"
  }, text)
  await pause(ms)
  await page.evaluate(() => {
    const el = document.getElementById("uat-caption")
    if (el) el.style.display = "none"
  })
}

export async function humanScrollTo(page, targetY) {
  await page.evaluate(async (y) => {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms))
    const start = window.scrollY
    const distance = y - start
    if (Math.abs(distance) < 8) return
    const duration = Math.min(2200, Math.max(900, Math.abs(distance) * 0.6))
    const t0 = performance.now()
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
    while (true) {
      const t = Math.min(1, (performance.now() - t0) / duration)
      window.scrollTo(0, start + distance * ease(t))
      if (t >= 1) break
      await delay(16)
    }
  }, targetY)
  await pause(rand(500, 900))
}

export async function getMaxScroll(page) {
  return page.evaluate(() =>
    Math.max(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight),
  )
}

export async function humanBrowsePage(page, { sections = 4 } = {}) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await pause(rand(800, 1200))

  const max = await getMaxScroll(page)
  if (max < 100) {
    await pause(1000)
    return
  }

  const stops = Array.from({ length: sections }, (_, i) => Math.round((max / (sections - 1)) * i))
  for (const y of stops) {
    await humanScrollTo(page, y)
    await pause(rand(700, 1300))
  }

  await pause(rand(1000, 1600))
  await humanScrollTo(page, 0)
}

export async function focusElement(page, locator) {
  if (await locator.first().isVisible().catch(() => false)) {
    await locator.first().scrollIntoViewIfNeeded()
    await pause(rand(400, 700))
    await locator.first().hover().catch(() => {})
    await pause(rand(600, 1000))
  }
}

export async function humanType(locator, text) {
  await locator.click()
  await pause(rand(200, 400))
  await locator.pressSequentially(text, { delay: rand(50, 90) })
  await pause(rand(300, 500))
}

export async function humanClick(locator) {
  await locator.hover().catch(() => {})
  await pause(rand(250, 450))
  await locator.click()
  await pause(rand(400, 700))
}

export async function currentStepHeading(page) {
  const headings = page.locator("h2")
  const count = await headings.count()
  const known = [
    "Drop something. Pass it on.",
    "Item Details",
    "Donor Details",
    "How should this reach them?",
    "Review & Submit",
  ]
  for (let i = 0; i < count; i++) {
    const text = (await headings.nth(i).textContent().catch(() => ""))?.trim() || ""
    if (known.includes(text)) return text
  }
  return null
}

export async function waitForStep(page, heading, timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if ((await currentStepHeading(page)) === heading) return true
    await pause(300)
  }
  return false
}

export function continueBtn(page) {
  return page.locator("button").filter({ hasText: /^Continue$/ })
}

export async function clickContinueWhenReady(page, timeoutMs = 60000) {
  const btn = continueBtn(page)
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const text = (await btn.textContent().catch(() => "")) || ""
    if (text.includes("Analyzing")) {
      await pause(1000)
      continue
    }
    if (await btn.isEnabled().catch(() => false)) {
      await humanClick(btn)
      return true
    }
    await pause(500)
  }
  return false
}

export async function loginTestUser(page, baseUrl) {
  let devCode = null
  const onResponse = async (response) => {
    if (response.url().includes("/api/otp/request") && response.ok()) {
      const json = await response.json().catch(() => ({}))
      if (json.devCode) devCode = json.devCode
    }
  }
  page.on("response", onResponse)

  await page.goto(`${baseUrl}/account/login`, { waitUntil: "networkidle" })

  await humanClick(page.locator("button", { hasText: "Phone" }))
  await humanType(page.locator('input[type="tel"]'), UAT_TEST_USER.phone)
  await humanClick(page.locator("button", { hasText: "Send code" }))

  for (let i = 0; i < 40 && !devCode; i++) await pause(500)
  page.off("response", onResponse)
  if (!devCode) throw new Error("OTP unavailable — wait 10 min, then: npm run setup:uat-user")

  await pause(rand(800, 1200))
  await humanType(page.locator('input[placeholder="------"]'), devCode)
  await humanClick(page.locator("button", { hasText: /Verify/i }))
  await page.waitForURL(/\/(drop|account)/, { timeout: 30000 })
  await pause(1500)
}
