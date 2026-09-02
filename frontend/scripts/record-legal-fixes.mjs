/**
 * Client feedback video — Terms accept links + Privacy Policy copy.
 * Run: npm run record:legal  (with Vite up, or set UAT_BASE_URL)
 * Output: recordings/reloved-legal-tnc-privacy-fixes.webm
 */
import { chromium } from "playwright"
import { mkdir, rename, readdir, unlink } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  UAT_TEST_USER,
  pause,
  rand,
  showCaption,
  humanBrowsePage,
  focusElement,
  humanType,
  humanClick,
  waitForStep,
  clickContinueWhenReady,
  currentStepHeading,
} from "./uat-recording-helpers.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const BASE_URL = process.env.UAT_BASE_URL || "http://localhost:3000"
const TEST_IMAGE = path.join(ROOT, "public", "images", "uat-clothing-photo.jpg")
const FINAL_NAME = "reloved-legal-tnc-privacy-fixes.webm"

async function recordPrivacyPage(page) {
  await page.goto(`${BASE_URL}/privacy`, { waitUntil: "networkidle" })
  await showCaption(page, "Privacy Policy — client copy updates", 2400)
  await focusElement(page, page.locator("h1", { hasText: "Privacy Policy" }))
  await showCaption(
    page,
    "Sec 1 intro: “give and claim preloved items for free” — Mumbai-led removed.",
    3400,
  )
  await focusElement(
    page,
    page.locator("p", { hasText: /give and claim preloved items for free/i }).first(),
  )
  await pause(1200)

  await showCaption(page, "Sharing section — personal-use / no resale line added.", 2800)
  const sharing = page.locator("h2", { hasText: "3. Sharing" })
  await focusElement(page, sharing)
  await sharing.scrollIntoViewIfNeeded()
  await pause(600)
  await focusElement(
    page,
    page.locator("p", {
      hasText: /Claimed items are intended for personal use and must not be sold, traded, or used for commercial resale/i,
    }),
  )
  await pause(1600)
  await humanBrowsePage(page, { sections: 3 })
}

async function recordTermsPage(page) {
  await page.goto(`${BASE_URL}/terms`, { waitUntil: "networkidle" })
  await showCaption(page, "Terms & Conditions — dedicated longer page", 2400)
  await focusElement(page, page.locator("h1", { hasText: /Terms/i }))
  await showCaption(page, "Sec 1: giving and claiming preloved items for free (no Mumbai-led).", 3200)
  await focusElement(page, page.locator("h2", { hasText: "1. What Reloved is" }))
  await focusElement(
    page,
    page.locator("p", { hasText: /giving and claiming preloved items for free/i }).first(),
  )
  await pause(1400)
  await humanBrowsePage(page, { sections: 3 })
}

async function reachReviewStep(page) {
  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
  await showCaption(page, "Give flow — walk to Review to show Accept / T&C UI", 2600)
  await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE)
  await pause(rand(1200, 1800))
  await clickContinueWhenReady(page, 90000)

  for (let i = 0; i < 90; i++) {
    if ((await currentStepHeading(page)) === "Item Details") break
    const btn = page.locator("button").filter({ hasText: /^Continue$/ })
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

  const title = page.getByPlaceholder("e.g. Vintage Denim Jacket")
  if ((await title.inputValue().catch(() => "")).trim().length < 2) {
    await humanType(title, "White crew neck t-shirt")
  }
  const sizeSelect = page.locator('label:has-text("Size")').locator("..").locator("select")
  if ((await sizeSelect.isVisible().catch(() => false)) && !(await sizeSelect.inputValue().catch(() => ""))) {
    await sizeSelect.selectOption({ index: 1 })
    await pause(400)
  }
  const desc = page.getByPlaceholder(/Why are you giving/i)
  if ((await desc.inputValue().catch(() => "")).trim().length < 5) {
    await humanType(desc, "Clean white tee, gently used.")
  }
  await clickContinueWhenReady(page)

  // Guest path (no OTP login required for this legal UI recording)
  if ((await currentStepHeading(page)) === "Donor Details") {
    await showCaption(page, "Donor details — guest path (no login).", 2000)
    await humanType(page.getByRole("textbox").first(), "UAT")
    await humanType(page.locator('input[type="tel"]'), UAT_TEST_USER.phone)
    await clickContinueWhenReady(page)
  }

  if (!(await waitForStep(page, "How should this reach them?", 20000))) {
    throw new Error("Handover step did not appear")
  }
  const logisticsSelect = page.locator('select:has(option[value="receiver_collects"])')
  await logisticsSelect.selectOption("giver_sends")
  await pause(500)
  await humanType(page.locator("textarea").first(), "Flat 12, Bandra West, Mumbai 400050")
  await clickContinueWhenReady(page)

  if (!(await waitForStep(page, "Review & Submit", 20000))) {
    throw new Error("Review step did not appear")
  }
}

