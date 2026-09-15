/**
 * Four product-flow recordings for launch demo:
 *  1. New user — home → login → account
 *  2. Claimer — browse Wall → claim item
 *  3. Dropper — give / drop path
 *  4. Full lifecycle — drop seed → admin-style publish path → claim → accept → notifications → Borzo
 *
 *   npm run record:four-flows
 *
 * Outputs under frontend/recordings/
 */
import { chromium } from "playwright"
import { mkdir, rename, unlink, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pause, showCaption, humanClick, humanBrowsePage } from "./uat-recording-helpers.mjs"
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
    if (cached.token && cached.createdAt > Date.now() - 25 * 60 * 1000) return { token: cached.token }
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

async function withRecording(filename, run) {
  const viewport = { width: 1440, height: 900 }
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT_DIR, size: viewport },
  })
  const page = await context.newPage()
  page.on("dialog", async (dialog) => {
    await pause(300)
    await dialog.accept().catch(() => {})
  })
  const video = page.video()
  try {
    await run(page)
  } finally {
    await context.close()
    await browser.close()
    if (video) {
      const out = await finalizeVideo(video, filename)
      console.log("Saved", out)
    }
  }
}

async function loginDonor(page, token) {
  await page.goto(`${BASE_URL}/account/login`, { waitUntil: "networkidle" })
  await page.evaluate((t) => localStorage.setItem("reloved_donor_token", t), token)
  await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  await pause(700)
}

async function flow1NewUser() {
  await withRecording("flow-01-new-user.webm", async (page) => {
    await showCaption(page, "Flow 1 — New user: discover Reloved", 2500)
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" })
    await pause(1200)
    await humanBrowsePage(page, { sections: 3 })
    await showCaption(page, "Drop an item / explore Wall of Kindness", 2200)
    const drop = page.getByRole("link", { name: /drop an item/i }).first()
    if (await drop.isVisible().catch(() => false)) {
      await humanClick(drop)
      await pause(1500)
    }
    await page.goto(`${BASE_URL}/account/login`, { waitUntil: "networkidle" })
    await showCaption(page, "Sign in with phone, email, or Google", 2800)
    await pause(2000)
    await page.goto(`${BASE_URL}/faq`, { waitUntil: "networkidle" })
    await showCaption(page, "FAQ: 3 km donor-send + receiver pays courier", 2800)
    await pause(1800)
  })
}

async function flow2Claimer(claimerToken) {
  await withRecording("flow-02-claimer.webm", async (page) => {
    await loginDonor(page, claimerToken)
    await showCaption(page, "Flow 2 — Claimer: browse Wall & claim", 2500)
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle" })
    await pause(1500)
    await humanBrowsePage(page, { sections: 3 })
    const card = page.locator('a[href^="/drop/"]').first()
    if (await card.count()) {
      await humanClick(card)
      await pause(1500)
      await showCaption(page, "Item detail — claim within 3 km when donor sends", 2600)
      const claimBtn = page.getByRole("button", { name: /claim this item/i }).first()
      if (await claimBtn.isVisible().catch(() => false)) {
        await humanClick(claimBtn)
        await pause(1200)
        await showCaption(page, "Claim form uses saved building — exact flats stay private", 2600)
        await pause(1500)
      }
    }
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
    await showCaption(page, "Claimer account — claims & notifications", 2500)
    await pause(1800)
  })
}

async function flow3Dropper(giverToken) {
  await withRecording("flow-03-dropper.webm", async (page) => {
    await loginDonor(page, giverToken)
    await showCaption(page, "Flow 3 — Dropper: give something", 2500)
    await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
    await pause(1200)
    await humanBrowsePage(page, { sections: 3 })
    await showCaption(page, "Handover: Receiver collects / I send (3 km) / Porter-Borzo", 3000)
    await pause(2000)
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
    await showCaption(page, "Giver dashboard — gifts under review & matched", 2600)
    await pause(1800)
  })
}

