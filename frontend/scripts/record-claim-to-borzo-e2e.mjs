/**
 * End-to-End Screen Recording of the complete Claim -> Admin Approval -> Borzo Flow:
 * 1) Claimer discovers item on Wall of Kindness (/drop) and submits claim (Rs 0 Free).
 * 2) Claimer receives confirmation email (#4 claim-confirmation-user.html).
 * 3) Admin reviews and approves claim in Admin Ops dashboard (/admin/item-requests).
 * 4) Claimer receives approval decision email (#8 claim-decision.html).
 * 5) Admin clicks "Open Borzo" button -> Opens Borzo India portal with building & gate instructions in clipboard.
 * 6) 1-Click Borzo API: Admin estimates live Borzo fare & books rider in 1 click.
 * 7) Live Borzo Courier Tracking: Shows live map, assigned rider & gate security handoff.
 * 8) Claimer profile (/account): Card updated with live Borzo Order #, Booked status & 1-click "Track" button.
 *
 * Runs for both Desktop (1440x900) and Mobile (390x844).
 */
import { chromium } from "playwright"
import { mkdir, rename, unlink, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  UAT_TEST_USER,
  pause,
  showCaption,
  focusElement,
  humanType,
  humanClick,
} from "./uat-recording-helpers.mjs"
import { getUatSession } from "./setup-uat-test-user.mjs"
import { refreshUatClaimAccount } from "./refresh-uat-claim-account.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const TEMPLATES_DIR = path.resolve(ROOT, "..", "firebase-backend", "email-templates")
const BASE_URL = process.env.UAT_BASE_URL || "https://reloved-digital.web.app"
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"

async function finalizeVideo(video, filename) {
  const tempPath = await video.path()
  const finalPath = path.join(OUT_DIR, filename)
  try {
    await unlink(finalPath)
  } catch {
    // ignore
  }
  await rename(tempPath, finalPath)
  for (const f of await readdir(OUT_DIR)) {
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

async function getAdminToken() {
  const login = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.json())
  if (!login.token) throw new Error(`Admin login failed: ${JSON.stringify(login)}`)
  return login.token
}

async function generateEmailPreviews(itemTitle) {
  const confRaw = await readFile(path.join(TEMPLATES_DIR, "claim-confirmation-user.html"), "utf8")
  const confFilled = confRaw
    .replaceAll("{{ params.ITEM_TITLE }}", itemTitle)
    .replaceAll("{{ params.REQUESTER_NAME }}", UAT_TEST_USER.name)
  const confPath = path.join(OUT_DIR, "preview-claimer-confirmation.html")
  await writeFile(confPath, confFilled, "utf8")

  const decRaw = await readFile(path.join(TEMPLATES_DIR, "claim-decision.html"), "utf8")
  const decFilled = decRaw
    .replaceAll("{{ params.DECISION_LABEL }}", "Approved")
    .replaceAll("{{ params.DECISION_COLOR }}", "#5C8A22")
    .replaceAll("{{ params.ITEM_TITLE }}", itemTitle)
    .replaceAll("{{ params.HEADLINE }}", "Your claim was accepted")
    .replaceAll("{{ params.REQUESTER_NAME }}", UAT_TEST_USER.name)
    .replaceAll("{{ params.DECISION_MESSAGE }}", "Great news � your claim was approved. Reloved items are ?0 free.")
    .replaceAll(
      "{{ params.NEXT_STEPS }}",
      "Open your profile to book Borzo courier delivery from the giver's building main gate directly to yours. Reloved items remain ?0 free."
    )
    .replaceAll("{{ params.PROFILE_URL }}", `${BASE_URL}/account`)
    .replaceAll("{{ params.CTA_LABEL }}", "Open your profile & Book Borzo")
  const decPath = path.join(OUT_DIR, "preview-claimer-approved.html")
  await writeFile(decPath, decFilled, "utf8")

  return { confPath, decPath }
}

async function loginDonor(page, session) {
  await page.goto(`${BASE_URL}/account/login`, { waitUntil: "networkidle" })
  await page.evaluate((token) => {
    localStorage.setItem("reloved_donor_token", token)
  }, session.token)
  await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  await pause(1000)
  if (page.url().includes("login")) {
    const fresh = await getUatSession({ forceRefresh: true })
    await page.evaluate((t) => localStorage.setItem("reloved_donor_token", t), fresh.token)
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  }
}

async function adminLogin(page, token) {
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle" })
  if (token) {
    await page.evaluate((t) => {
      localStorage.setItem("reloved_admin_token", t)
    }, token)
  } else {
    await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN_EMAIL)
    await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD)
    await humanClick(page.locator("button").filter({ hasText: /sign in|log in|login/i }).first())
    await page.waitForURL(/\/admin(\/|$)/, { timeout: 25000 }).catch(() => {})
  }
  await page.goto(`${BASE_URL}/admin/item-requests`, { waitUntil: "networkidle" })
  await pause(1500)
}

