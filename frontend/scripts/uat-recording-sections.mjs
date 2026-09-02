/**
 * Records 6 separate UAT videos — one per checklist section.
 * Run: npm run record:uat-sections
 */
import { chromium } from "playwright"
import { mkdir, rename, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  UAT_TEST_USER,
  pause,
  rand,
  showCaption,
  humanScrollTo,
  getMaxScroll,
  humanBrowsePage,
  focusElement,
  humanType,
  humanClick,
  waitForStep,
  clickContinueWhenReady,
  currentStepHeading,
  loginTestUser,
} from "./uat-recording-helpers.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const BASE_URL = process.env.UAT_BASE_URL || "http://localhost:3002"
const TEST_IMAGE = path.join(ROOT, "public", "images", "uat-clothing-photo.jpg")
const SESSION_FILE = path.join(OUT_DIR, ".uat-session.json")

const SECTIONS = [
  { file: "reloved-uat-01-homepage-photos.webm", title: "1. Homepage & photos", run: recordSection1 },
  { file: "reloved-uat-02-wording.webm", title: "2. Updated wording", run: recordSection2 },
  { file: "reloved-uat-03-button-colours.webm", title: "3. Button colours", run: recordSection3 },
  { file: "reloved-uat-04-photo-ai.webm", title: "4. Photo upload & AI", run: recordSection4, needsLogin: true },
  { file: "reloved-uat-05-handover-logistics.webm", title: "5. Handover / logistics", run: recordSection5, needsLogin: true },
  { file: "reloved-uat-06-brand-colours.webm", title: "6. Brand colours", run: recordSection6 },
]

async function recordSection1(page) {
  await showCaption(page, "Section 1 — Homepage & photos", 2200)
  await page.goto(BASE_URL, { waitUntil: "networkidle" })
  await showCaption(page, "1.1 — RELOVED logo loads in the header.", 2600)
  await focusElement(page, page.locator('img[alt*="RELOVED"], img[alt*="Reloved"]').first())
  await humanBrowsePage(page, { sections: 4 })
  await showCaption(page, "1.2 — Wall of Kindness: item thumbnails load on the home page.", 2800)
  await humanScrollTo(page, await getMaxScroll(page) / 2)
  await pause(1200)
  await humanScrollTo(page, await getMaxScroll(page))
  await pause(1000)
  await showCaption(page, "1.3 — Opening an item shows its photo clearly.", 2400)
  const itemLink = page.locator('a[href^="/drop/"]').first()
  await focusElement(page, itemLink)
  await humanClick(itemLink)
  await page.waitForLoadState("networkidle")
  await humanBrowsePage(page, { sections: 4 })
  await focusElement(page, page.locator("img").first())
  await showCaption(page, "Item detail photo loads correctly.", 2200)
}

async function recordSection2(page) {
  await showCaption(page, "Section 2 — Updated wording", 2200)
  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
  await humanBrowsePage(page, { sections: 3 })
  await showCaption(page, "2.1 — Step 1 headline: “Drop something. Pass it on.”", 3200)
  await focusElement(page, page.locator("h2", { hasText: "Drop something. Pass it on." }))
  await pause(1000)
}

