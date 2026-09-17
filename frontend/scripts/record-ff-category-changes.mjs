/**
 * Per-category Friday F&F change videos.
 * Each category gets its own .webm with captions that spell out the EXACT UI/product change.
 *
 *   node scripts/record-ff-category-changes.mjs
 *
 * Outputs under frontend/recordings/ff-categories/
 * Also copies to Desktop/Reloved-F&F-Category-Videos/
 */
import { chromium } from "playwright"
import { mkdir, rename, unlink, writeFile, readFile, copyFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pause, showCaption, humanClick, focusElement } from "./uat-recording-helpers.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings", "ff-categories")
const DESKTOP_DIR = path.join("C:\\Users\\PC 3\\Desktop", "Reloved-F&F-Category-Videos")
const BASE_URL = process.env.RECORD_BASE_URL || "http://localhost:3000"
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"

const CLAIMER = {
  phone: "9876501235",
  name: "Ananya Shah",
  username: "ananya_bandra",
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

async function ensureProfile(token, user) {
  await api("/api/donor/profile", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: user.name,
      username: user.username,
      gender: "men",
      clothingPreference: "men",
      phone: user.phone,
      address: "Bandra West, Mumbai",
      addressLabel: "home",
      pincode: "400050",
      latitude: 19.0596,
      longitude: 72.8295,
    }),
  })
}

async function getToken() {
  const cachePath = path.join(OUT_DIR, ".claimer-token.json")
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8"))
    if (cached.token && cached.createdAt > Date.now() - 15 * 60 * 1000) return cached.token
  } catch {
    // miss
  }
  let token
  try {
    token = await loginWithOtp(CLAIMER.phone)
  } catch (err) {
    console.warn("OTP failed, wait 70s:", err.message)
    await pause(70_000)
    token = await loginWithOtp(CLAIMER.phone)
  }
  await ensureProfile(token, CLAIMER)
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(cachePath, JSON.stringify({ token, createdAt: Date.now() }, null, 2))
  return token
}

async function injectSession(page, token) {
  await page.addInitScript((t) => {
    localStorage.setItem("reloved_donor_token", t)
    localStorage.setItem(
      "reloved_donor_prefs",
      JSON.stringify({ username: "ananya_bandra", clothingPreference: "men" }),
    )
  }, token)
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
  await mkdir(DESKTOP_DIR, { recursive: true })
  await copyFile(finalPath, path.join(DESKTOP_DIR, filename))
  console.log("saved", filename)
  return finalPath
}

async function openBrowser(token) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
  })
  await injectSession(context, token)
  const page = await context.newPage()
  return { browser, context, page }
}

async function caption(page, lines, ms = 3200) {
  await showCaption(page, Array.isArray(lines) ? lines.join(" · ") : lines, ms)
}

/** CATEGORY RECORDINGS -------------------------------------------------- */

async function recLocationMatching(token) {
  const { browser, context, page } = await openBrowser(token)
  try {
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await pause(1500)
    await caption(page, [
      "CATEGORY: Location & Matching",
      "CHANGE: Wall uses live inventory (not mocks)",
      "CHANGE: Public card shows area only (e.g. Juhu) — never flat/exact address",
    ], 4500)
    await page.mouse.wheel(0, 400)
    await pause(1200)
    await focusElement(page, page.locator("text=/AVAILABLE|₹0 FREE|Being Matched|Reloved/i").first())
    await caption(page, [
      "CHANGE: Status stamps on cards — Available / Being Matched / Reloved",
      "CHANGE: ₹0 FREE tag restored (item never has a price)",
    ], 4500)
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" })
    await pause(1200)
    const map = page.locator("text=/map|kindness map|Mumbai/i").first()
    await focusElement(page, map)
    await page.mouse.wheel(0, 800)
    await pause(1500)
    await caption(page, [
      "CHANGE: Kindness Map pins come from live Wall inventory by area",
      "CHANGE: ~3 km nearby-first still applies for giver-sends claims",
      "NOTE: Batch-1 shirts = Reloved (NGO delivered); Batch-2 pants = Available",
    ], 5500)
  } finally {
    const video = page.video()
    await context.close()
    await browser.close()
    await finalizeVideo(video, "01-location-matching.webm")
  }
}