async function runEndToEndScenario({ isMobile, filename }) {
  const viewport = isMobile
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 }

  console.log(`\n=======================================================`)
  console.log(`Starting ${isMobile ? "MOBILE" : "DESKTOP"} Recording -> ${filename}`)
  console.log(`Viewport: ${viewport.width}x${viewport.height}`)
  console.log(`=======================================================\n`)

  console.log("Refreshing UAT claim quota & resetting wall items...")
  await refreshUatClaimAccount()

  const session = await getUatSession({ forceRefresh: false })
  const admToken = await getAdminToken()

  // Clean up any stale UAT requests
  const staleList = await fetch(`${API_BASE}/api/admin/item-requests`, {
    headers: { Authorization: `Bearer ${admToken}` },
  }).then((r) => r.json())
  for (const r of staleList.requests || []) {
    const isUat =
      String(r.requesterPhone || "").includes(UAT_TEST_USER.phone) ||
      String(r.requesterTarget || "").includes(UAT_TEST_USER.phone)
    if (isUat && r.status !== "rejected") {
      await fetch(`${API_BASE}/api/admin/item-requests/${r.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${admToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      })
    }
  }

  // Find a free wall item
  const wall = await fetch(`${API_BASE}/api/items?status=wall`).then((r) => r.json())
  const item = (wall.items || []).find((i) => i.publicStatus === "available" || i.publicVisibility)
  if (!item?.id) throw new Error("No wall item available to claim")
  console.log("Selected Wall Item:", item.id, item.title)

  const { confPath, decPath } = await generateEmailPreviews(item.title)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 2 : 1,
    recordVideo: { dir: OUT_DIR, size: viewport },
    permissions: ["clipboard-read", "clipboard-write"],
  })

  const page = await context.newPage()

  // Auto-accept confirmation dialogs
  page.on("dialog", async (dialog) => {
    console.log(`Dialog [${dialog.type()}]: ${dialog.message()}`)
    await pause(1200)
    await dialog.accept()
  })

  const video = page.video()

  try {
    // ------------------------------------------------------------------------
    // SCENE 1: CLAIMER BROWSER WALL OF KINDNESS (/drop) & SUBMITS CLAIM
    // ------------------------------------------------------------------------
    await loginDonor(page, session)
    await showCaption(
      page,
      "RELOVED FLOW: Claim item (Rs 0 Free) -> Admin Approval -> Open Borzo -> API Booking -> Tracking",
      3500
    )

    await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle" })
    await pause(1500)

    await showCaption(
      page,
      `1) Claimer explores Wall of Kindness: Selects "${item.title}".`,
      3400
    )

    // Navigate to the selected item detail page
    await page.goto(`${BASE_URL}/drop/${item.slug}`, { waitUntil: "networkidle" })
    await pause(1500)

    const claimBtn = page.getByRole("button", { name: /Claim this item|Take this item/i }).first()
    await claimBtn.waitFor({ state: "visible", timeout: 15000 })
    await focusElement(page, claimBtn)

    await showCaption(
      page,
      "2) Items on Reloved are 100% free. Clicking 'Claim this item'.",
      3000
    )
    await humanClick(claimBtn)
    await pause(1500)

    // Fill Step 1 of TakeItemModal
    const nameInput = page.locator('input[placeholder*="full name" i], input[name="name"]').first()
    if (await nameInput.isVisible().catch(() => false)) {
      if (!(await nameInput.inputValue()).trim()) {
        await humanType(nameInput, UAT_TEST_USER.name)
      }
    }
    const phoneInput = page.locator('input[type="tel"]').first()
    if (await phoneInput.isVisible().catch(() => false)) {
      if (!(await phoneInput.inputValue()).trim()) {
        await humanType(phoneInput, UAT_TEST_USER.phone)
      }
    }
    const buildingInput = page.locator('input[placeholder*="building or landmark" i]').first()
    if (await buildingInput.isVisible().catch(() => false)) {
      await buildingInput.fill("")
      await humanType(buildingInput, "Phoenix Palladium, Lower Parel, Mumbai")
    }

    const continueBtn = page.getByRole("button", { name: /^Continue$/i }).first()
    await focusElement(page, continueBtn)
    await humanClick(continueBtn)
    await pause(1200)

    // Fill Step 2 of TakeItemModal (checkboxes)
    const checkboxes = page.locator('.fixed input[type="checkbox"]')
    const count = await checkboxes.count()
    for (let i = 0; i < count; i++) {
      const cb = checkboxes.nth(i)
      if (!(await cb.isChecked().catch(() => true))) {
        await cb.check({ force: true })
      }
    }
    await pause(800)

    const submitBtn = page.getByRole("button", { name: /Send request|Accept.*request|Submit/i }).first()
    await focusElement(page, submitBtn)
    await humanClick(submitBtn)
    await pause(2500)

    // Show the Request Sent modal
    await showCaption(
      page,
      "3) Request sent! Handover is coordinated by Reloved. Claim confirmation email dispatched.",
      3600
    )
    await pause(2000)

    // ------------------------------------------------------------------------
    // SCENE 2: CLAIMER RECEIVES CONFIRMATION EMAIL TEMPLATE (#4)
    // ------------------------------------------------------------------------
    await showCaption(
      page,
      "4) INBOX: Claimer receives 'We've got your request' confirmation email template.",
      3500
    )
    await page.goto("file:///" + confPath.replace(/\\/g, "/"), { waitUntil: "networkidle" })
    await pause(4000)

    // ------------------------------------------------------------------------
    // SCENE 3: ADMIN OPS DASHBOARD REVIEW & APPROVAL
    // ------------------------------------------------------------------------
    await showCaption(
      page,
      "5) ADMIN OPS: Reviewing incoming claim request in the Reloved Admin Dashboard.",
      3500
    )
    await adminLogin(page, admToken)
    await pause(1200)

    // Pending tab is default
    const approveBtn = page.getByRole("button", { name: /^Approve$/i }).first()
    await approveBtn.waitFor({ state: "visible", timeout: 15000 })
    await focusElement(page, approveBtn)

    await showCaption(
      page,
      "6) Admin clicks 'Approve': Claim accepted, triggering approval notification to claimer.",
      3500
    )
    await humanClick(approveBtn)
    await pause(2500)

    // Switch to approved tab
    const approvedTab = page.getByRole("button", { name: /^approved$/i }).first()
    if (await approvedTab.isVisible().catch(() => false)) {
      await humanClick(approvedTab)
      await pause(1500)
    }

    // ------------------------------------------------------------------------
    // SCENE 4: CLAIMER RECEIVES APPROVAL DECISION EMAIL TEMPLATE (#8)
    // ------------------------------------------------------------------------
    await showCaption(
      page,
      "7) INBOX: Claimer receives 'APPROVED' Decision Email with profile booking link.",
      3600
    )
    await page.goto("file:///" + decPath.replace(/\\/g, "/"), { waitUntil: "networkidle" })
    await pause(4000)

    // ------------------------------------------------------------------------
    // SCENE 5: WHAT HAPPENS WHEN 'OPEN BORZO' BUTTON IS CLICKED
    // ------------------------------------------------------------------------
    await showCaption(
      page,
      "8) ADMIN: What happens when 'Open Borzo' button is clicked?",
      3500
    )
    await adminLogin(page, admToken)

    const approvedTabBtn = page.getByRole("button", { name: /^approved$/i }).first()
    if (await approvedTabBtn.isVisible().catch(() => false)) {
      await humanClick(approvedTabBtn)
      await pause(1500)
    }

    const openBorzoBtn = page.getByRole("button", { name: /Open Borzo/i }).first()
    await openBorzoBtn.waitFor({ state: "visible", timeout: 15000 })
    await focusElement(page, openBorzoBtn)

    await showCaption(
      page,
      "Clicking 'Open Borzo': Copies gate note & company phone, opens Borzo portal.",
      3600
    )

    // Catch the popup/new page or navigate
    const [borzoPopup] = await Promise.all([
      context.waitForEvent("page", { timeout: 8000 }).catch(() => null),
      humanClick(openBorzoBtn),
    ])

    if (borzoPopup) {
      await borzoPopup.waitForLoadState("domcontentloaded").catch(() => {})
      await borzoPopup.bringToFront()
      await showCaption(
        borzoPopup,
        "Borzo India Portal opened! Pickup building, gate security note & company phone ready on clipboard.",
        3800
      )
      await pause(3500)
      await borzoPopup.close().catch(() => {})
      await page.bringToFront()
    } else {
      await pause(2000)
    }

    // ------------------------------------------------------------------------
    // SCENE 6: 1-CLICK INTEGRATED BORZO API BOOKING
    // ------------------------------------------------------------------------
    await showCaption(
      page,
      "9) 1-Click Integrated Borzo API: Instant fare estimation & automated courier booking.",
      3600
    )

    const borzoSection = page.locator("text=Borzo Delivery API").first()
    await borzoSection.scrollIntoViewIfNeeded()
    await pause(1000)

    const estimateBtn = page.getByRole("button", { name: /Estimate Borzo Fee/i }).first()
    if (await estimateBtn.isVisible().catch(() => false)) {
      await focusElement(page, estimateBtn)
      await humanClick(estimateBtn)
      await pause(2500)
    }

    const bookApiBtn = page.getByRole("button", { name: /Book via Borzo API/i }).first()
    if (await bookApiBtn.isVisible().catch(() => false)) {
      await focusElement(page, bookApiBtn)
      await humanClick(bookApiBtn)
      await pause(4000)
    }

    await showCaption(
      page,
      "10) Order placed on Borzo! Status: rider_dispatched. Live tracking URL generated.",
      3800
    )

    const trackLink = page.locator('a:has-text("Track Live on Borzo")').first()
    await trackLink.waitFor({ state: "visible", timeout: 15000 }).catch(() => {})
    let trackingUrl = ""
    if (await trackLink.isVisible().catch(() => false)) {
      trackingUrl = (await trackLink.getAttribute("href")) || ""
      await focusElement(page, trackLink)
    }
    await pause(2500)

    // ------------------------------------------------------------------------
    // SCENE 7: LIVE BORZO COURIER TRACKING
    // ------------------------------------------------------------------------
    if (trackingUrl && trackingUrl.startsWith("http")) {
      await showCaption(
        page,
        "11) Live Borzo Courier Tracking: Route map, rider contact & gate handoff instructions.",
        4000
      )
      await page.goto(trackingUrl, { waitUntil: "networkidle" })
      await pause(4000)
    }

    // ------------------------------------------------------------------------
    // SCENE 8: CLAIMER PROFILE (/account) REAL-TIME STATUS
    // ------------------------------------------------------------------------
    await showCaption(
      page,
      "12) CLAIMER PROFILE: Requested items show live Borzo Order #, Booked status & 1-click Track button.",
      3800
    )
    await loginDonor(page, session)
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
    await pause(1500)

    const requestedHeading = page.getByRole("heading", { name: /Items you've requested/i })
    await requestedHeading.waitFor({ state: "visible", timeout: 20000 })
    await requestedHeading.scrollIntoViewIfNeeded()
    await pause(1200)

    const bookedCard = page.locator("div").filter({ hasText: item.title }).filter({ hasText: "Borzo" }).first()
    if (await bookedCard.isVisible().catch(() => false)) {
      await focusElement(page, bookedCard)
    }
    await pause(3000)

    await showCaption(
      page,
      "Flow Complete: Claim -> Emails -> Admin Approval -> Open Borzo -> 1-Click Booking -> Tracking.",
      3600
    )
    await pause(1200)
  } finally {
    await context.close()
    await browser.close()
  }

  const finalVideo = await finalizeVideo(video, filename)
  console.log(`Video saved to: ${finalVideo}`)
  return finalVideo
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const isOnlyDesktop = process.argv.includes("--desktop")
  const isOnlyMobile = process.argv.includes("--mobile")

  if (isOnlyMobile) {
    await runEndToEndScenario({ isMobile: true, filename: "reloved-claim-to-borzo-mobile.webm" })
  } else if (isOnlyDesktop) {
    await runEndToEndScenario({ isMobile: false, filename: "reloved-claim-to-borzo-desktop.webm" })
  } else {
    // Run both desktop and mobile
    await runEndToEndScenario({ isMobile: false, filename: "reloved-claim-to-borzo-desktop.webm" })
    await pause(2000)
    await runEndToEndScenario({ isMobile: true, filename: "reloved-claim-to-borzo-mobile.webm" })
  }

  console.log("\n=======================================================")
  console.log("ALL RECORDINGS COMPLETED SUCCESSFULLY!")
  console.log("Desktop: frontend/recordings/reloved-claim-to-borzo-desktop.webm")
  console.log("Mobile:  frontend/recordings/reloved-claim-to-borzo-mobile.webm")
  console.log("=======================================================\n")
}

main().catch((err) => {
  console.error("Recording error:", err)
  process.exit(1)
})
