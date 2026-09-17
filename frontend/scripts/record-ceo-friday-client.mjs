/**
 * Single client/CEO proof video — Friday fixes only. No filler.
 *
 *   cd frontend && npm run record:ceo-friday-client
 *
 * Output: recordings/ceo-friday-fixes/RELOVED-Friday-Fixes-CEO.webm
 */
import { chromium } from "playwright"
import { mkdir, writeFile, rename, copyFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pause, showCaption } from "./uat-recording-helpers.mjs"
import { getUatSession } from "./setup-uat-test-user.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT = path.join(ROOT, "recordings", "ceo-friday-fixes")
const BASE_URL = process.env.RECORD_BASE_URL || "http://localhost:3000"

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  })
  const page = await context.newPage()

  try {
    // 1) Home manifesto metrics
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 60000 })
    await pause(600)
    await showCaption(page, "1 · Home: Time saved · 🔥 streak · Items Reloved (black manifesto)", 2200)
    await page.evaluate(() => {
      const el = document.querySelector("h2")
      // scroll to manifesto heading
      const nodes = [...document.querySelectorAll("h2, h3")]
      const m = nodes.find((n) => /Leave what you/i.test(n.textContent || ""))
      m?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    await pause(2200)
    await page.screenshot({ path: path.join(OUT, "ceo-01-home-metrics.png") })

    // 2) Account profile — colors + weekly + metrics
    const session = await getUatSession().catch(() => null)
    if (session?.token) {
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" })
      await page.evaluate((token) => localStorage.setItem("reloved_donor_token", token), session.token)
      await page.goto(`${BASE_URL}/account?tab=profile`, { waitUntil: "networkidle", timeout: 60000 })
      await pause(800)
      await showCaption(page, "2 · Account: weekly claim limit · Time saved · 🔥 streak (readable colors)", 2400)
      await pause(1600)
      await page.screenshot({ path: path.join(OUT, "ceo-02-account-profile.png") })

      await page.getByRole("tab", { name: /Notifications/i }).click()
      await pause(500)
      await showCaption(page, "3 · Notifications: open only — no location / delete", 2000)
      await pause(1200)
      await page.screenshot({ path: path.join(OUT, "ceo-03-notifications.png") })
    }

    // 3) Photo gallery swipe
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle", timeout: 60000 })
    await pause(600)
    const card = page.locator('a[href^="/items/"]').first()
    if (await card.count()) {
      await card.click()
      await page.waitForLoadState("networkidle")
      await pause(700)
      await showCaption(page, "4 · Item photos: swipe / arrows for multi-photo", 2000)
      const next = page.getByRole("button", { name: "Next photo" })
      if (await next.count()) {
        await next.click()
        await pause(500)
        await next.click()
        await pause(500)
      }
      await page.screenshot({ path: path.join(OUT, "ceo-04-photo-swipe.png") })
    }

    await showCaption(page, "Reloved · Friday fixes ready for F&F", 1800)
    await pause(800)
  } finally {
    const videoPath = await page.video()?.path()
    await context.close()
    await browser.close()
    const dest = path.join(OUT, "RELOVED-Friday-Fixes-CEO.webm")
    if (videoPath) {
      try {
        await rename(videoPath, dest)
      } catch {
        await copyFile(videoPath, dest)
      }
      console.log(`CLIENT VIDEO → ${dest}`)
    }
    await writeFile(
      path.join(OUT, "CEO-SHARE.md"),
      `# Share with client / CEO\n\n**Video:** \`RELOVED-Friday-Fixes-CEO.webm\`\n\nCovers only:\n1. Home metrics (Time saved, 🔥 streak, Items Reloved)\n2. Account profile (fixed colors, weekly limit, metrics)\n3. Notifications (no location/delete)\n4. Multi-photo swipe\n\nNo filler steps.\n`,
      "utf8",
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