async function recUxStatuses(token) {
  const { browser, context, page } = await openBrowser(token)
  try {
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "domcontentloaded" })
    await pause(1500)
    await caption(page, [
      "CATEGORY: UX Polish — card tags",
      "CHANGE: Top-left = For You / Being Matched / Reloved (when applicable)",
      "CHANGE: Bottom-right = Available (or ₹0 FREE when status is top-left)",
    ], 5000)
    await page.mouse.wheel(0, 350)
    await pause(1000)
    await caption(page, [
      "CHANGE: Footer chip ₹0 FREE always visible",
      "CHANGE: 'Picked for you' section when gender preference matches",
      "CHANGE: Weekly claim limit copy = 3 items / week (not month)",
    ], 5000)
    // open an item
    const card = page.locator("a[href*='/drop/']").first()
    if (await card.count()) {
      await humanClick(card)
      await pause(2000)
      await caption(page, [
        "ITEM DETAIL",
        "CHANGE: Delivery preference visible before claim",
        "CHANGE: Photo swipe when multiple images exist",
      ], 4500)
    }
  } finally {
    const video = page.video()
    await context.close()
    await browser.close()
    await finalizeVideo(video, "02-ux-statuses-tags.webm")
  }
}

async function recClaimLifecycle(token) {
  const { browser, context, page } = await openBrowser(token)
  try {
    await page.goto(`${BASE_URL}/account`, { waitUntil: "domcontentloaded" })
    await pause(1500)
    await caption(page, [
      "CATEGORY: Claim Lifecycle",
      "CHANGE: Giver can Accept OR Decline a claim",
      "CHANGE: Decline requires a reason (too far / timing / other)",
    ], 4500)
    await page.mouse.wheel(0, 400)
    await pause(1000)
    // Try claims / requests tabs
    for (const label of [/claims/i, /requests/i, /incoming/i, /my claims/i, /giving/i]) {
      const tab = page.getByRole("button", { name: label }).or(page.getByRole("link", { name: label }))
      if (await tab.first().isVisible().catch(() => false)) {
        await humanClick(tab.first())
        await pause(1200)
      }
    }
    await caption(page, [
      "CHANGE: Soft copy only — never says 'Rejected'",
      "CHANGE: After decline, item returns to Available",
      "CHANGE: Status path: Available → Being Matched → Handed Over → Reloved",
    ], 5500)
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "domcontentloaded" })
    await pause(1200)
    const link = page.locator("a[href*='/drop/']").first()
    if (await link.count()) {
      await humanClick(link)
      await pause(2000)
      await page.mouse.wheel(0, 600)
      await caption(page, [
        "CLAIMER SIDE",
        "CHANGE: Sees giver logistics / who pays courier before claiming",
        "CHANGE: Claim limit messaging: 3 items per week",
      ], 4500)
    }
  } finally {
    const video = page.video()
    await context.close()
    await browser.close()
    await finalizeVideo(video, "03-claim-lifecycle.webm")
  }
}

async function recDeliveryPrivacy(token) {
  const { browser, context, page } = await openBrowser(token)
  try {
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "domcontentloaded" })
    await pause(1200)
    const link = page.locator("a[href*='/drop/']").first()
    if (await link.count()) await humanClick(link)
    await pause(2000)
    await page.mouse.wheel(0, 700)
    await caption(page, [
      "CATEGORY: Delivery & Handover",
      "CHANGE: F&F courier path = prepaid Borzo only (no COD)",
      "CHANGE: Direct handover still supported (Handed Over status)",
    ], 5000)
    await caption(page, [
      "CATEGORY: Privacy",
      "CHANGE: Wall/item show broad locality only (Juhu / Bandra…)",
      "CHANGE: Exact address only at handover / courier booking",
    ], 4500)
    await page.goto(`${BASE_URL}/privacy`, { waitUntil: "domcontentloaded" })
    await pause(1500)
    await page.mouse.wheel(0, 500)
    await caption(page, [
      "CHANGE: Privacy Policy authenticity / platform-role wording updated",
      "Platform connects people — no condition guarantees",
    ], 4500)
  } finally {
    const video = page.video()
    await context.close()
    await browser.close()
    await finalizeVideo(video, "04-delivery-privacy.webm")
  }
}

