/**
 * Improved E2E ops recordings (full give/claim through delivery pay note).
 *   npm run record:ops-flows
 *   RECORD_ONLY=claim|give npm run record:ops-flows
 *
 * After claim recording, test claims from the UAT user are rejected (unclaimed).
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
import { getUatSession } from "./setup-uat-test-user.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const BASE_URL = process.env.UAT_BASE_URL || "http://localhost:3000"
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const TEST_IMAGE = path.join(ROOT, "public", "images", "uat-clothing-photo.jpg")
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"

const GIVE_VIDEO = "reloved-ops-give-admin-borzo.webm"
const CLAIM_VIDEO = "reloved-ops-claim-admin-borzo.webm"

async function finalizeVideo(video, finalName) {
  if (!video) throw new Error("No video recorded")
  const tempPath = await video.path()
  const finalPath = path.join(OUT_DIR, finalName)
  try {
    await unlink(finalPath)
  } catch {
    // first run
  }
  await rename(tempPath, finalPath)
  const leftovers = (await readdir(OUT_DIR)).filter(
    (f) => f.endsWith(".webm") && f !== GIVE_VIDEO && f !== CLAIM_VIDEO,
  )
  for (const f of leftovers) {
    if (/^[0-9a-f-]{20,}\.webm$/i.test(f)) {
      try {
        await unlink(path.join(OUT_DIR, f))
      } catch {
        // ignore
      }
    }
  }
  return finalPath
}

async function loginDonorWithCachedSession(page) {
  const session = await getUatSession({ forceRefresh: false })
  await page.addInitScript((token) => {
    localStorage.setItem("reloved_donor_token", token)
  }, session.token)
  await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  await pause(1000)
  if (page.url().includes("login")) {
    const fresh = await getUatSession({ forceRefresh: true })
    await page.evaluate((token) => localStorage.setItem("reloved_donor_token", token), fresh.token)
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  }
  if (page.url().includes("login")) throw new Error("Donor session failed")
  return session
}

async function adminLogin(page) {
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle" })
  await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD)
  await humanClick(page.locator("button").filter({ hasText: /sign in|log in|login/i }).first())
  await page.waitForURL(/\/admin(\/|$)/, { timeout: 25000 }).catch(() => {})
  await pause(1000)
}

async function adminApiToken(page) {
  return page.evaluate(() => localStorage.getItem("reloved_admin_token") || localStorage.getItem("admin_token"))
}

async function unclaimUatRequests(page) {
  // Prefer UI: reject pending + approved UAT requests so items return to wall.
  await adminLogin(page)
  for (const tab of ["pending", "approved"]) {
    await page.goto(`${BASE_URL}/admin/item-requests`, { waitUntil: "networkidle" })
    await pause(800)
    const tabBtn = page.getByRole("button", { name: new RegExp(`^${tab}$`, "i") }).first()
    if (await tabBtn.isVisible().catch(() => false)) await humanClick(tabBtn)
    await pause(1000)

    // Reject via API for reliability
    const token =
      (await page.evaluate(() => {
        for (const k of Object.keys(localStorage)) {
          if (/admin/i.test(k) && localStorage.getItem(k)?.length > 20) return localStorage.getItem(k)
        }
        return null
      })) || ""

    if (!token) {
      console.warn("No admin token for unclaim cleanup")
      continue
    }

    const res = await fetch(`${API_BASE}/api/admin/item-requests?status=${tab}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json().catch(() => ({}))
    const requests = body.requests || []
    for (const r of requests) {
      const phone = String(r.requesterPhone || "")
      const target = String(r.requesterTarget || "")
      const isUat =
        phone.includes(UAT_TEST_USER.phone) ||
        target.includes(UAT_TEST_USER.phone) ||
        String(r.requesterName || "").toLowerCase().includes("uat")
      if (!isUat) continue
      if (r.status === "rejected") continue
      await fetch(`${API_BASE}/api/admin/item-requests/${r.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "rejected" }),
      })
      console.log("Unclaimed (rejected) test request", r.id, r.item?.title)
    }
  }
}

async function fillGiveToReview(page) {
  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
  await showCaption(page, "1) GIVE - upload item photo", 2400)
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
    await pause(800)
  }
  if (!(await waitForStep(page, "Item Details", 30000))) throw new Error("Item Details missing")

  await showCaption(page, "2) Item details - category Clothing-compatible mapping", 2400)
  // Force a known-good category path: select Tops (maps to Clothing on submit)
  const cat = page.locator("select").filter({ has: page.locator('option[value="Tops"]') }).first()
  if (await cat.isVisible().catch(() => false)) {
    await cat.selectOption("Tops")
  }
  const title = page.getByPlaceholder("e.g. Vintage Denim Jacket")
  if ((await title.inputValue().catch(() => "")).trim().length < 2) {
    await humanType(title, "White crew neck t-shirt")
  }
  const sizeSelect = page.locator('label:has-text("Size")').locator("..").locator("select")
  if ((await sizeSelect.isVisible().catch(() => false)) && !(await sizeSelect.inputValue().catch(() => ""))) {
    await sizeSelect.selectOption({ index: 1 })
  }
  const desc = page.getByPlaceholder(/Why are you giving/i)
  if ((await desc.inputValue().catch(() => "")).trim().length < 5) {
    await humanType(desc, "Clean white tee for ops demo.")
  }
  await clickContinueWhenReady(page)

  if ((await currentStepHeading(page)) === "Donor Details") {
    await humanType(page.getByRole("textbox").first(), "UAT Giver")
    await humanType(page.locator('input[type="tel"]'), UAT_TEST_USER.phone)
    await clickContinueWhenReady(page)
  }
  if (!(await waitForStep(page, "How should this reach them?", 25000))) {
    throw new Error("Handover missing")
  }
}

async function recordGiveFlow(page) {
  await fillGiveToReview(page)

  await showCaption(page, "3) Privacy + Borzo via RELOVED - claimer pays courier", 2800)
  await focusElement(page, page.getByText(/Important privacy rule/i).first())
  const logisticsSelect = page.locator('select:has(option[value="porter_arranged"])')
  await logisticsSelect.selectOption("porter_arranged")
  await pause(600)
  await focusElement(page, page.getByText(/pays the porter \/ Borzo fee/i).first())
  const buildingInput = page.locator('input[placeholder*="building or landmark" i]').first()
  if (await buildingInput.isVisible().catch(() => false)) {
    await buildingInput.fill("")
    await humanType(buildingInput, "Linking Road, Bandra West")
  }
  await clickContinueWhenReady(page)

  if (!(await waitForStep(page, "Review & Submit", 25000))) throw new Error("Review missing")
  await showCaption(page, "4) Review - accept and submit (no category error)", 2600)
  const checkboxes = page.locator('input[type="checkbox"]')
  for (let i = 0; i < (await checkboxes.count()); i++) {
    const box = checkboxes.nth(i)
    if (!(await box.isChecked().catch(() => true))) await box.check({ force: true })
  }
  await focusElement(page, page.getByText(/Claimant \/ receiver pays/i).first())

  await humanClick(page.locator("button").filter({ hasText: /I Accept|Submit|Drop this item/i }).first())
  await page.waitForURL(/\/give\/success\//, { timeout: 45000 })
  await pause(1500)
  await showCaption(page, "5) Success - next steps + claimer pays Rs 40-80", 3200)
  await focusElement(page, page.getByText(/What happens next/i).first())
  await focusElement(page, page.getByText(/40�80|40-80/i).first())

  await adminLogin(page)
  await showCaption(page, "6) ADMIN - approve donation", 2600)
  await page.goto(`${BASE_URL}/admin/donations`, { waitUntil: "networkidle" })
  await pause(1200)
  const submitted = page.getByRole("button", { name: /^submitted$/i }).first()
  if (await submitted.isVisible().catch(() => false)) await humanClick(submitted)
  await pause(800)
  // also try pending_review filter via all
  const approveBtn = page.getByRole("button", { name: /^Approve$/i }).first()
  if (!(await approveBtn.isVisible().catch(() => false))) {
    await humanClick(page.getByRole("button", { name: /^all$/i }).first())
    await pause(1000)
  }
  if (await page.getByRole("button", { name: /^Approve$/i }).first().isVisible().catch(() => false)) {
    await humanClick(page.getByRole("button", { name: /^Approve$/i }).first())
    await pause(1500)
    await showCaption(page, "Donation approved.", 2000)
  }

  await humanClick(page.getByRole("button", { name: /^all$/i }).first())
  await pause(1000)
  await showCaption(page, "7) Assign Borzo delivery partner (manual ops)", 3000)
  const copyBtn = page.getByRole("button", { name: /Copy building/i }).first()
  const borzoBtn = page.getByRole("button", { name: /Open Borzo/i }).first()
  if (await copyBtn.isVisible().catch(() => false)) {
    await focusElement(page, copyBtn)
    await humanClick(copyBtn)
  }
  if (await borzoBtn.isVisible().catch(() => false)) {
    await focusElement(page, borzoBtn)
    const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null)
    await humanClick(borzoBtn)
    const popup = await popupPromise
    await showCaption(page, "Borzo opened - ops pastes building + gate note, company phone.", 3400)
    if (popup) await popup.close().catch(() => {})
  }
  await showCaption(page, "GIVE flow complete: submit -> approve -> Borzo.", 2800)
}

async function recordClaimFlow(page) {
  await showCaption(page, "1) CLAIM - sign in and open Wall", 2400)
  await loginDonorWithCachedSession(page)

  await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle" })
  await pause(1000)

  let claimed = false
  const links = page.locator('a[href*="/drop/"], a[href*="/items/"]')
  const count = await links.count()
  for (let i = 0; i < Math.min(count, 12); i++) {
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle" })
    await pause(500)
    await humanClick(page.locator('a[href*="/drop/"], a[href*="/items/"]').nth(i))
    await page.waitForLoadState("networkidle")
    await pause(700)
    const claimBtn = page.getByRole("button", { name: /Claim this item|Request this item|Take this item/i }).first()
    if (!(await claimBtn.isVisible().catch(() => false))) continue
    if (!(await claimBtn.isEnabled().catch(() => false))) continue

    await showCaption(page, "2) Claim item - Rs 0 free", 2400)
    await humanClick(claimBtn)
    await pause(900)

    const nameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first()
    if (await nameInput.isVisible().catch(() => false)) {
      if (!(await nameInput.inputValue()).trim()) await humanType(nameInput, UAT_TEST_USER.name)
    }
    const phoneInput = page.locator('input[type="tel"]').first()
    if (await phoneInput.isVisible().catch(() => false)) {
      if (!(await phoneInput.inputValue()).trim()) await humanType(phoneInput, UAT_TEST_USER.phone)
    }
    const addr = page.locator("textarea").first()
    if (await addr.isVisible().catch(() => false)) {
      if (!(await addr.inputValue()).trim()) {
        await humanType(addr, "Linking Road area, Bandra West")
      }
    }
    // Building/landmark field is the AddressAutocomplete input above
    const building = page.locator('input[placeholder*="building or landmark" i]').first()
    if (await building.isVisible().catch(() => false)) {
      if (!(await building.inputValue()).trim()) {
        await humanType(building, "Bandra West, Mumbai")
      }
    }
    const cont = page.getByRole("button", { name: /^Continue$/i }).first()
    if (await cont.isVisible().catch(() => false)) await humanClick(cont)
    await pause(700)
    const boxes = page.locator('.fixed input[type="checkbox"]')
    for (let j = 0; j < (await boxes.count()); j++) {
      const b = boxes.nth(j)
      if (!(await b.isChecked().catch(() => true))) await b.check({ force: true })
    }
    const send = page.getByRole("button", { name: /Accept.*request|Send request|Submit/i }).first()
    if (await send.isVisible().catch(() => false)) {
      await humanClick(send)
      claimed = true
      break
    }
  }
  if (!claimed) throw new Error("Could not claim an item")

  await pause(1800)
  await showCaption(page, "3) Request sent - courier fee note for claimer", 3000)
  await focusElement(page, page.getByText(/40�80|40-80|courier fee/i).first())

  const viewReq = page.getByRole("link", { name: /View my requests/i }).first()
  if (await viewReq.isVisible().catch(() => false)) await humanClick(viewReq)
  else await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  await pause(1200)
  await showCaption(page, "4) Profile - awaiting admin approval", 2600)

  await adminLogin(page)
  await showCaption(page, "5) ADMIN - approve claim", 2400)
  await page.goto(`${BASE_URL}/admin/item-requests`, { waitUntil: "networkidle" })
  await pause(1000)
  const approve = page.getByRole("button", { name: /^Approve$/i }).first()
  if (await approve.isVisible().catch(() => false)) {
    await humanClick(approve)
    await pause(1500)
  }

  await humanClick(page.getByRole("button", { name: /^approved$/i }).first())
  await pause(1200)
  await showCaption(page, "6) Assign Borzo - claimer pays courier", 3000)
  const borzo = page.getByRole("button", { name: /Open Borzo/i }).first()
  if (await borzo.isVisible().catch(() => false)) {
    await focusElement(page, page.getByText(/claimer pays Borzo/i).first())
    const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null)
    await humanClick(borzo)
    const popup = await popupPromise
    await showCaption(page, "Ops books Borzo - paste address, company phone, gate note.", 3200)
    if (popup) await popup.close().catch(() => {})
  }

  await loginDonorWithCachedSession(page)
  await showCaption(page, "7) Profile after approval - pay amount shown", 3200)
  await focusElement(page, page.getByText(/^approved$/i).first())
  await focusElement(page, page.getByText(/typically ?40�80|typically Rs|you pay the courier/i).first())
  await showCaption(page, "Item Rs 0. Delivery: you pay Rs 40-80 (ops confirms exact).", 3600)
  await showCaption(page, "CLAIM flow complete. Cleaning up test claim next.", 2400)

  await unclaimUatRequests(page)
  await showCaption(page, "Test claim unclaimed (rejected) so the wall item is free again.", 2800)
}

async function recordOne(name, runner) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1400, height: 900 } },
    permissions: ["clipboard-read", "clipboard-write"],
  })
  const page = await context.newPage()
  const video = page.video()
  try {
    await runner(page)
  } finally {
    await context.close()
    await browser.close()
  }
  return finalizeVideo(video, name)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  try {
    const res = await fetch(BASE_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    console.error(`Cannot reach ${BASE_URL}. Start Vite: npm run dev`)
    process.exit(1)
  }

  const only = (process.env.RECORD_ONLY || "").toLowerCase()
  if (only !== "claim") {
    console.log("Recording GIVE...")
    console.log("Saved:", await recordOne(GIVE_VIDEO, recordGiveFlow))
  }
  if (only !== "give") {
    console.log("Recording CLAIM...")
    console.log("Saved:", await recordOne(CLAIM_VIDEO, recordClaimFlow))
  }
  console.log("\n1)", path.join(OUT_DIR, GIVE_VIDEO))
  console.log("2)", path.join(OUT_DIR, CLAIM_VIDEO))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
