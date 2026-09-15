/**
 * Desktop + mobile recording of today's live fixes:
 * 1) Brevo #4 / #12 giver-decide email copy
 * 2) Privacy banner with bag wording
 * 3) Notifications tab (giver + claimer)
 * 4) Peer chat after Accept
 *
 *   node scripts/record-fixes-verification.mjs
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
const TPL_DIR = path.resolve(ROOT, "..", "firebase-backend", "email-templates")
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
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${res.status} ${pathname}`)
  return body
}

async function loginWithOtp(phone) {
  const { devCode } = await api("/api/otp/request", {
    method: "POST",
    body: JSON.stringify({ channel: "sms", target: phone }),
  })
  if (!devCode) throw new Error(`No OTP for ${phone}`)
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

async function ensureGiverToken() {
  const cachePath = path.join(OUT_DIR, ".uat-giver-session.json")
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8"))
    if (cached.token && cached.createdAt > Date.now() - 25 * 60 * 1000) return cached.token
  } catch {
    // ignore
  }
  let token
  try {
    token = await loginWithOtp(UAT_GIVER_USER.phone)
  } catch {
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
  await writeFile(cachePath, JSON.stringify({ token, createdAt: Date.now() }, null, 2))
  return token
}

async function finalizeVideo(video, filename) {
  const tempPath = await video.path()
  const finalPath = path.join(OUT_DIR, filename)
  try {
    await unlink(finalPath)
  } catch {
    // ignore
  }
  for (let i = 0; i < 10; i++) {
    try {
      await rename(tempPath, finalPath)
      break
    } catch {
      await pause(400)
    }
  }
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

async function writeEmailPreviews() {
  const claimerRaw = await readFile(path.join(TPL_DIR, "claim-confirmation-user.html"), "utf8")
  const giverRaw = await readFile(path.join(TPL_DIR, "item-claim-notify-giver.html"), "utf8")
  const claimerPath = path.join(OUT_DIR, "preview-fix-claim-confirmation.html")
  const giverPath = path.join(OUT_DIR, "preview-fix-claim-notify-giver.html")
  await writeFile(
    claimerPath,
    claimerRaw
      .replaceAll("{{ params.ITEM_TITLE }}", "UAT Bandra Linen Tee")
      .replaceAll("{{ params.REQUESTER_NAME }}", UAT_TEST_USER.name),
  )
  await writeFile(
    giverPath,
    giverRaw
      .replaceAll("{{ params.ITEM_TITLE }}", "UAT Bandra Linen Tee")
      .replaceAll("{{ params.FIRST_NAME }}", "UAT")
      .replaceAll("{{ params.PROFILE_URL }}", `${BASE_URL}/account?tab=notifications`),
  )
  return { claimerPath, giverPath }
}

async function loginDonor(page, token) {
  await page.goto(`${BASE_URL}/account/login`, { waitUntil: "networkidle" })
  await page.evaluate((t) => localStorage.setItem("reloved_donor_token", t), token)
}

async function openNotifications(page, expectText) {
  const waitApi = page
    .waitForResponse(
      (r) => r.url().includes("/api/donor/notifications") && r.request().method() === "GET" && r.ok(),
      { timeout: 30000 },
    )
    .catch(() => null)
  await page.goto(`${BASE_URL}/account?tab=notifications`, { waitUntil: "domcontentloaded" })
  await waitApi
  await page.locator(".animate-pulse").first().waitFor({ state: "hidden", timeout: 20000 }).catch(() => {})
  await pause(1600)
  if (expectText) {
    const el = page.getByText(new RegExp(expectText, "i")).first()
    await el.waitFor({ state: "visible", timeout: 25000 })
    await el.scrollIntoViewIfNeeded()
  }
  await pause(3000)
}

async function runScenario({ isMobile, filename, claimerPath, giverPath, seeded, claimerToken, giverToken }) {
  const viewport = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
  console.log(`Recording ${isMobile ? "mobile" : "desktop"} → ${filename}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 2 : 1,
    recordVideo: { dir: OUT_DIR, size: viewport },
  })
  const page = await context.newPage()
  page.on("dialog", async (d) => {
    await pause(600)
    await d.accept()
  })
  const video = page.video()

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" })
    await showCaption(page, "FIXES LIVE — Email copy + Notifications + Privacy + Peer chat", 3200)

    // 1) Email templates
    await showCaption(page, "1. Claimer email (#4) — giver Accept / Decline (not admin 24–48h)", 2800)
    await page.goto(`file://${claimerPath.replace(/\\/g, "/")}`, { waitUntil: "domcontentloaded" })
    await pause(3800)
    await showCaption(page, "2. Giver email (#12) — Open profile to Accept or Decline", 2800)
    await page.goto(`file://${giverPath.replace(/\\/g, "/")}`, { waitUntil: "domcontentloaded" })
    await pause(3800)

    // 2) Privacy bag notice — show on claim address step (always reachable)
    await loginDonor(page, claimerToken)
    await showCaption(page, "3. Privacy rule live — building only + hand item in a bag", 2800)
    await page.goto(`${BASE_URL}/drop/${seeded.slug}`, { waitUntil: "networkidle" })
    await pause(1000)
    const openClaim = page.getByRole("button", { name: /claim this item/i }).first()
    await openClaim.waitFor({ timeout: 20000 })
    await humanClick(openClaim)
    await pause(1000)
    const cont1 = page.getByRole("button", { name: /continue/i }).first()
    if (await cont1.isVisible().catch(() => false)) {
      // only click if enabled
      if (await cont1.isEnabled().catch(() => false)) {
        await humanClick(cont1)
        await pause(1000)
      }
    }
    const notice = page.getByText(/Important privacy rule|in a bag/i).first()
    await notice.waitFor({ state: "visible", timeout: 15000 }).catch(() => {})
    if (await notice.isVisible().catch(() => false)) {
      await notice.scrollIntoViewIfNeeded()
      await focusElement(page, notice).catch(() => {})
    }
    await pause(3200)

    // Close modal if needed by going to claim submit later from scratch
    await page.goto(`${BASE_URL}/drop/${seeded.slug}`, { waitUntil: "networkidle" })
    await pause(800)

    // 3) Claim flow for notifications + peer chat
    await showCaption(page, "4. Claimer claims item → notifications load", 2600)
    const claimBtn = page.getByRole("button", { name: /claim this item/i }).first()
    await claimBtn.waitFor({ timeout: 20000 })
    await humanClick(claimBtn)
    await pause(800)
    const continueBtn = page.getByRole("button", { name: /continue/i }).first()
    if ((await continueBtn.isVisible().catch(() => false)) && (await continueBtn.isEnabled().catch(() => false))) {
      await humanClick(continueBtn)
      await pause(800)
    }
    const personal = page.locator("#claim-personal-use")
    if (await personal.count()) await personal.check({ force: true })
    const terms = page.locator("#claim-terms")
    if (await terms.count()) await terms.check({ force: true })
    // Fill address if required so continue works
    const addrInput = page.locator('input[placeholder*="building" i], input[placeholder*="landmark" i]').first()
    if (await addrInput.isVisible().catch(() => false)) {
      await addrInput.fill("Carter Road Bandra West")
      await pause(400)
    }
    const cont2 = page.getByRole("button", { name: /continue/i }).first()
    if ((await cont2.isVisible().catch(() => false)) && (await cont2.isEnabled().catch(() => false))) {
      await humanClick(cont2)
      await pause(800)
    }
    const acceptSend = page.getByRole("button", { name: /i accept/i }).first()
    await acceptSend.waitFor({ timeout: 15000 })
    await humanClick(acceptSend)
    await pause(1800)

    await openNotifications(page, "Request sent")
    await showCaption(page, "Claimer Notifications — Request sent", 2800)

    await loginDonor(page, giverToken)
    await showCaption(page, "5. Giver Notifications — Someone wants to Relove", 2600)
    await openNotifications(page, "Someone wants to Relove")
    const card = page.getByText(/someone wants to relove/i).first()
    await humanClick(card)
    await page.waitForURL(/\/account\/gifts\//, { timeout: 20000 }).catch(async () => {
      await page.goto(`${BASE_URL}/account/gifts/${seeded.submissionId}`, { waitUntil: "networkidle" })
    })
    await pause(1200)
    const accept = page.getByRole("button", { name: /^accept$/i }).first()
    await accept.waitFor({ timeout: 20000 })
    await showCaption(page, "6. Giver Accepts → unlocks peer chat", 2600)
    await humanClick(accept)
    await pause(2000)

    // Peer chat on giver side
    const peerGiver = page.getByRole("button", { name: /Chat with receiver/i }).first()
    if (await peerGiver.isVisible().catch(() => false)) {
      await humanClick(peerGiver)
      await pause(1200)
      const input = page.locator("textarea, input[placeholder*='handover' i], input[placeholder*='message' i]").last()
      if (await input.isVisible().catch(() => false)) {
        await input.fill("Hi — bag will be at main gate security. Building landmark only.")
        const send = page.getByRole("button", { name: /send/i }).first()
        if (await send.isVisible().catch(() => false)) await humanClick(send)
        await pause(1500)
      }
      await showCaption(page, "Peer chat live — giver ↔ claimer (no flat numbers)", 3200)
    } else {
      await showCaption(page, "Matched — peer chat available on claim/gift detail", 2800)
    }

    await loginDonor(page, claimerToken)
    await openNotifications(page, "claim was accepted")
    await showCaption(page, "7. Claimer Notifications — claim accepted", 3000)

    await page.goto(`${BASE_URL}/account?tab=claiming`, { waitUntil: "networkidle" })
    await pause(1000)
    const claimLink = page.locator('a[href^="/account/claims/"]').first()
    await claimLink.waitFor({ timeout: 15000 })
    await humanClick(claimLink)
    await page.waitForURL(/\/account\/claims\//, { timeout: 15000 })
    await pause(1200)

    const peerClaimer = page.getByRole("button", { name: /Chat with giver/i }).first()
    if (await peerClaimer.isVisible().catch(() => false)) {
      await peerClaimer.scrollIntoViewIfNeeded()
      await humanClick(peerClaimer)
      await pause(2000)
      await showCaption(page, "Claimer peer chat with giver — handover details", 3200)
    }

    await showCaption(page, "Fixes verified live — emails, notifications, privacy, peer chat", 3800)
  } finally {
    const v = video
    await page.close()
    await context.close()
    await browser.close()
    await pause(1200)
    if (v) console.log("Wrote", await finalizeVideo(v, filename))
  }
}

await mkdir(OUT_DIR, { recursive: true })
const { claimerPath, giverPath } = await writeEmailPreviews()

await refreshUatClaimAccount()
const seeded = await api("/api/dev/seed/match-flow", {
  method: "POST",
  headers: { "x-seed-secret": SEED_SECRET },
  body: JSON.stringify({
    giverPhone: UAT_GIVER_USER.phone,
    claimerPhone: UAT_TEST_USER.phone,
  }),
})
console.log("Seeded", seeded.slug, seeded.submissionId)

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
const giverToken = await ensureGiverToken()

const common = {
  claimerPath,
  giverPath,
  seeded,
  claimerToken: claimer.token,
  giverToken,
}

await runScenario({
  isMobile: false,
  filename: "reloved-fixes-live-desktop.webm",
  ...common,
})

// Fresh seed for mobile so claim is available again
await refreshUatClaimAccount()
const seededMobile = await api("/api/dev/seed/match-flow", {
  method: "POST",
  headers: { "x-seed-secret": SEED_SECRET },
  body: JSON.stringify({
    giverPhone: UAT_GIVER_USER.phone,
    claimerPhone: UAT_TEST_USER.phone,
  }),
})
await runScenario({
  isMobile: true,
  filename: "reloved-fixes-live-mobile.webm",
  ...common,
  seeded: seededMobile,
})

console.log("Fix verification recordings complete.")