async function flow4Lifecycle(claimerToken, giverToken) {
  await withRecording("flow-04-full-lifecycle.webm", async (page) => {
    await refreshUatClaimAccount().catch(() => {})
    const seeded = await api("/api/dev/seed/match-flow", {
      method: "POST",
      headers: { "x-seed-secret": SEED_SECRET },
      body: JSON.stringify({
        giverPhone: UAT_GIVER_USER.phone,
        claimerPhone: UAT_TEST_USER.phone,
        logistics: "porter_arranged",
      }),
    }).catch(async () =>
      api("/api/dev/seed/match-flow", {
        method: "POST",
        headers: { "x-seed-secret": SEED_SECRET },
        body: JSON.stringify({
          giverPhone: UAT_GIVER_USER.phone,
          claimerPhone: UAT_TEST_USER.phone,
        }),
      })
    )

    await showCaption(page, "Flow 4 — Full lifecycle: drop → match → accept → book", 2800)

    await loginDonor(page, claimerToken)
    await page.goto(`${BASE_URL}/drop/${seeded.slug}`, { waitUntil: "networkidle" })
    await pause(1000)
    await showCaption(page, "1) Claimer requests the item", 2200)
    const claimBtn = page.getByRole("button", { name: /claim this item/i }).first()
    if (await claimBtn.isVisible().catch(() => false)) {
      await humanClick(claimBtn)
      await pause(800)
      const continueBtn = page.getByRole("button", { name: /continue/i }).first()
      if (await continueBtn.isVisible().catch(() => false)) {
        await humanClick(continueBtn)
        await pause(600)
      }
      const personal = page.locator("#claim-personal-use")
      if (await personal.count()) await personal.check({ force: true })
      const terms = page.locator("#claim-terms")
      if (await terms.count()) await terms.check({ force: true })
      const acceptSend = page.getByRole("button", { name: /i accept/i }).first()
      if (await acceptSend.isVisible().catch(() => false)) {
        await humanClick(acceptSend)
        await pause(1500)
      }
    }

    await loginDonor(page, giverToken)
    await showCaption(page, "2) Giver notified — Accept match (addresses stay private)", 2800)
    await page.goto(`${BASE_URL}/account/gifts/${seeded.submissionId}`, { waitUntil: "networkidle" })
    await pause(1200)
    const accept = page.getByRole("button", { name: /^accept$/i }).first()
    if (await accept.isVisible().catch(() => false)) {
      await humanClick(accept)
      await pause(1500)
    }

    await loginDonor(page, claimerToken)
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
    await pause(800)
    await showCaption(page, "3) Email + in-app: claim accepted — receiver books Borzo", 2800)
    const claimLink = page.locator('a[href^="/account/claims/"]').first()
    if (await claimLink.count()) {
      await claimLink.click()
      await page.waitForURL(/\/account\/claims\//, { timeout: 15000 }).catch(() => {})
      await pause(1200)
      const estimate = page.getByRole("button", { name: /estimate borzo/i }).first()
      if (await estimate.isVisible().catch(() => false)) {
        await humanClick(estimate)
        await pause(2000)
      }
      const book = page.getByRole("button", { name: /book borzo/i }).first()
      if (await book.isVisible().catch(() => false)) {
        await humanClick(book)
        await pause(1000)
        const confirm = page.getByRole("button", { name: /confirm book/i }).first()
        if (await confirm.isVisible().catch(() => false)) {
          await humanClick(confirm)
          await pause(2500)
        }
      }
    }

    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
    await showCaption(page, "4) Lifecycle complete path: matched → courier → RELOVED", 3000)
    await pause(2200)
  })
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  console.log("Recording four product flows →", OUT_DIR)

  const claimer = await getUatSession({ forceRefresh: false })
  const giver = await ensureGiverSession()

  await flow1NewUser()
  await flow2Claimer(claimer.token)
  await flow3Dropper(giver.token)
  await flow4Lifecycle(claimer.token, giver.token)

  console.log("Done. Videos:")
  for (const name of [
    "flow-01-new-user.webm",
    "flow-02-claimer.webm",
    "flow-03-dropper.webm",
    "flow-04-full-lifecycle.webm",
  ]) {
    console.log(" -", path.join(OUT_DIR, name))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
