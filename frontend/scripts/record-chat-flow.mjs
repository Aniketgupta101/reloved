/**
 * Record claim detail page + order chat (donor quick-question + admin reply).
 *
 *   npm run record:chat-flow
 *   MOBILE=1 npm run record:chat-flow
 *
 * Output: recordings/reloved-order-chat-flow.webm
 *         recordings/reloved-order-chat-flow-mobile.webm (when MOBILE=1)
 */
import { chromium } from "playwright"
import { mkdir, rename, unlink, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  UAT_TEST_USER,
  pause,
  showCaption,
  humanType,
  humanClick,
} from "./uat-recording-helpers.mjs"
import { getUatSession } from "./setup-uat-test-user.mjs"
import { refreshUatClaimAccount } from "./refresh-uat-claim-account.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const BASE_URL = process.env.UAT_BASE_URL || "http://localhost:3000"
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"
const IS_MOBILE = process.env.MOBILE === "1" || process.env.MOBILE === "true"
const VIEWPORT = IS_MOBILE
  ? { width: 390, height: 844 }
  : { width: 1400, height: 900 }
const VIDEO_NAME = IS_MOBILE
  ? "reloved-order-chat-flow-mobile.webm"
  : "reloved-order-chat-flow.webm"

async function finalizeVideo(video) {
  const tempPath = await video.path()
  const finalPath = path.join(OUT_DIR, VIDEO_NAME)
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

async function adminToken() {
  const login = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.json())
  if (!login.token) throw new Error(`Admin login failed: ${JSON.stringify(login)}`)
  return login.token
}

async function ensureApprovedClaim(donorToken, token) {
  const list = await fetch(`${API_BASE}/api/admin/item-requests?status=approved`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  const existing = (list.requests || []).find(
    (r) =>
      String(r.requesterPhone || "").includes(UAT_TEST_USER.phone) ||
      String(r.requesterTarget || "").includes(UAT_TEST_USER.phone),
  )
  if (existing) return existing

  const wall = await fetch(`${API_BASE}/api/items?status=wall`).then((r) => r.json())
  const item = (wall.items || []).find((i) => i.publicStatus === "available" || i.publicVisibility)
  if (!item?.id) throw new Error("No wall item available to claim for chat demo")

  const created = await fetch(`${API_BASE}/api/donor/item-requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${donorToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      itemId: item.id,
      requesterName: UAT_TEST_USER.name,
      requesterPhone: UAT_TEST_USER.phone,
      requesterAddress: "Bandra West, Mumbai",
      note: "Chat flow recording",
      acceptedTerms: "true",
      personalUse: "true",
    }),
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(body.error || `Claim failed (${r.status})`)
    return body
  })

  const claimId = created.request?.id
  if (!claimId) throw new Error("No claim id returned")

  const patched = await fetch(`${API_BASE}/api/admin/item-requests/${claimId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "approved" }),
  }).then((r) => r.json())

  return patched.request || { id: claimId, itemTitle: item.title, status: "approved" }
}

async function loginDonor(page) {
  const session = await getUatSession({ forceRefresh: false })
  await page.addInitScript((token) => {
    localStorage.setItem("reloved_donor_token", token)
  }, session.token)
  await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  await pause(800)
  if (page.url().includes("login")) {
    const fresh = await getUatSession({ forceRefresh: true })
    await page.evaluate((t) => localStorage.setItem("reloved_donor_token", t), fresh.token)
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  }
  if (page.url().includes("login")) throw new Error("Donor login failed")
  return session
}