async function recordSection3(page) {
  await showCaption(page, "Section 3 — Button colours", 2200)
  await page.goto(BASE_URL, { waitUntil: "networkidle" })
  await showCaption(page, "3.1 — Navbar: Drop an item is black.", 2400)
  await focusElement(page, page.locator("nav button, header button", { hasText: /^Drop an item$/ }).first())
  await showCaption(page, "3.2 — Home hero: Drop an item and Claim an item are black.", 2800)
  await focusElement(page, page.locator("button", { hasText: /^Drop an item$/ }).first())
  await focusElement(page, page.locator("button", { hasText: /^Claim an item$/ }).first())
  await humanScrollTo(page, await getMaxScroll(page))
  await showCaption(page, "3.2b — Bottom CTAs: Drop an item now is black; Explore Wall is outlined.", 3000)
  await focusElement(page, page.locator("button", { hasText: /^Drop an item now$/i }))
  await focusElement(page, page.locator("button", { hasText: /^Explore Wall$/i }))
  await page.goto(`${BASE_URL}/drop/abercrombie-fitch-green-af-ny-92-tee`, { waitUntil: "networkidle" })
  await showCaption(page, "3.3 — Item page: Claim this item is black.", 2600)
  await focusElement(page, page.locator("button", { hasText: /Claim this item/i }))
  await showCaption(page, "3.4 — Need help? stays green (small link, not a main button).", 2600)
  await focusElement(page, page.locator("button", { hasText: /Need help/i }))
  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
  await showCaption(page, "3.5 — Drop flow: Continue and Submit are black.", 2400)
  await focusElement(page, page.locator("button", { hasText: /^Continue$/ }))
  await showCaption(page, "3.6 — One Item / Multiple Items chips are pink when selected.", 2600)
  await humanClick(page.locator("button", { hasText: "One Item" }))
  await focusElement(page, page.locator("button", { hasText: "One Item" }))
  await showCaption(page, "3.7 — Upload from gallery is green.", 2400)
  await focusElement(page, page.locator("button", { hasText: "Upload from gallery" }))
  await page.goto(`${BASE_URL}/contact`, { waitUntil: "networkidle" })
  await humanBrowsePage(page, { sections: 2 })
  await showCaption(page, "3.8 — Contact page: Send Message is black.", 2600)
  await focusElement(page, page.locator("button", { hasText: /Send Message/i }))
  await page.goto(`${BASE_URL}/account/login`, { waitUntil: "networkidle" })
  await humanBrowsePage(page, { sections: 2 })
  await showCaption(page, "3.9 — Account login: Send code is black.", 2600)
  await focusElement(page, page.locator("button", { hasText: /Send code/i }))
}

async function recordSection4(page) {
  await showCaption(page, "Section 4 — Photo upload & AI", 2200)
  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
  await showCaption(page, "4.1 — Upload a real clothes photo with background visible.", 2800)
  await humanBrowsePage(page, { sections: 2 })
  await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE)
  await pause(rand(1500, 2200))
  await humanBrowsePage(page, { sections: 2 })
  await showCaption(page, "4.2 — After Continue, the system shows “Analyzing photos…”", 2800)
  await clickContinueWhenReady(page, 90000)
  for (let i = 0; i < 90; i++) {
    if ((await currentStepHeading(page)) === "Item Details") break
    const btn = page.locator("button").filter({ hasText: /^Continue$/ })
    const label = (await btn.textContent().catch(() => "")) || ""
    if (!label.includes("Analyzing") && (await btn.isEnabled().catch(() => false))) await humanClick(btn)
    if ((await currentStepHeading(page)) === "Item Details") break
    await pause(1000)
  }
  if (!(await waitForStep(page, "Item Details", 20000))) throw new Error("Item Details step did not appear")
  await showCaption(page, "4.3 — Background removed: clean cut-out on white.", 3000)
  await humanBrowsePage(page, { sections: 3 })
  await showCaption(page, "4.4 — Title, category, and description are suggested — editable.", 3000)
  await focusElement(page, page.getByPlaceholder("e.g. Vintage Denim Jacket"))
  await focusElement(page, page.getByPlaceholder(/Why are you giving/i))
}

