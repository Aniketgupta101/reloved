/**
 * Client UAT walkthrough — human-paced browsing, natural scroll, test account.
 * Run: npm run record:uat
 * Output: recordings/reloved-uat-fixes.webm
 */
import { chromium } from "playwright"
import { mkdir, rename, readdir, unlink } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { UAT_TEST_USER } from "./setup-uat-test-user.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const BASE_URL = process.env.UAT_BASE_URL || "http://localhost:3002"
const TEST_IMAGE = path.join(ROOT, "public", "images", "uat-clothing-photo.jpg")

const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const rand = (min, max) => min + Math.random() * (max - min)

async function showCaption(page, text, ms = 2600) {
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

/** Smooth eased scroll — feels like someone reading the page. */
async function humanScrollTo(page, targetY) {
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

async function getMaxScroll(page) {
  return page.evaluate(() =>
    Math.max(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight),
  )
}

/** Scroll through the page like a person: top → read sections → bottom → back up. */
async function humanBrowsePage(page, { sections = 4 } = {}) {
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

async function focusElement(page, locator) {
  if (await locator.first().isVisible().catch(() => false)) {
    await locator.first().scrollIntoViewIfNeeded()
    await pause(rand(400, 700))
    await locator.first().hover().catch(() => {})
    await pause(rand(600, 1000))
  }
}

async function humanType(locator, text) {
  await locator.click()
  await pause(rand(200, 400))
  await locator.pressSequentially(text, { delay: rand(50, 90) })
  await pause(rand(300, 500))
}

async function humanClick(locator) {
  await locator.hover().catch(() => {})
  await pause(rand(250, 450))
  await locator.click()
  await pause(rand(400, 700))
}

// ── Give flow helpers ─────────────────────────────────────────────────────

async function currentStepHeading(page) {
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

async function waitForStep(page, heading, timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if ((await currentStepHeading(page)) === heading) return true
    await pause(300)
  }
  return false
}

function continueBtn(page) {
  return page.locator("button").filter({ hasText: /^Continue$/ })
}

async function clickContinueWhenReady(page, timeoutMs = 60000) {
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

// ── Scenarios ─────────────────────────────────────────────────────────────

async function browseHome(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" })
  await showCaption(page, "Checking the homepage — logo, wall items, and photos all load.", 2400)
  await humanBrowsePage(page, { sections: 5 })

  await showCaption(page, "Hero buttons: Drop and Claim are both black.", 2200)
  await focusElement(page, page.locator("button", { hasText: /^Drop an item$/ }).first())

  await humanScrollTo(page, await getMaxScroll(page))
  await showCaption(
    page,
    "Bottom CTAs: Drop an item now is black. Explore Wall is outlined — not both black.",
    3000,
  )
  await focusElement(page, page.locator("button", { hasText: /^Drop an item now$/i }))
  await focusElement(page, page.locator("button", { hasText: /^Explore Wall$/i }))
  await humanScrollTo(page, 0)
}

async function browseGiveChips(page) {
  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
  await showCaption(page, "Drop flow opens with “Pass it on.” Pink chips and green upload stay on-brand.", 2800)
  await humanBrowsePage(page, { sections: 3 })
  await humanClick(page.locator("button", { hasText: "One Item" }))
  await focusElement(page, page.locator("button", { hasText: "Upload from gallery" }))
}

async function browseItemDetail(page) {
  await page.goto(`${BASE_URL}/drop/abercrombie-fitch-green-af-ny-92-tee`, { waitUntil: "networkidle" })
  await showCaption(page, "Item page: Claim is black. Need help? stays green.", 2600)
  await humanBrowsePage(page, { sections: 3 })
  await focusElement(page, page.locator("button", { hasText: /Claim this item/i }))
  await focusElement(page, page.locator("button", { hasText: /Need help/i }))
}

async function browseContact(page) {
  await page.goto(`${BASE_URL}/contact`, { waitUntil: "networkidle" })
  await showCaption(page, "Contact page — Send Message is black.", 2200)
  await humanBrowsePage(page, { sections: 3 })
  await focusElement(page, page.locator("button", { hasText: /Send Message/i }))
}

async function loginTestUser(page) {
  let devCode = null
  const onResponse = async (response) => {
    if (response.url().includes("/api/otp/request") && response.ok()) {
      const json = await response.json().catch(() => ({}))
      if (json.devCode) devCode = json.devCode
    }
  }
  page.on("response", onResponse)

  await page.goto(`${BASE_URL}/account/login`, { waitUntil: "networkidle" })
  await showCaption(
    page,
    `Logging in as ${UAT_TEST_USER.name} (${UAT_TEST_USER.displayPhone}).`,
    2600,
  )
  await humanBrowsePage(page, { sections: 2 })

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
  await showCaption(page, "Signed in — saved address will be reused in the drop flow.", 2600)
}

async function completeGiveFlow(page) {
  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
  await showCaption(page, "Starting the drop flow with a real clothes photo (background visible).", 2600)
  await humanBrowsePage(page, { sections: 2 })

  await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE)
  await pause(rand(1500, 2200))
  await humanBrowsePage(page, { sections: 2 })

  await showCaption(page, "AI removes the background and suggests item details…", 2800)
  await clickContinueWhenReady(page, 90000)

  for (let i = 0; i < 90; i++) {
    if ((await currentStepHeading(page)) === "Item Details") break
    const btn = continueBtn(page)
    const label = (await btn.textContent().catch(() => "")) || ""
    if (!label.includes("Analyzing") && (await btn.isEnabled().catch(() => false))) {
      await humanClick(btn)
    }
    if ((await currentStepHeading(page)) === "Item Details") break
    await pause(1000)
  }

  if (!(await waitForStep(page, "Item Details", 20000))) {
    throw new Error("Item Details step did not appear")
  }

  await showCaption(page, "Reviewing AI-filled item details.", 2400)
  await humanBrowsePage(page, { sections: 3 })

  const title = page.getByPlaceholder("e.g. Vintage Denim Jacket")
  if ((await title.inputValue().catch(() => "")).trim().length < 2) {
    await humanType(title, "White crew neck t-shirt")
  }
  const sizeSelect = page.locator('label:has-text("Size")').locator("..").locator("select")
  if (await sizeSelect.isVisible().catch(() => false) && !(await sizeSelect.inputValue().catch(() => ""))) {
    await sizeSelect.selectOption({ index: 1 })
    await pause(500)
  }
  const desc = page.getByPlaceholder(/Why are you giving/i)
  if ((await desc.inputValue().catch(() => "")).trim().length < 5) {
    await humanType(desc, "Clean white tee, gently used.")
  }

  await clickContinueWhenReady(page)

  if ((await currentStepHeading(page)) === "Donor Details") {
    await humanBrowsePage(page, { sections: 2 })
    await humanType(page.locator('input:not([type="radio"]):not([type="checkbox"])').first(), UAT_TEST_USER.name)
    await humanType(page.locator('input[type="tel"]'), UAT_TEST_USER.phone)
    await clickContinueWhenReady(page)
  } else {
    await showCaption(page, "Contact details pulled from the logged-in account.", 2200)
    await pause(1200)
  }

  if (!(await waitForStep(page, "How should this reach them?", 20000))) {
    throw new Error("Handover step did not appear")
  }

  const logisticsSelect = page.locator('select:has(option[value="receiver_collects"])')
  await showCaption(page, "New handover dropdown — three options, no “Coming soon”.", 2600)
  await humanBrowsePage(page, { sections: 2 })

  await logisticsSelect.selectOption("receiver_collects")
  await pause(600)
  await showCaption(page, "Option 1: Receiver collects — pickup address and preferred times.", 2400)
  await humanClick(page.locator("button", { hasText: "Next 3 days" }))
  await humanClick(page.locator("button", { hasText: "Mornings" }))
  await humanBrowsePage(page, { sections: 2 })

  await logisticsSelect.selectOption("giver_sends")
  await pause(600)
  await showCaption(page, "Option 2: I send it — delivery address only.", 2200)
  await humanType(page.locator("textarea").first(), "Flat 12, Bandra West, Mumbai 400050")
  await humanBrowsePage(page, { sections: 2 })

  await logisticsSelect.selectOption("porter_arranged")
  await pause(600)
  await showCaption(page, "Option 3: Porter through RELOVED — who pays.", 2200)
  await humanClick(page.locator("label", { hasText: "Receiver pays" }))
  await humanBrowsePage(page, { sections: 2 })

  await clickContinueWhenReady(page)

  if (!(await waitForStep(page, "Review & Submit", 20000))) {
    throw new Error("Review step did not appear")
  }

  await showCaption(page, "Final review — handover summary before submit.", 2800)
  await humanBrowsePage(page, { sections: 4 })

  const checkboxes = page.locator('input[type="checkbox"]')
  for (let i = 0; i < (await checkboxes.count()); i++) {
    const box = checkboxes.nth(i)
    if (!(await box.isChecked().catch(() => true))) await box.check({ force: true })
  }
  await focusElement(page, page.locator("button", { hasText: /I Accept/i }))
  await showCaption(page, "All checklist items verified. Ready for client review.", 3200)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1400, height: 900 } },
  })
  const page = await context.newPage()

  try {
    await browseHome(page)
    await browseGiveChips(page)
    await browseItemDetail(page)
    await browseContact(page)
    await loginTestUser(page)
    await completeGiveFlow(page)
  } finally {
    await context.close()
    await browser.close()
  }

  const files = await readdir(OUT_DIR)
  const webm = files.find((f) => f.endsWith(".webm"))
  if (!webm) {
    console.error("No video file found in", OUT_DIR)
    process.exit(1)
  }
  const finalPath = path.join(OUT_DIR, "reloved-uat-fixes.webm")
  try {
    await unlink(finalPath)
  } catch {
    // first run
  }
  await rename(path.join(OUT_DIR, webm), finalPath)
  console.log(`Recording saved: ${finalPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