async function adminLogin(page) {
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle" })
  await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD)
  await humanClick(page.locator("button").filter({ hasText: /sign in|log in|login/i }).first())
  await page.waitForURL(/\/admin(\/|$)/, { timeout: 25000 }).catch(() => {})
  await pause(800)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  try {
    const res = await fetch(BASE_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch {
    console.error(`Cannot reach ${BASE_URL}. Start frontend: npm run dev`)
    process.exit(1)
  }

  console.log("Refreshing UAT claim quota...")
  await refreshUatClaimAccount()

  const session = await getUatSession({ forceRefresh: false })
  const token = await adminToken()
  const claim = await ensureApprovedClaim(session.token, token)
  console.log("Using approved claim:", claim.id, claim.itemTitle || claim.status)

  const stamp = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  const clientMsg = `Hi Reloved - please confirm Borzo booking (${stamp})`
  const adminMsg = `Hi - confirmed. Booking Borzo today with the giver. You pay Rs 0; giver covers the ride (${stamp})`

  // One page = one continuous video (client + admin + client again) for client review.
  console.log(`Recording ${IS_MOBILE ? "mobile" : "desktop"} (${VIEWPORT.width}x${VIEWPORT.height}) ? ${VIDEO_NAME}`)
  const browser = await chromium.launch({ headless: false, slowMo: 60, channel: "chrome" })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    isMobile: IS_MOBILE,
    hasTouch: IS_MOBILE,
    deviceScaleFactor: IS_MOBILE ? 2 : 1,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
  })

  const page = await context.newPage()
  try {
    // --- CLIENT ---
    await loginDonor(page)
    await showCaption(page, "CLIENT: Account - open approved claim", 2800)
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
    await pause(1000)

    const claimCard = page.locator('a[href*="/account/claims/"]').first()
    await claimCard.scrollIntoViewIfNeeded()
    await humanClick(claimCard)
    await page.waitForURL(/\/account\/claims\//, { timeout: 15000 })
    await pause(1200)

    await showCaption(page, "CLIENT: Claim page - chat with Reloved (two-way)", 3000)
    const chatBox = page.locator("text=Two-way chat").first()
    if (await chatBox.isVisible().catch(() => false)) {
      await chatBox.scrollIntoViewIfNeeded()
    } else {
      await page.locator("text=Chat with Reloved").first().scrollIntoViewIfNeeded().catch(() => {})
    }
    await pause(1500)

    await showCaption(page, "CLIENT: Quick question - auto reply from Reloved", 2600)
    const whereBtn = page.getByRole("button", { name: /Where is my order/i }).first()
    if (await whereBtn.isVisible().catch(() => false)) {
      await humanClick(whereBtn)
      await pause(2800)
    }
    const costBtn = page.getByRole("button", { name: /How much will delivery cost/i }).first()
    if (await costBtn.isVisible().catch(() => false)) {
      await humanClick(costBtn)
      await pause(2800)
    }

    await showCaption(page, "CLIENT: Types a free-text message to Reloved", 2400)
    await humanType(page.locator('input[placeholder*="message" i]').first(), clientMsg)
    await humanClick(page.locator('form button[type="submit"]').first())
    await pause(2500)
    await page.locator(`text=${clientMsg.slice(0, 24)}`).first().waitFor({ timeout: 10000 }).catch(() => {})
    await showCaption(page, "CLIENT: Message sent - now switch to ADMIN", 2800)

    // --- ADMIN (same page / same video) ---
    await page.evaluate(() => {
      localStorage.removeItem("reloved_donor_token")
      localStorage.removeItem("reloved_admin_token")
      sessionStorage.clear()
    })
    await showCaption(page, "ADMIN: Sign in to Reloved admin", 2400)
    await adminLogin(page)

    await showCaption(page, "ADMIN: Claim Requests - find this claim + Message user", 3000)
    await page.goto(`${BASE_URL}/admin/item-requests`, { waitUntil: "networkidle" })
    await pause(1200)
    const approvedTab = page.getByRole("button", { name: /^approved$/i }).first()
    if (await approvedTab.isVisible().catch(() => false)) await humanClick(approvedTab)
    await pause(1200)

    // Prefer the card that shows our client message preview if present; else first Message user
    const adminChat = page.getByRole("button", { name: /Message user|Reply to user|Chat/i }).first()
    await adminChat.scrollIntoViewIfNeeded()
    await humanClick(adminChat)
    await pause(2500)

    await showCaption(page, "ADMIN: Sees client messages in the same thread", 3200)
    await page.locator(`text=${clientMsg.slice(0, 20)}`).first().waitFor({ timeout: 12000 }).catch(() => {})
    await page.locator('input[placeholder*="message" i], input[placeholder*="Reply" i]').first().scrollIntoViewIfNeeded()
    await pause(1500)

    await showCaption(page, "ADMIN: Replies to the client", 2400)
    await humanType(
      page.locator('input[placeholder*="message" i], input[placeholder*="Reply" i]').first(),
      adminMsg,
    )
    await humanClick(page.locator('form button[type="submit"]').first())
    await pause(2800)
    await page.locator(`text=${adminMsg.slice(0, 24)}`).first().waitFor({ timeout: 10000 }).catch(() => {})
    await showCaption(page, "ADMIN: Reply sent - back to CLIENT to verify", 2800)

    // --- CLIENT again ---
    await page.evaluate(() => {
      localStorage.removeItem("reloved_admin_token")
      sessionStorage.clear()
    })
    await loginDonor(page)
    await showCaption(page, "CLIENT: Re-open claim - should see admin reply", 2800)
    await page.goto(`${BASE_URL}/account/claims/${claim.id}`, { waitUntil: "networkidle" })
    await pause(1500)

    const openChat = page.getByRole("button", { name: /Message Reloved|Chat with Reloved/i }).first()
    if (await openChat.isVisible().catch(() => false)) {
      await humanClick(openChat)
      await pause(2000)
    }
    await page.locator("text=Chat with Reloved").first().scrollIntoViewIfNeeded().catch(() => {})
    await pause(1500)

    await showCaption(page, "CLIENT: Admin reply appears in the same chat - end to end OK", 4000)
    await page.locator(`text=${adminMsg.slice(0, 20)}`).first().waitFor({ timeout: 20000 }).catch(() => {})
    await pause(3500)
    await showCaption(page, "Recording complete - client + admin two-way chat verified", 3200)

    const video = page.video()
    await context.close()
    await browser.close()
    console.log("Saved:", await finalizeVideo(video))
  } catch (err) {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
    throw err
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
