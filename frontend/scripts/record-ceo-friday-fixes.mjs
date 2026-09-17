/**
 * CEO Friday fix boundary — screen recording of Reloved updates.
 *
 *   cd frontend
 *   npm run dev   # in another terminal
 *   npm run record:ceo-friday-fixes
 *
 * Output: recordings/ceo-friday-fixes/ceo-friday-fixes.webm + NOTES.md
 */
import { chromium } from "playwright"
import { mkdir, writeFile } from "node:fs/promises"
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

  const notes = []
  const step = async (title, fn) => {
    console.log(`→ ${title}`)
    notes.push(`- ${title}`)
    await showCaption(page, title, 1800)
    await fn()
    await pause(800)
  }

  try {
    await step("1. Home — black manifesto + Time saved / 🔥 streak / Reloved cards", async () => {
      await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 60000 })
      await pause(1200)
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.35, behavior: "smooth" }))
      await pause(2000)
      await page.screenshot({ path: path.join(OUT, "01-home-manifesto-metrics.png"), fullPage: false })
    })

    await step("2. Wall item — multi-photo gallery with swipe / arrows", async () => {
      await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle", timeout: 60000 })
      await pause(1000)
      const firstCard = page.locator('a[href^="/items/"]').first()
      if (await firstCard.count()) {
        await firstCard.click()
        await page.waitForLoadState("networkidle")
        await pause(1000)
        const next = page.getByRole("button", { name: "Next photo" })
        if (await next.count()) {
          await next.click()
          await pause(600)
          await next.click()
          await pause(600)
        }
        await page.screenshot({ path: path.join(OUT, "02-item-photo-gallery.png"), fullPage: false })
      } else {
        notes.push("  (no wall items found for photo demo)")
      }
    })

    await step("3. Account — black header, weekly claim copy, Time saved + 🔥 streak", async () => {
      const session = await getUatSession().catch(() => null)
      if (!session?.token) {
        notes.push("  (UAT session unavailable — opening login)")
        await page.goto(`${BASE_URL}/account/login`, { waitUntil: "networkidle" })
        await page.screenshot({ path: path.join(OUT, "03-account-login.png"), fullPage: false })
        return
      }
      await page.goto(`${BASE_URL}/account/login`, { waitUntil: "domcontentloaded" })
      await page.evaluate((token) => {
        localStorage.setItem("reloved_donor_token", token)
      }, session.token)
      await page.goto(`${BASE_URL}/account?tab=profile`, { waitUntil: "networkidle", timeout: 60000 })
      await pause(1500)
      await page.screenshot({ path: path.join(OUT, "03-account-metrics.png"), fullPage: false })
      await page.getByRole("tab", { name: /Notifications/i }).click().catch(() => {})
      await pause(1000)
      await page.screenshot({ path: path.join(OUT, "04-notifications-open-only.png"), fullPage: false })
      await page.getByRole("tab", { name: /Claiming/i }).click().catch(() => {})
      await pause(1000)
      await page.screenshot({ path: path.join(OUT, "05-weekly-claim-limit.png"), fullPage: false })
    })

    await step("4. Done — CEO Friday fixes captured", async () => {
      await pause(1200)
    })
  } finally {
    const videoPath = await page.video()?.path()
    await context.close()
    await browser.close()

    if (videoPath) {
      const dest = path.join(OUT, "ceo-friday-fixes.webm")
      const { rename, copyFile } = await import("node:fs/promises")
      try {
        await rename(videoPath, dest)
      } catch {
        await copyFile(videoPath, dest)
      }
      notes.unshift(`Video: ${dest}`)
      console.log(`Saved video → ${dest}`)
    }

    await writeFile(
      path.join(OUT, "NOTES.md"),
      `# CEO Friday fix boundary — recording\n\n${new Date().toISOString()}\n\n## Covered\n\n${notes.join("\n")}\n\n## Fixes shown\n\n- Home manifesto on black wash: Time saved, 🔥 streak, Items Reloved (replaced enhances)\n- Account black header + Time saved + streak metrics\n- Weekly claim limit copy (not monthly)\n- Notifications: open / mark-read only (no location / delete)\n- Item detail multi-photo arrows + swipe\n`,
      "utf8",
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