async function recordSection5(page) {
  await showCaption(page, "Section 5 — Handover / logistics", 2200)
  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
  await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE)
  await pause(rand(1200, 1800))
  await clickContinueWhenReady(page, 90000)
  for (let i = 0; i < 90; i++) {
    if ((await currentStepHeading(page)) === "Item Details") break
    const btn = page.locator("button").filter({ hasText: /^Continue$/ })
    const label = (await btn.textContent().catch(() => "")) || ""
    if (!label.includes("Analyzing") && (await btn.isEnabled().catch(() => false))) await humanClick(btn)
    if ((await currentStepHeading(page)) === "Item Details") break
    await pause(1000)
  }
  if (!(await waitForStep(page, "Item Details", 20000))) throw new Error("Item Details step did not appear")
  const title = page.getByPlaceholder("e.g. Vintage Denim Jacket")
  if ((await title.inputValue().catch(() => "")).trim().length < 2) await humanType(title, "White crew neck t-shirt")
  const sizeSelect = page.locator('label:has-text("Size")').locator("..").locator("select")
  if (await sizeSelect.isVisible().catch(() => false) && !(await sizeSelect.inputValue().catch(() => ""))) {
    await sizeSelect.selectOption({ index: 1 })
    await pause(500)
  }
  const desc = page.getByPlaceholder(/Why are you giving/i)
  if ((await desc.inputValue().catch(() => "")).trim().length < 5) await humanType(desc, "Clean white tee, gently used.")
  await clickContinueWhenReady(page)
  if ((await currentStepHeading(page)) === "Donor Details") await clickContinueWhenReady(page)
  if (!(await waitForStep(page, "How should this reach them?", 20000))) throw new Error("Handover step did not appear")
  const logisticsSelect = page.locator('select:has(option[value="receiver_collects"])')
  await showCaption(page, "5.1 — No old delivery cards or “Coming soon”.", 2600)
  await showCaption(page, "5.2 — One dropdown with three handover options.", 2600)
  await humanBrowsePage(page, { sections: 2 })
  await logisticsSelect.selectOption("receiver_collects")
  await pause(600)
  await showCaption(page, "5.3 — Receiver collects: pickup address, date range, time window.", 2800)
  await humanClick(page.locator("button", { hasText: "Next 3 days" }))
  await humanClick(page.locator("button", { hasText: "Mornings" }))
  await humanBrowsePage(page, { sections: 2 })
  await logisticsSelect.selectOption("giver_sends")
  await pause(600)
  await showCaption(page, "5.4 — I send it: delivery address only; pickup fields hide.", 2800)
  await humanType(page.locator("textarea").first(), "Flat 12, Bandra West, Mumbai 400050")
  await humanBrowsePage(page, { sections: 2 })
  await logisticsSelect.selectOption("porter_arranged")
  await pause(600)
  await showCaption(page, "5.5 — Porter arranged: Receiver pays / I pay choice.", 2800)
  await humanClick(page.locator("label", { hasText: "Receiver pays" }))
  await humanBrowsePage(page, { sections: 2 })
  await clickContinueWhenReady(page)
  if (!(await waitForStep(page, "Review & Submit", 20000))) throw new Error("Review step did not appear")
  await showCaption(page, "5.6 — Review step summarises your chosen handover option.", 3200)
  await humanBrowsePage(page, { sections: 4 })
}

async function recordSection6(page) {
  await showCaption(page, "Section 6 — Brand colours (logo match)", 2200)
  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
  await showCaption(page, "6.1 — Logo pink (#EC2F9B) on chips and small highlights.", 3000)
  await humanClick(page.locator("button", { hasText: "One Item" }))
  await focusElement(page, page.locator("button", { hasText: "One Item" }))
  await humanBrowsePage(page, { sections: 2 })
  await showCaption(page, "6.2 — Logo green (#BFE53A) on upload and help controls.", 3000)
  await focusElement(page, page.locator("button", { hasText: "Upload from gallery" }))
  await page.goto(`${BASE_URL}/drop/abercrombie-fitch-green-af-ny-92-tee`, { waitUntil: "networkidle" })
  await focusElement(page, page.locator("button", { hasText: /Need help/i }))
  await showCaption(page, "Green accent on Need help? — matches the logo.", 2600)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  let storageState = null

  try {
    if (SECTIONS.some((s) => s.needsLogin)) {
      const loginContext = await browser.newContext({ viewport: { width: 1400, height: 900 } })
      const loginPage = await loginContext.newPage()
      await showCaption(loginPage, `Logging in as ${UAT_TEST_USER.name} for sections 4 & 5.`, 2400)
      await loginTestUser(loginPage, BASE_URL)
      storageState = await loginContext.storageState()
      await writeFile(SESSION_FILE, JSON.stringify(storageState, null, 2))
      await loginContext.close()
    }

    for (const section of SECTIONS) {
      console.log(`Recording: ${section.title}`)
      const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
        recordVideo: { dir: OUT_DIR, size: { width: 1400, height: 900 } },
        ...(section.needsLogin && storageState ? { storageState } : {}),
      })
      const page = await context.newPage()
      const finalPath = path.join(OUT_DIR, section.file)
      const video = page.video()
      try {
        await section.run(page)
        await pause(800)
      } finally {
        await context.close()
      }
      if (!video) throw new Error(`No video for ${finalPath}`)
      const tempPath = await video.path()
      try {
        await unlink(finalPath)
      } catch {
        // ok
      }
      await rename(tempPath, finalPath)
      console.log(`  Saved: ${finalPath}`)
    }
  } finally {
    await browser.close()
  }

  console.log("\nAll section videos saved to:", OUT_DIR)
  for (const section of SECTIONS) console.log(`  - ${section.file}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