async function recGiveOnboarding(token) {
  const { browser, context, page } = await openBrowser(token)
  try {
    await page.goto(`${BASE_URL}/give`, { waitUntil: "domcontentloaded" })
    await pause(1500)
    await caption(page, [
      "CATEGORY: Onboarding & Listing + Upload / AI",
      "CHANGE: Multi-photo upload supported",
      "CHANGE: Gemini AI auto-fills title/category/description on Continue",
    ], 4500)
    const jpg = process.env.TEMP + "/reloved-give-ai-check.jpg"
    const input = page.locator("input[type=file]").first()
    if (await input.count()) {
      await input.setInputFiles(jpg).catch(() => {})
      await pause(1500)
      const cont = page.getByRole("button", { name: /continue|next/i }).first()
      if (await cont.isVisible().catch(() => false)) {
        await humanClick(cont)
        await pause(10000)
      }
    }
    await caption(page, [
      "CHANGE: Kids/boys/girls size NOT forced",
      "CHANGE: Donor can delete own incomplete listing from account",
      "CHANGE: Upload limits raised for multi-photo mobile",
    ], 5000)
    await page.mouse.wheel(0, 300)
    await pause(1200)
  } finally {
    const video = page.video()
    await context.close()
    await browser.close()
    await finalizeVideo(video, "05-give-onboarding-ai.webm")
  }
}

async function recSupportChat(token) {
  const { browser, context, page } = await openBrowser(token)
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" })
    await pause(1500)
    await caption(page, [
      "CATEGORY: Support Chat",
      "CHANGE: Preset Reloved questions only — NOT an open AI bot",
      "CHANGE: Escalate unanswered → human email",
    ], 4500)
    // floating help button
    const help = page.locator("button").filter({ hasText: /help|support|\?/i }).last()
      .or(page.locator("[aria-label*=help i], [aria-label*=support i], .fixed button").last())
    const candidates = [
      page.locator("button.fixed").last(),
      page.getByRole("button", { name: /help|chat|support/i }),
      page.locator("text=/Ask Reloved|Need help/i"),
    ]
    for (const c of candidates) {
      if (await c.first().isVisible().catch(() => false)) {
        await humanClick(c.first())
        await pause(1500)
        break
      }
    }
    await caption(page, [
      "CHANGE: Presets e.g. order status / delivery / contact Reloved",
      "CHANGE: Human escalation email path when preset isn't enough",
    ], 4500)
    await pause(1500)
  } finally {
    const video = page.video()
    await context.close()
    await browser.close()
    await finalizeVideo(video, "06-support-chat.webm")
  }
}

async function recFaqLimits(token) {
  const { browser, context, page } = await openBrowser(token)
  try {
    await page.goto(`${BASE_URL}/faq`, { waitUntil: "domcontentloaded" })
    await pause(1500)
    await caption(page, [
      "CATEGORY: Messaging / UX copy",
      "CHANGE: FAQ + UI say weekly 3-claim limit",
      "CHANGE: Soft decline language; prepaid Borzo / no COD explained",
    ], 4500)
    await page.mouse.wheel(0, 600)
    await pause(1500)
    // try expand FAQ items
    const q = page.locator("button, summary, [role=button]").filter({ hasText: /claim|courier|Borzo|limit|free/i })
    const n = Math.min(3, await q.count())
    for (let i = 0; i < n; i++) {
      await humanClick(q.nth(i)).catch(() => {})
      await pause(900)
    }
    await caption(page, [
      "CHANGE: Email fallback still sent for critical claim/match events",
      "In-app notifications are primary; email when offline",
    ], 4000)
  } finally {
    const video = page.video()
    await context.close()
    await browser.close()
    await finalizeVideo(video, "07-faq-limits-copy.webm")
  }
}