async function recordAcceptUi(page) {
  await showCaption(page, "Review & Submit — Accept Terms UI", 2400)
  await humanBrowsePage(page, { sections: 3 })

  await showCaption(page, "Disclaimer: “Terms & Conditions” is clickable.", 2800)
  const disclaimerTerms = page.locator("a", { hasText: "Terms & Conditions" }).first()
  await focusElement(page, disclaimerTerms)

  await showCaption(page, "Checkbox: Terms & Conditions and Privacy Policy are both links.", 3000)
  const termsCheckbox = page.locator("#give-terms")
  await focusElement(page, termsCheckbox.locator(".."))
  const checkboxTerms = page.locator("label[for='give-terms'] a", { hasText: "Terms & Conditions" })
  const checkboxPrivacy = page.locator("label[for='give-terms'] a", { hasText: "Privacy Policy" })
  await focusElement(page, checkboxTerms)
  await focusElement(page, checkboxPrivacy)

  // Open Privacy in a new tab from the checkbox link
  await showCaption(page, "Opening Privacy Policy from the checkbox link…", 2200)
  const privacyPopup = page.waitForEvent("popup")
  await humanClick(checkboxPrivacy)
  const privacyPage = await privacyPopup
  await privacyPage.waitForLoadState("networkidle")
  await showCaption(privacyPage, "Privacy Policy opened from Accept checkbox.", 2400)
  await focusElement(
    privacyPage,
    privacyPage.locator("p", { hasText: /give and claim preloved items for free/i }).first(),
  )
  await pause(1200)
  await privacyPage.close()
  await pause(600)

  // Open Terms from disclaimer
  await showCaption(page, "Opening Terms from the disclaimer link…", 2200)
  const termsPopup = page.waitForEvent("popup")
  await humanClick(disclaimerTerms)
  const termsPage = await termsPopup
  await termsPage.waitForLoadState("networkidle")
  await showCaption(termsPage, "Dedicated Terms page — longer version.", 2600)
  await pause(1400)
  await termsPage.close()
  await pause(600)

  // Checkboxes + Read More under I Accept
  const checkboxes = page.locator('input[type="checkbox"]')
  for (let i = 0; i < (await checkboxes.count()); i++) {
    const box = checkboxes.nth(i)
    if (!(await box.isChecked().catch(() => true))) await box.check({ force: true })
  }
  await pause(500)

  await showCaption(page, "Under I Accept: Read More → dedicated Terms page.", 2800)
  await focusElement(page, page.locator("button", { hasText: /I Accept/i }))
  const readMore = page.locator("a", { hasText: "Read More" })
  await focusElement(page, readMore)

  const readMorePopup = page.waitForEvent("popup")
  await humanClick(readMore)
  const readMorePage = await readMorePopup
  await readMorePage.waitForLoadState("networkidle")
  await showCaption(readMorePage, "Read More lands on the full Terms & Conditions page.", 2800)
  await pause(1400)
  await readMorePage.close()

  await showCaption(page, "Legal accept fixes verified for client review.", 2800)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  // Sanity: app must be up
  try {
    const res = await fetch(BASE_URL, { method: "GET" })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    console.error(`Cannot reach ${BASE_URL}. Start Vite first (npm run dev), then retry.`)
    console.error(err.message || err)
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1400, height: 900 } },
  })
  const page = await context.newPage()
  const video = page.video()

  try {
    await recordPrivacyPage(page)
    await recordTermsPage(page)
    // Guest Give flow — avoids OTP flakiness for this legal-copy video
    await reachReviewStep(page)
    await recordAcceptUi(page)
  } finally {
    await context.close()
    await browser.close()
  }

  if (!video) throw new Error("No video recorded")
  const tempPath = await video.path()
  const finalPath = path.join(OUT_DIR, FINAL_NAME)
  try {
    await unlink(finalPath)
  } catch {
    // first run
  }
  await rename(tempPath, finalPath)

  // Clean any leftover webm from this run
  const leftovers = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".webm") && f !== FINAL_NAME)
  for (const f of leftovers) {
    // keep other uat videos; only remove playwright temp-looking names
    if (/^[0-9a-f-]{20,}\.webm$/i.test(f)) {
      try {
        await unlink(path.join(OUT_DIR, f))
      } catch {
        // ignore
      }
    }
  }

  console.log(`Recording saved: ${finalPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
