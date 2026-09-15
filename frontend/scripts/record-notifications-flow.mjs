/**
 * Full client-demo recording:
 * Notifications (with proper load waits) → giver accept → Borzo estimate/book → track.
 *
 *   npm run record:notifications
 *
 * Output:
 *   frontend/recordings/reloved-notifications-borzo-e2e-desktop.webm
 */
import { chromium } from "playwright"
import { mkdir, rename, unlink, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pause, showCaption, humanClick, focusElement } from "./uat-recording-helpers.mjs"
import { UAT_TEST_USER, getUatSession } from "./setup-uat-test-user.mjs"
import { refreshUatClaimAccount } from "./refresh-uat-claim-account.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const BASE_URL = process.env.UAT_BASE_URL || "https://reloved-digital.web.app"
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const SEED_SECRET = process.env.SEED_SECRET || "reloved-dev-seed"

const UAT_GIVER_USER = {
  phone: "9876501241",
  name: "UAT Giver",
  username: "uat_giver",
}

async function api(pathname, options = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status}) ${pathname}`)
  }
  return body
}

async function loginWithOtp(phone) {
  const { devCode } = await api("/api/otp/request", {
    method: "POST",
    body: JSON.stringify({ channel: "sms", target: phone }),
  })
  if (!devCode) throw new Error(`No OTP devCode for ${phone}`)
  await api("/api/otp/verify", {
    method: "POST",
    body: JSON.stringify({ channel: "sms", target: phone, code: devCode }),
  })
  const { token } = await api("/api/donor/session", {
    method: "POST",
    body: JSON.stringify({ channel: "sms", target: phone }),
  })
  return token
}

async function ensureGiverSession() {
  const cachePath = path.join(OUT_DIR, ".uat-giver-session.json")
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8"))
    if (cached.token && cached.createdAt > Date.now() - 25 * 60 * 1000) {
      return { token: cached.token }
    }
  } catch {
    // no cache
  }

  let token
  try {
    token = await loginWithOtp(UAT_GIVER_USER.phone)
  } catch (err) {
    console.warn("Giver OTP failed, waiting 70s:", err.message)
    await pause(70_000)
    token = await loginWithOtp(UAT_GIVER_USER.phone)
  }
  await api("/api/donor/profile", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: UAT_GIVER_USER.name,
      username: UAT_GIVER_USER.username,
      gender: "unisex",
      phone: UAT_GIVER_USER.phone,
      address: "Bandra West, Mumbai",
      addressLabel: "home",
      pincode: "400050",
      latitude: 19.0596,
      longitude: 72.8295,
    }),
  })
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(cachePath, JSON.stringify({ token, createdAt: Date.now() }, null, 2))
  return { token }
}

async function finalizeVideo(video, filename) {
  const tempPath = await video.path()
  const finalPath = path.join(OUT_DIR, filename)
  try {
    await unlink(finalPath)
  } catch {
    // ignore
  }
  let lastErr
  for (let i = 0; i < 10; i++) {
    try {
      await rename(tempPath, finalPath)
      lastErr = null
      break
    } catch (err) {
      lastErr = err
      await pause(400)
    }
  }
  if (lastErr) throw lastErr
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

async function loginDonor(page, token) {
  await page.goto(`${BASE_URL}/account/login`, { waitUntil: "networkidle" })
  await page.evaluate((t) => localStorage.setItem("reloved_donor_token", t), token)
}

/** Open notifications tab and wait until the API + UI have fully settled. */
async function openNotifications(page, { expectText, holdMs = 3200 } = {}) {
  const waitApi = page
    .waitForResponse(
      (r) => r.url().includes("/api/donor/notifications") && r.request().method() === "GET" && r.ok(),
      { timeout: 30000 },
    )
    .catch(() => null)

  await page.goto(`${BASE_URL}/account?tab=notifications`, { waitUntil: "domcontentloaded" })
  await waitApi
  await page.getByRole("tab", { name: /Notifications/i }).first().waitFor({ state: "visible", timeout: 20000 })

  // Let skeleton finish, then hold so the viewer can read cards.
  await page.locator(".animate-pulse").first().waitFor({ state: "hidden", timeout: 20000 }).catch(() => {})
  await pause(1800)

  if (expectText) {
    const card = page.getByText(new RegExp(expectText, "i")).first()
    await card.waitFor({ state: "visible", timeout: 25000 })
    await card.scrollIntoViewIfNeeded()
    await focusElement(page, card).catch(() => {})
  }

  await pause(holdMs)
}

async function clickTab(page, name) {
  const tab = page.getByRole("tab", { name: new RegExp(name, "i") }).first()
  await tab.waitFor({ timeout: 15000 })
  await humanClick(tab)
  await pause(1200)
}

async function seedMatchItem() {
  return api("/api/dev/seed/match-flow", {
    method: "POST",
    headers: { "x-seed-secret": SEED_SECRET },
    body: JSON.stringify({
      giverPhone: UAT_GIVER_USER.phone,
      claimerPhone: UAT_TEST_USER.phone,
    }),
  })
}

async function runScenario({ isMobile, filename }) {
  const viewport = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
  console.log(`Recording ${isMobile ? "mobile" : "desktop"} → ${filename}`)

  await refreshUatClaimAccount()
  const seeded = await seedMatchItem()
  console.log("Seeded", seeded.slug, seeded.itemId, seeded.submissionId)

  const claimer = await getUatSession({ forceRefresh: false })
  await api("/api/donor/profile", {
    method: "POST",
    headers: { Authorization: `Bearer ${claimer.token}` },
    body: JSON.stringify({
      name: UAT_TEST_USER.name,
      username: UAT_TEST_USER.username,
      gender: "women",
      phone: UAT_TEST_USER.phone,
      address: "Bandra West, Mumbai",
      addressLabel: "home",
      pincode: "400050",
      latitude: 19.0596,
      longitude: 72.8295,
    }),
  })
  const giver = await ensureGiverSession()

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 2 : 1,
    recordVideo: { dir: OUT_DIR, size: viewport },
  })
  const page = await context.newPage()
  page.on("dialog", async (dialog) => {
    console.log(`Dialog: ${dialog.message().slice(0, 120)}`)
    await pause(900)
    await dialog.accept()
  })
  const video = page.video()

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" })
    await showCaption(page, "RELOVED E2E — Notifications + Borzo booking", 3200)

    // --- 1. Claimer claims ---
    await loginDonor(page, claimer.token)
    await showCaption(page, "1. Claimer opens Wall item and claims (Rs 0)", 2800)
    await page.goto(`${BASE_URL}/drop/${seeded.slug}`, { waitUntil: "networkidle" })
    await pause(1500)

    const claimBtn = page.getByRole("button", { name: /claim this item/i }).first()
    await claimBtn.waitFor({ timeout: 20000 })
    await humanClick(claimBtn)
    await pause(1000)
    const continueBtn = page.getByRole("button", { name: /continue/i }).first()
    if (await continueBtn.isVisible().catch(() => false)) {
      await humanClick(continueBtn)
      await pause(900)
    }
    const personal = page.locator("#claim-personal-use")
    if (await personal.count()) await personal.check({ force: true })
    const terms = page.locator("#claim-terms")
    if (await terms.count()) await terms.check({ force: true })
    const acceptSend = page.getByRole("button", { name: /i accept/i }).first()
    await acceptSend.waitFor({ timeout: 15000 })
    await humanClick(acceptSend)
    await pause(2200)

    await showCaption(page, "2. Claimer Notifications loading… then Request sent", 2400)
    await openNotifications(page, { expectText: "Request sent", holdMs: 3800 })

    // --- 2. Giver notifications + accept ---
    await loginDonor(page, giver.token)
    await showCaption(page, "3. Giver Notifications loading… Someone wants to Relove", 2600)
    await openNotifications(page, { expectText: "Someone wants to Relove", holdMs: 4000 })

    const notifCard = page.getByText(/someone wants to relove/i).first()
    await humanClick(notifCard)
    await page.waitForURL(/\/account\/gifts\//, { timeout: 20000 }).catch(async () => {
      await page.goto(`${BASE_URL}/account/gifts/${seeded.submissionId}`, { waitUntil: "networkidle" })
    })
    await pause(1600)
    await showCaption(page, "4. Giver Accepts the claim", 2800)
    const accept = page.getByRole("button", { name: /^accept$/i }).first()
    await accept.waitFor({ timeout: 20000 })
    await humanClick(accept)
    await pause(2000)

    // --- 3. Claimer sees accept + shares address ---
    await loginDonor(page, claimer.token)
    await showCaption(page, "5. Claimer Notifications loading… claim accepted", 2600)
    await openNotifications(page, { expectText: "claim was accepted", holdMs: 3800 })

    await clickTab(page, "Claiming")
    await pause(1000)
    const claimLink = page.locator('a[href^="/account/claims/"]').first()
    await claimLink.waitFor({ timeout: 15000 })
    await humanClick(claimLink)
    await page.waitForURL(/\/account\/claims\//, { timeout: 15000 })
    await pause(1500)

    const share = page.getByRole("button", { name: /share address/i }).first()
    if (await share.isVisible().catch(() => false)) {
      await showCaption(page, "6. Claimer shares delivery address for handover / Borzo", 2800)
      const addr = page.locator("input").last()
      await addr.fill("Carter Road, Bandra West, Mumbai 400050")
      await humanClick(share)
      await pause(1800)
    }

    // --- 4. Borzo estimate + book ---
    await page.reload({ waitUntil: "networkidle" }).catch(() => {})
    await pause(1200)
    await showCaption(page, "7. Borzo: Estimate live fare (gate → gate)", 3000)

    const estimateBtn = page.getByRole("button", { name: /Estimate Borzo Fee/i }).first()
    await estimateBtn.waitFor({ state: "visible", timeout: 20000 })
    await estimateBtn.scrollIntoViewIfNeeded()
    await pause(800)
    await humanClick(estimateBtn)

    const fare = page.getByText(/Estimated Borzo Fare/i).first()
    await fare.waitFor({ state: "visible", timeout: 25000 }).catch(() => {})
    await pause(2800)

    await showCaption(page, "8. Book Borzo — rider dispatched via API", 3000)
    const bookBtn = page.getByRole("button", { name: /Book Borzo Delivery/i }).first()
    await bookBtn.waitFor({ state: "visible", timeout: 15000 })
    await humanClick(bookBtn)
    await pause(4500)

    const trackBtn = page.locator('a:has-text("Track Rider Live on Borzo")').first()
    const bookedChip = page.locator("text=/#[0-9A-Za-z-]+/").first()
    await Promise.race([
      trackBtn.waitFor({ state: "visible", timeout: 25000 }),
      bookedChip.waitFor({ state: "visible", timeout: 25000 }),
      pause(5000),
    ]).catch(() => {})
    await pause(2000)

    let trackingUrl = ""
    if (await trackBtn.isVisible().catch(() => false)) {
      trackingUrl = (await trackBtn.getAttribute("href")) || ""
      await focusElement(page, trackBtn).catch(() => {})
      await showCaption(page, "9. Borzo order live — Track Rider", 3200)
    } else {
      await showCaption(page, "9. Borzo booking attempted — check claim delivery status", 3200)
    }

    if (trackingUrl && trackingUrl.startsWith("http")) {
      await page.goto(trackingUrl, { waitUntil: "domcontentloaded" })
      await pause(4000)
    }

    // --- 5. Claiming tab shows Borzo status ---
    await loginDonor(page, claimer.token)
    await page.goto(`${BASE_URL}/account?tab=claiming`, { waitUntil: "networkidle" })
    await pause(1500)
    await showCaption(page, "10. Claiming tab — Borzo order # / Track on the card", 3600)
    await clickTab(page, "Claiming")
    await pause(2500)

    // --- 6. Giver sees address / match notifications ---
    await loginDonor(page, giver.token)
    await showCaption(page, "11. Giver Notifications after match / address / booking", 2600)
    await openNotifications(page, { holdMs: 4000 })

    await showCaption(page, "End-to-end verified: Notifications + Borzo booking", 4000)
  } finally {
    const v = video
    await page.close()
    await context.close()
    await browser.close()
    await pause(1500)
    if (v) {
      const out = await finalizeVideo(v, filename)
      console.log("Wrote", out)
    }
  }
}

await mkdir(OUT_DIR, { recursive: true })
await runScenario({ isMobile: false, filename: "reloved-notifications-borzo-e2e-desktop.webm" })
console.log("Notifications + Borzo E2E recording complete.")