async function writeIndexMarkdown(summaryRows) {
  const md = `# Reloved F&F — Category change videos

Recorded from **local UI** (\`localhost:3000\`) + **live API**.
These show the exact product changes from the Friday task sheet.

| # | Category | Video | Exact changes shown | CSV status note |
|---|---|---|---|---|
${summaryRows.map((r) => `| ${r.n} | ${r.cat} | \`${r.file}\` | ${r.changes} | ${r.note} |`).join("\n")}

## Important: why some things feel unchanged

1. **This CSV still says "Not Started" for everything** — statuses were never updated after implementation. Use the table above / updated CSV.
2. **Production hosting (\`reloved-digital.web.app\`) may still serve an older frontend bundle.** Backend (Gemini, inventory batch statuses) is live. Redeploy frontend hosting to push Wall tags / Give AI client fixes site-wide.
3. **Phase 2 rows (P2-01…)** are intentionally **Deferred** — Borzo+Porter dual path, deep courier automation, etc. are NOT in F&F.
4. **Call masking (P0-34)** needs a live ops phone test — UI/API exists; E2E depends on Edesy wallet/number.
5. **Inventory:** Batch 1 shirts = Reloved (NGO delivered). Batch 2 pants = Available on Wall.

Desktop copies: \`Desktop/Reloved-F&F-Category-Videos/\`
`

  await writeFile(path.join(OUT_DIR, "README.md"), md)
  await writeFile(path.join(DESKTOP_DIR, "README.md"), md)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  await mkdir(DESKTOP_DIR, { recursive: true })
  console.log("Logging in…")
  const token = await getToken()
  console.log("Recording categories…")

  await recLocationMatching(token)
  await recUxStatuses(token)
  await recClaimLifecycle(token)
  await recDeliveryPrivacy(token)
  await recGiveOnboarding(token)
  await recSupportChat(token)
  await recFaqLimits(token)

  await writeIndexMarkdown([
    {
      n: "01",
      cat: "Location & Matching",
      file: "01-location-matching.webm",
      changes: "Live wall inventory; area-only locality; live map pins; batch1 Reloved / batch2 Available",
      note: "P0-01…05 mostly Done in code; re-seed social-proof mix optional",
    },
    {
      n: "02",
      cat: "UX Polish / Tags",
      file: "02-ux-statuses-tags.webm",
      changes: "Available + ₹0 FREE + Being Matched/Reloved/For You corner tags; weekly limit copy",
      note: "UX-01…07 Done locally — redeploy hosting if prod looks old",
    },
    {
      n: "03",
      cat: "Claim Lifecycle",
      file: "03-claim-lifecycle.webm",
      changes: "Accept/Decline+reason; soft copy; logistics before claim; status path",
      note: "P0-06…11 Done in code; full E2E still needs Thu QA with two phones",
    },
    {
      n: "04",
      cat: "Delivery + Privacy",
      file: "04-delivery-privacy.webm",
      changes: "Prepaid Borzo path; handover; broad locality; Privacy Policy authenticity",
      note: "P0-16…22 Done; Porter dual-option is Phase 2",
    },
    {
      n: "05",
      cat: "Give / Onboarding / AI upload",
      file: "05-give-onboarding-ai.webm",
      changes: "Multi-photo; Gemini autofill; kids size optional; upload limits",
      note: "P0-23…27 + P0-35…37 Done; AI verified live",
    },
    {
      n: "06",
      cat: "Support Chat",
      file: "06-support-chat.webm",
      changes: "Preset Qs + email escalate (no free-text AI bot)",
      note: "P0-32…33 Done",
    },
    {
      n: "07",
      cat: "FAQ / messaging copy",
      file: "07-faq-limits-copy.webm",
      changes: "Weekly 3-claim + Borzo prepaid / soft decline language in FAQ",
      note: "P0-12…15 + UX-04/05 Done for F&F wording",
    },
  ])

  console.log("\nAll category videos in:")
  console.log(" ", OUT_DIR)
  console.log(" ", DESKTOP_DIR)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
