/**
 * Client-share demo: full Reloved lifecycle — desktop + mobile, exported as MP4.
 *
 * Drop → Admin approve → Wall → Claim → Giver accept → Handed over → Received → Reloved
 * Scrolls every key page so UI changes are visible.
 *
 *   npm run record:client-lifecycle
 *
 * Outputs (frontend/recordings/):
 *   client-full-lifecycle-desktop.mp4
 *   client-full-lifecycle-mobile.mp4
 *   (+ .webm sources)
 */
import { chromium, devices } from "playwright"
import { spawn } from "node:child_process"
import { mkdir, rename, unlink, readdir, readFile, writeFile, access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pause, showCaption, humanClick, humanBrowsePage } from "./uat-recording-helpers.mjs"
import { UAT_TEST_USER, getUatSession } from "./setup-uat-test-user.mjs"
import { refreshUatClaimAccount } from "./refresh-uat-claim-account.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const BASE_URL = process.env.RECORD_BASE_URL || process.env.UAT_BASE_URL || "http://localhost:3000"
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const SEED_SECRET = process.env.SEED_SECRET || "reloved-dev-seed"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"
const ONLY = (process.env.ONLY || "desktop,mobile").toLowerCase()

const GIVER = {
  phone: "9876501241",
  name: "Rohan Mehta",
  username: "rohan_juhu",
}

const PHOTO = path.join(ROOT, "public", "images", "uat-clothing-photo.jpg")

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
    if (cached.token && cached.createdAt > Date.now() - 20 * 60 * 1000) return cached.token
  } catch {
    // miss
  }
  let token
  try {
    token = await loginWithOtp(GIVER.phone)
  } catch (err) {
    console.warn("Giver OTP failed, waiting 70s:", err.message)
    await pause(70_000)
    token = await loginWithOtp(GIVER.phone)
  }
  await api("/api/donor/profile", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: GIVER.name,
      username: GIVER.username,
      gender: "unisex",
      phone: GIVER.phone,
      address: "Bandra West, Mumbai",
      addressLabel: "home",
      pincode: "400050",
      latitude: 19.0596,
      longitude: 72.8295,
    }),
  })
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(cachePath, JSON.stringify({ token, createdAt: Date.now() }, null, 2))
  return token
}

async function adminToken() {
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  if (!login.token) throw new Error("Admin login failed")
  return login.token
}

async function seedMatch(claimerPhone) {
  return api("/api/dev/seed/match-flow", {
    method: "POST",
    headers: { "x-seed-secret": SEED_SECRET },
    body: JSON.stringify({ giverPhone: GIVER.phone, claimerPhone }),
  })
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
  for (let i = 0; i < 12; i++) {
    try {
      await rename(tempPath, finalPath)
      lastErr = null
      break
    } catch (err) {
      lastErr = err
      await pause(500)
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

function webmToMp4(webmPath) {
  const mp4Path = webmPath.replace(/\.webm$/i, ".mp4")
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      webmPath,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      mp4Path,
    ]
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] })
    let err = ""
    child.stderr.on("data", (d) => {
      err += d.toString()
    })
    child.on("close", (code) => {
      if (code === 0) resolve(mp4Path)
      else reject(new Error(`ffmpeg failed (${code}): ${err.slice(-400)}`))
    })
  })
}

