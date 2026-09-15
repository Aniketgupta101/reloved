/**
 * End-to-end recording: Claim ? giver Accept ? address / handover ? Reloved.
 *
 *   npm run record:match-handover
 *
 * Optional: UAT_BASE_URL / UAT_API_URL for local or staging.
 */
import { chromium } from "playwright"
import { mkdir, rename, unlink, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pause, showCaption, humanClick } from "./uat-recording-helpers.mjs"
import { UAT_TEST_USER, getUatSession } from "./setup-uat-test-user.mjs"
import { refreshUatClaimAccount } from "./refresh-uat-claim-account.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const BASE_URL = process.env.UAT_BASE_URL || "https://reloved-digital.web.app"
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const SEED_SECRET = process.env.SEED_SECRET || "reloved-dev-seed"

export const UAT_GIVER_USER = {
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
  await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  await pause(800)
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
  console.log(`Recording ${isMobile ? "mobile" : "desktop"} ? ${filename}`)

  await refreshUatClaimAccount()
  const seeded = await seedMatchItem()
  console.log("Seeded match item", seeded.slug, seeded.itemId, seeded.submissionId)

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
    await pause(400)
    await dialog.accept()
  })
  const video = page.video()

  try {
    await loginDonor(page, claimer.token)
    await showCaption(page, "1. Claimer opens a giver-sends item (3 km matching)", 2800)
    await page.goto(`${BASE_URL}/drop/${seeded.slug}`, { waitUntil: "networkidle" })
    await pause(1200)
    await showCaption(page, "Claim ? giver is notified: Someone wants to Relove your item", 2800)
    const claimBtn = page.getByRole("button", { name: /claim this item/i }).first()
    await claimBtn.waitFor({ timeout: 20000 })
    await humanClick(claimBtn)
    await pause(800)
    const continueBtn = page.getByRole("button", { name: /continue/i }).first()
    if (await continueBtn.isVisible().catch(() => false)) {
      await humanClick(continueBtn)
      await pause(800)
    }
    const personal = page.locator("#claim-personal-use")
    if (await personal.count()) await personal.check({ force: true })
    const terms = page.locator("#claim-terms")
    if (await terms.count()) await terms.check({ force: true })
    const acceptSend = page.getByRole("button", { name: /i accept/i }).first()
    await acceptSend.waitFor({ timeout: 15000 })
    await humanClick(acceptSend)
    await pause(2000)

    await loginDonor(page, giver.token)
    await showCaption(page, "2. Giver: Someone wants to Relove your item ù Accept / Decline", 3000)
    await page.goto(`${BASE_URL}/account/gifts/${seeded.submissionId}`, { waitUntil: "networkidle" })
    await pause(1500)
    const accept = page.getByRole("button", { name: /^accept$/i }).first()
    await accept.waitFor({ timeout: 20000 })
    await humanClick(accept)
    await pause(1500)
    await showCaption(page, "Accepted ? item is Matched. Claimer is asked for a delivery address.", 2800)

    await loginDonor(page, claimer.token)
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
    await pause(800)
    const claimLink = page.locator('a[href^="/account/claims/"]').first()
    await claimLink.click()
    await page.waitForURL(/\/account\/claims\//, { timeout: 15000 })
    await pause(1000)
    await showCaption(page, "3. Your item has been accepted! Share delivery address if needed.", 2800)
    const share = page.getByRole("button", { name: /share address/i }).first()
    if (await share.isVisible().catch(() => false)) {
      const addr = page.locator("input").last()
      await addr.fill("Carter Road, Bandra West, Mumbai")
      await humanClick(share)
      await pause(1200)
    }

    await loginDonor(page, giver.token)
    await page.goto(`${BASE_URL}/account/gifts/${seeded.submissionId}`, { waitUntil: "networkidle" })
    await pause(1000)
    await showCaption(page, "4. Delivery details received. Giver taps Handed over.", 2800)
    const handed = page.getByRole("button", { name: /handed over/i }).first()
    await handed.waitFor({ timeout: 15000 })
    await humanClick(handed)
    await pause(1500)

    await loginDonor(page, claimer.token)
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
    await claimLink.waitFor({ timeout: 10000 }).catch(() => {})
    await page.locator('a[href^="/account/claims/"]').first().click()
    await pause(1000)
    await showCaption(page, "5. Your Relove has been delivered ù claimer taps Received", 2800)
    const received = page.getByRole("button", { name: /^received$/i }).first()
    await received.waitFor({ timeout: 15000 })
    await humanClick(received)
    await pause(1500)
    await showCaption(page, "RELOVED ?? Handover confirmed", 3500)
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
await runScenario({ isMobile: false, filename: "reloved-match-handover-desktop.webm" })
await runScenario({ isMobile: true, filename: "reloved-match-handover-mobile.webm" })
console.log("Match/handover recordings complete.")
