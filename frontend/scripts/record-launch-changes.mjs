/**
 * Walkthrough video of 9 Sep launch items:
 * privacy building/landmark, Borzo/Porter admin divert, partner redirect, QR page.
 *
 * Run (Vite must be up on :3000):
 *   npm run record:launch
 *
 * Output: recordings/reloved-launch-privacy-logistics-qr.webm
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
const FINAL_NAME = "reloved-launch-privacy-logistics-qr.webm"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"

async function reachHandoverStep(page) {
  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
  await showCaption(page, "1) Give flow — privacy on handover step", 2600)
  await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE)
  await pause(rand(1000, 1600))
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
  if (!(await waitForStep(page, "Item Details", 25000))) {
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

  if ((await currentStepHeading(page)) === "Donor Details") {
    await showCaption(page, "Guest donor details (quick path).", 1800)
    await humanType(page.getByRole("textbox").first(), "UAT")
    await humanType(page.locator('input[type="tel"]'), UAT_TEST_USER.phone)
    await clickContinueWhenReady(page)
  }

  if (!(await waitForStep(page, "How should this reach them?", 25000))) {
    throw new Error("Handover step did not appear")
  }
}

async function recordPrivacyHandover(page) {
  await showCaption(page, "Privacy rule: building / landmark only — no flat or wing.", 3200)
  const notice = page.getByText(/Important privacy rule/i).first()
  await focusElement(page, notice)
  await pause(1200)

  await showCaption(page, "Label is now Building / landmark (not full address).", 2800)
  await focusElement(page, page.getByText("Building / landmark *").first())

  await showCaption(page, "If you type flat/wing, a soft warning appears.", 2600)
  const buildingInput = page.locator('input[placeholder*="building or landmark" i]').first()
  if (await buildingInput.isVisible().catch(() => false)) {
    await humanType(buildingInput, "Flat 402 Wing B")
    await pause(1200)
    await focusElement(page, page.getByText(/remove flat \/ wing/i).first())
    await pause(1400)
    await buildingInput.fill("")
    await humanType(buildingInput, "Linking Road, Bandra West")
  }

  await showCaption(page, "Porter / Borzo option — ops books with company phone.", 3000)
  const logisticsSelect = page.locator('select:has(option[value="porter_arranged"])')
  await logisticsSelect.selectOption("porter_arranged")
  await pause(800)
  await focusElement(page, page.getByText(/Porter \/ Borzo via RELOVED/i).first())
  await focusElement(page, page.getByText(/company phone/i).first())
  await pause(1600)
}

async function recordQrPage(page) {
  await page.goto(`${BASE_URL}/qr`, { waitUntil: "networkidle" })
  await showCaption(page, "2) QR codes page — /qr", 2600)
  await focusElement(page, page.locator("h1", { hasText: /QR codes/i }))
  await pause(800)
  await showCaption(page, "Website + Instagram QR — open or download PNG.", 3000)
  await focusElement(page, page.getByText("Website").first())
  await focusElement(page, page.getByText("Instagram").first())
  await pause(1400)
}

async function recordAdminLogistics(page) {
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle" })
  await showCaption(page, "3) Admin — Borzo / Porter divert + partner handoff", 2800)

  const email = page.locator('input[type="email"], input[name="email"]').first()
  const pass = page.locator('input[type="password"]').first()
  await email.fill(ADMIN_EMAIL)
  await pass.fill(ADMIN_PASSWORD)
  await humanClick(page.locator("button").filter({ hasText: /sign in|log in|login/i }).first())
  await page.waitForURL(/\/admin(\/|$)/, { timeout: 20000 }).catch(() => {})
  await pause(1200)

  await page.goto(`${BASE_URL}/admin/donations`, { waitUntil: "networkidle" })
  await showCaption(page, "Donations — Launch logistics buttons on each card.", 3000)
  await pause(1000)

  const launchLabel = page.getByText("Launch logistics").first()
  if (await launchLabel.isVisible().catch(() => false)) {
    await focusElement(page, launchLabel)
    await focusElement(page, page.getByRole("button", { name: /Copy building/i }).first())
    await focusElement(page, page.getByRole("button", { name: /Open Borzo/i }).first())
    await focusElement(page, page.getByRole("button", { name: /Open Porter/i }).first())
    await focusElement(page, page.getByRole("button", { name: /Partner page/i }).first())
    await pause(1600)
  } else {
    await showCaption(page, "No donation cards in this filter — buttons appear when submissions exist.", 3200)
  }

  await page.goto(`${BASE_URL}/admin/partners`, { waitUntil: "networkidle" })
  await showCaption(page, "Partners — WhatsApp / Email redirect for handoff.", 2800)
  const wa = page.getByRole("button", { name: /^WhatsApp$/i }).first()
  if (await wa.isVisible().catch(() => false)) {
    await focusElement(page, wa)
    await focusElement(page, page.getByRole("button", { name: /^Email$/i }).first())
  } else {
    await showCaption(page, "No pending applications right now — WhatsApp/Email show on pending rows.", 3000)
  }
  await pause(1400)

  await showCaption(page, "Launch items walkthrough complete.", 2600)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  try {
    const res = await fetch(BASE_URL, { method: "GET" })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    console.error(`Cannot reach ${BASE_URL}. Start Vite first: npm run dev`)
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
    await reachHandoverStep(page)
    await recordPrivacyHandover(page)
    await recordQrPage(page)
    await recordAdminLogistics(page)
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

  const leftovers = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".webm") && f !== FINAL_NAME)
  for (const f of leftovers) {
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