async function setDonor(page, token) {
  await page.goto(`${BASE_URL}/account/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.evaluate((t) => localStorage.setItem("reloved_donor_token", t), token)
  await page.goto(`${BASE_URL}/account`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await pause(900)
}

async function setAdmin(page, token) {
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.evaluate((t) => localStorage.setItem("reloved_admin_token", t), token)
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await pause(900)
}

async function scrollPageThorough(page, sections = 4) {
  await humanBrowsePage(page, { sections })
}

async function clickContinueIfReady(page, waitMs = 0) {
  if (waitMs) await pause(waitMs)
  const btn = page.getByRole("button", { name: /continue|next/i }).first()
  if (await btn.isEnabled().catch(() => false)) {
    await humanClick(btn)
    await pause(1200)
    return true
  }
  return false
}

async function focusAndClick(page, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {})
  await pause(400)
  await humanClick(locator)
}

async function latestClaimId(token, slug) {
  const data = await api("/api/donor/item-requests", {
    headers: { Authorization: `Bearer ${token}` },
  })
  const hit = (data.requests || []).find((r) => r.item?.slug === slug || r.itemSlug === slug)
  return hit?.id || null
}

async function claimViaUi(page, slug, itemId, claimerToken) {
  await page.goto(`${BASE_URL}/drop/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await pause(1000)
  await scrollPageThorough(page, 3)
  await showCaption(page, "4 · Claimer opens item detail & claims", 2800)

  // Show the claim CTA, then create the claim via API (reliable for recording).
  const claimBtn = page.getByRole("button", { name: /^claim this item$/i }).first()
  if (await claimBtn.isVisible().catch(() => false)) {
    await claimBtn.scrollIntoViewIfNeeded().catch(() => {})
    await pause(600)
    await claimBtn.hover().catch(() => {})
    await pause(800)
  }

  let claimId = await latestClaimId(claimerToken, slug)
  if (!claimId && itemId) {
    try {
      await api("/api/donor/item-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${claimerToken}` },
        body: JSON.stringify({
          itemId,
          requesterName: UAT_TEST_USER.name,
          requesterPhone: UAT_TEST_USER.phone,
          requesterAddress: "Carter Road, Bandra West, Mumbai",
          note: "Client demo claim",
          acceptedTerms: true,
          personalUse: true,
          latitude: 19.0596,
          longitude: 72.8295,
        }),
      })
    } catch (err) {
      // Race / already claimed — try to recover existing request
      console.warn(`[claim] API claim: ${err.message}`)
    }
    claimId = await latestClaimId(claimerToken, slug)
  }

  if (!claimId) throw new Error(`No claim id after claim step for ${slug}`)

  await page.goto(`${BASE_URL}/drop/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await pause(1000)
  await scrollPageThorough(page, 2)
  await showCaption(page, "Claim submitted — within 3 km of giver", 2400)
  return claimId
}

async function runLifecycle(label, contextOptions, sessions) {
  const { claimerToken, giverToken, admTok } = sessions
  await refreshUatClaimAccount().catch((e) => console.warn("Claim refresh:", e.message))
  const seeded = await seedMatch(UAT_TEST_USER.phone)
  console.log(`[${label}] Seeded`, seeded.slug, seeded.itemId)

  const videoSize = contextOptions.viewport || { width: 390, height: 844 }
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ...contextOptions,
    recordVideo: { dir: OUT_DIR, size: videoSize },
  })
  const page = await context.newPage()
  page.on("dialog", async (dialog) => {
    await pause(250)
    await dialog.accept().catch(() => {})
  })
  const video = page.video()
  const webmName = `client-full-lifecycle-${label}.webm`

  try {
    await showCaption(
      page,
      label === "mobile"
        ? "RELOVED · Mobile journey: Drop → Approve → Claim → Receive"
        : "RELOVED · Full journey: Drop → Approve → Claim → Receive",
      3200,
    )
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1200)
    await scrollPageThorough(page, 4)

    await showCaption(page, "Wall of Kindness — live preloved inventory", 2600)
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1200)
    await scrollPageThorough(page, 4)

    await setDonor(page, giverToken)
    await showCaption(page, "1 · Giver drops an item (photos + details)", 3000)
    await page.goto(`${BASE_URL}/give`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1000)
    await scrollPageThorough(page, 3)

    try {
      await access(PHOTO)
      const fileInput = page.locator('input[type="file"]').first()
      if (await fileInput.count()) {
        await fileInput.setInputFiles(PHOTO)
        await pause(2000)
        await showCaption(page, "Photos added — Reloved AI can suggest details", 2600)
        await scrollPageThorough(page, 2)
        await clickContinueIfReady(page, 2000)
        await clickContinueIfReady(page, 8000)
        await pause(1000)
        await scrollPageThorough(page, 3)
        await showCaption(page, "Item details + handover preference", 2600)
        await scrollPageThorough(page, 3)
      }
    } catch {
      await showCaption(page, "Give flow — upload + details (photo sample skipped)", 2400)
    }

    await page.goto(`${BASE_URL}/account?tab=giving`, { waitUntil: "domcontentloaded" }).catch(() =>
      page.goto(`${BASE_URL}/account`, { waitUntil: "domcontentloaded", timeout: 60000 }),
    )
    await pause(1200)
    await scrollPageThorough(page, 3)
    await showCaption(page, "Giver dashboard — drops under review / matched", 2800)

    await setAdmin(page, admTok)
    await showCaption(page, "2 · Reloved admin QC reviews the drop", 3000)
    await scrollPageThorough(page, 3)

    await page.goto(`${BASE_URL}/admin/donations`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1200)
    await scrollPageThorough(page, 4)

    const approveBtn = page.getByRole("button", { name: /^approve$/i }).first()
    if (await approveBtn.isVisible().catch(() => false)) {
      await focusAndClick(page, approveBtn)
      await pause(1500)
      await showCaption(page, "Approved — item published to Wall of Kindness", 2800)
    } else {
      await api(`/api/admin/donations/${seeded.submissionId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${admTok}` },
        body: JSON.stringify({ status: "approved" }),
      }).catch(() => {})
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 })
      await pause(1000)
      await scrollPageThorough(page, 3)
      await showCaption(page, "Admin Gives — approve puts clothes on the Wall", 2800)
    }

    await page.goto(`${BASE_URL}/admin/items`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1000)
    await scrollPageThorough(page, 3)
    await showCaption(page, "Admin inventory — Available / Being matched / Reloved", 2800)

    await page.goto(`${BASE_URL}/drop`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1000)
    await scrollPageThorough(page, 4)
    await showCaption(page, "3 · Item is live on the Wall for claimers nearby", 2800)

    await setDonor(page, claimerToken)
    const claimId = await claimViaUi(page, seeded.slug, seeded.itemId, claimerToken)
    if (!claimId) throw new Error(`[${label}] Claim was not created`)
    console.log(`[${label}] Claim id`, claimId)

    await page.goto(`${BASE_URL}/account/claims/${claimId}`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1000)
    await scrollPageThorough(page, 3)
    await showCaption(page, "Claim submitted — waiting for giver to accept", 2800)

    await setDonor(page, giverToken)
    await showCaption(page, "5 · Giver reviews request & Accepts", 2800)
    await page.goto(`${BASE_URL}/account/gifts/${seeded.submissionId}`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1200)
    await scrollPageThorough(page, 3)

    const accept = page.getByRole("button", { name: /^accept$/i }).first()
    if (await accept.isVisible().catch(() => false)) {
      await humanClick(accept)
      await pause(2000)
    } else {
      await api(`/api/donor/item-requests/${claimId}/giver-decision`, {
        method: "POST",
        headers: { Authorization: `Bearer ${giverToken}` },
        body: JSON.stringify({ decision: "accept" }),
      })
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 })
      await pause(1200)
    }
    await scrollPageThorough(page, 3)
    await showCaption(page, "Matched — addresses stay private until handover", 2800)

    await setDonor(page, claimerToken)
    await page.goto(`${BASE_URL}/account/claims/${claimId}`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1000)
    await scrollPageThorough(page, 3)
    const share = page.getByRole("button", { name: /share address/i }).first()
    if (await share.isVisible().catch(() => false)) {
      const addrInput = page
        .locator('input[placeholder*="building" i], input[placeholder*="landmark" i], input[placeholder*="Search" i]')
        .first()
      if (await addrInput.isVisible().catch(() => false)) {
        await addrInput.fill("Carter Road gate, Bandra West")
      }
      for (let i = 0; i < 12; i++) {
        if (await share.isEnabled().catch(() => false)) break
        await pause(300)
      }
      if (await share.isEnabled().catch(() => false)) {
        await humanClick(share)
        await pause(1500)
      }
    } else {
      await api(`/api/donor/item-requests/${claimId}/delivery-address`, {
        method: "POST",
        headers: { Authorization: `Bearer ${claimerToken}` },
        body: JSON.stringify({ address: "Carter Road gate, Bandra West" }),
      }).catch(() => {})
    }
    await showCaption(page, "6 · Claimer shares building for handover", 2600)

    await setDonor(page, giverToken)
    await page.goto(`${BASE_URL}/account/gifts/${seeded.submissionId}`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1200)
    await scrollPageThorough(page, 3)
    const handed = page.getByRole("button", { name: /handed over/i }).first()
    if (!(await handed.isVisible().catch(() => false)) || !(await handed.isEnabled().catch(() => false))) {
      await api(`/api/donor/item-requests/${claimId}/handed-over`, {
        method: "POST",
        headers: { Authorization: `Bearer ${giverToken}` },
        body: JSON.stringify({}),
      })
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 })
      await pause(1000)
    } else {
      await humanClick(handed)
      await pause(1500)
    }
    await scrollPageThorough(page, 2)
    await showCaption(page, "7 · Giver marks Handed Over", 2800)

    await setDonor(page, claimerToken)
    await page.goto(`${BASE_URL}/account/claims/${claimId}`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1200)
    await scrollPageThorough(page, 3)
    const received = page.getByRole("button", { name: /^received$/i }).first()
    if (await received.isVisible().catch(() => false)) {
      await humanClick(received)
      await pause(2000)
    } else {
      await api(`/api/donor/item-requests/${claimId}/received`, {
        method: "POST",
        headers: { Authorization: `Bearer ${claimerToken}` },
        body: JSON.stringify({}),
      })
    }
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1200)
    await scrollPageThorough(page, 3)
    await showCaption(page, "8 · Claimer confirms Received → item is RELOVED", 3500)

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(800)
    const love = page.getByRole("link", { name: /wall of love/i }).first()
    if (await love.isVisible().catch(() => false)) {
      await humanClick(love)
      await pause(1500)
      await scrollPageThorough(page, 3)
    }
    await showCaption(page, "Journey complete — Drop → Approve → Claim → Reloved", 4000)
    await pause(1500)
  } finally {
    await context.close()
    await browser.close()
  }

  const webmPath = await finalizeVideo(video, webmName)
  console.log(`[${label}] Saved webm:`, webmPath)
  const mp4Path = await webmToMp4(webmPath)
  console.log(`[${label}] Saved mp4:`, mp4Path)
  return { webmPath, mp4Path }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  console.log("Client lifecycle recording (desktop + mobile → MP4)")
  console.log("  UI:", BASE_URL)
  console.log("  API:", API_BASE)
  console.log("  ONLY:", ONLY)

  const claimer = await getUatSession({ forceRefresh: false })
  const giverToken = await ensureGiverSession()
  const admTok = await adminToken()
  const sessions = { claimerToken: claimer.token, giverToken, admTok }

  const outputs = []

  if (ONLY.includes("desktop")) {
    outputs.push(
      await runLifecycle(
        "desktop",
        {
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
        },
        sessions,
      ),
    )
  }

  if (ONLY.includes("mobile")) {
    outputs.push(await runLifecycle("mobile", { ...devices["iPhone 13"] }, sessions))
  }

  console.log("\nDone — share these MP4s with your client:")
  for (const o of outputs) console.log(" -", o.mp4Path)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
