/**
 * Casual-user screen recording of Friday F&F changes on local frontend.
 *
 * Uses localhost:3000 (local UI) + live API for real inventory/login.
 * Personas feel like normal Mumbai users (not "UAT" branding on screen).
 *
 *   node scripts/record-ff-casual-walkthrough.mjs
 *
 * Output: frontend/recordings/ff-casual-walkthrough.webm
 */
import { chromium } from "playwright"
import { mkdir, rename, unlink, readdir, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pause, showCaption, humanClick, humanBrowsePage, focusElement } from "./uat-recording-helpers.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const BASE_URL = process.env.RECORD_BASE_URL || "http://localhost:3000"
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"

/** Casual claimer persona (OTP path uses known SMS-dev numbers). */
const CLAIMER = {
  phone: "9876501235",
  name: "Ananya Shah",
  username: "ananya_bandra",
}

/** Casual giver persona */
const GIVER = {
  phone: "9876501241",
  name: "Rohan Mehta",
  username: "rohan_juhu",
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
  if (!devCode) throw new Error(`No OTP devCode for ${phone} — cannot login for recording`)
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
      gender: "unisex",
      phone: user.phone,
      address: "Bandra West, Mumbai",
      addressLabel: "home",
      pincode: "400050",
      latitude: 19.0596,
      longitude: 72.8295,
    }),
  })
}

async function getOrCreateSession(user, cacheName) {
  const cachePath = path.join(OUT_DIR, cacheName)
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8"))
    if (cached.token && cached.createdAt > Date.now() - 20 * 60 * 1000) return cached.token
  } catch {
    // miss
  }
  let token
  try {
    token = await loginWithOtp(user.phone)
  } catch (err) {
    console.warn("OTP failed, waiting 70s then retry:", err.message)
    await pause(70_000)
    token = await loginWithOtp(user.phone)
  }
  await ensureProfile(token, user)
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(cachePath, JSON.stringify({ token, createdAt: Date.now(), user }, null, 2))
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

async function loginDonor(page, token) {
  await page.goto(`${BASE_URL}/account/login`, { waitUntil: "domcontentloaded" })
  await page.evaluate((t) => localStorage.setItem("reloved_donor_token", t), token)
  await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  await pause(900)
}

async function openHelpChat(page) {
  const help = page.getByRole("button", { name: /open help|close help/i }).first()
  if (await help.isVisible().catch(() => false)) {
    await humanClick(help)
    await pause(1000)
    return true
  }
  // Fallback: pink FAB bottom-right
  const fab = page.locator("button.fixed.bottom-5.right-5").first()
  if (await fab.isVisible().catch(() => false)) {
    await humanClick(fab)
    await pause(1000)
    return true
  }
  return false
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log("Checking local frontend…")
  const health = await fetch(BASE_URL).catch(() => null)
  if (!health?.ok) {
    throw new Error(`Frontend not reachable at ${BASE_URL}. Start with: cd frontend && npm run dev`)
  }

  console.log("Signing in casual claimer (Ananya)…")
  const claimerToken = await getOrCreateSession(CLAIMER, ".casual-claimer-session.json")
  console.log("Signing in casual giver (Rohan)…")
  const giverToken = await getOrCreateSession(GIVER, ".casual-giver-session.json")

  const viewport = { width: 1440, height: 900 }
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT_DIR, size: viewport },
  })
  const page = await context.newPage()
  page.on("dialog", async (dialog) => {
    await pause(200)
    await dialog.accept().catch(() => {})
  })
  const video = page.video()

  try {
    // ——— Guest discovery ———
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" })
    await showCaption(page, "Reloved F&F walkthrough — local build · casual user flow", 3200)
    await humanBrowsePage(page, { sections: 3 })

    // ——— Wall statuses / no For You ———
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle" })
    await showCaption(page, "Wall of Kindness — Available / Being Matched badges (no For You)", 3200)
    await pause(1500)
    await humanBrowsePage(page, { sections: 3 })

    // ——— Map ———
    await page.goto(`${BASE_URL}/map`, { waitUntil: "networkidle" }).catch(async () => {
      // try home section or /impact
      await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" })
    })
    // Kindness map may live on home or a dedicated route — also try common paths
    for (const pathTry of ["/map", "/impact", "/drop"]) {
      await page.goto(`${BASE_URL}${pathTry}`, { waitUntil: "domcontentloaded" }).catch(() => {})
      const mapHeading = page.getByText(/live wall map|interactive localities|mumbai/i).first()
      if (await mapHeading.isVisible().catch(() => false)) {
        await showCaption(page, "Live map pins from inventory — broad locality only", 3000)
        await humanBrowsePage(page, { sections: 2 })
        break
      }
    }

    // ——— Claimer account ———
    await loginDonor(page, claimerToken)
    await showCaption(page, `Signed in as ${CLAIMER.name} — browsing nearby Wall`, 2800)
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle" })
    await pause(1200)
    await humanBrowsePage(page, { sections: 2 })

    const card = page.locator('a[href^="/drop/"]').first()
    if (await card.count()) {
      await humanClick(card)
      await pause(1600)
      await showCaption(page, "Item detail — status, delivery preference, photo swipe, weekly claim limit", 3400)
      await pause(1200)
      // Try swipe / next photo if present
      const nextPhoto = page.getByRole("button", { name: /next photo/i }).first()
      if (await nextPhoto.isVisible().catch(() => false)) {
        await humanClick(nextPhoto)
        await pause(800)
        await humanClick(nextPhoto)
        await pause(800)
      }
      await humanBrowsePage(page, { sections: 2 })
      const claimBtn = page.getByRole("button", { name: /claim this item/i }).first()
      if (await claimBtn.isVisible().catch(() => false)) {
        await focusElement(page, claimBtn)
        await showCaption(page, "Ready to claim — weekly limit shown above the button", 2800)
      }
    }

    // ——— Support chat presets ———
    await showCaption(page, "Support chat — preset questions + human escalate (no AI bot)", 2800)
    if (await openHelpChat(page)) {
      const preset = page.getByRole("button", { name: /where is my order|how does delivery|how do i contact/i }).first()
      if (await preset.isVisible().catch(() => false)) {
        await humanClick(preset)
        await pause(2000)
      }
      const escalate = page.getByPlaceholder(/short note for reloved/i).first()
      if (await escalate.isVisible().catch(() => false)) {
        await escalate.click()
        await escalate.fill("Hi — just checking how handover timing works for a claim in Bandra.")
        await pause(1500)
        await showCaption(page, "Escalate sends email to Reloved team", 2500)
      }
      // close help
      await openHelpChat(page)
    }

    // ——— Privacy ———
    await page.goto(`${BASE_URL}/privacy`, { waitUntil: "networkidle" })
    await showCaption(page, "Privacy — platform connects people; no authenticity guarantee", 3000)
    const authenticity = page.getByText(/authenticity|as is|platform role/i).first()
    if (await authenticity.isVisible().catch(() => false)) {
      await authenticity.scrollIntoViewIfNeeded()
      await pause(2000)
    }
    await humanBrowsePage(page, { sections: 2 })

    // ——— Give flow (giver) ———
    await loginDonor(page, giverToken)
    await showCaption(page, `Signed in as ${GIVER.name} — Drop / Give flow`, 2800)
    await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
    await pause(1200)
    await showCaption(page, "Give flow — kids size not forced; multi-photo upload; Borzo prepaid option", 3200)
    await humanBrowsePage(page, { sections: 2 })

    // ——— Account gifts (remove listing if pending visible) ———
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
    await pause(1000)
    await showCaption(page, "Account — gifts, claims, remove incomplete listing", 2800)
    const giving = page.getByRole("button", { name: /giving|gifts/i }).first()
    if (await giving.isVisible().catch(() => false)) {
      await humanClick(giving)
      await pause(1500)
    }
    await humanBrowsePage(page, { sections: 2 })

    // ——— FAQ weekly limit ———
    await page.goto(`${BASE_URL}/faq`, { waitUntil: "networkidle" })
    await showCaption(page, "FAQ updated — weekly claim limit + prepaid Borzo", 2800)
    const faqClaim = page.getByText(/how many items can i claim/i).first()
    if (await faqClaim.isVisible().catch(() => false)) {
      await humanClick(faqClaim)
      await pause(2000)
    }

    await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle" })
    await showCaption(page, "F&F local build ready — try it yourself at http://localhost:3000", 3500)
    await pause(1500)
  } finally {
    await context.close()
    await browser.close()
    if (video) {
      const out = await finalizeVideo(video, "ff-casual-walkthrough.webm")
      console.log("\nRecording saved:\n ", out)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
