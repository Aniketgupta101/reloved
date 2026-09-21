/**
 * Capture screenshots for client "Changes & Fixes" list.
 * Usage: node scripts/capture-client-feedback-fixes.mjs
 * Base: BASE_URL env or http://localhost:3001
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "../recordings/client-feedback-fixes")
const BASE = process.env.BASE_URL || "http://localhost:3001"

fs.mkdirSync(OUT, { recursive: true })

const shots = []

async function shot(page, name, label) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  shots.push({ name, label, file })
  console.log(`✓ ${name} — ${label}`)
}

async function shotFull(page, name, label) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  shots.push({ name, label, file })
  console.log(`✓ ${name} — ${label}`)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 430, height: 900 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)

  // --- Wall / terminology / hero ---
  await page.goto(`${BASE}/drop`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1500)
  await shot(page, "01-wall-hero-copy", "Wall hero: PRELOVED CATALOGUE + Preloved pieces + filters")

  // Scroll to filters if needed
  const filters = page.getByText("Filters", { exact: false }).first()
  if (await filters.count()) {
    await filters.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(400)
    await shot(page, "02-wall-filters", "Straight into FILTERS (For Women/Men/Girls/Boys)")
  }

  // Locality on cards
  await page.evaluate(() => window.scrollBy(0, 400))
  await page.waitForTimeout(600)
  await shot(page, "03-wall-locality", "Wall cards locality (Bandra W style / no Zone preferred)")

  // --- Footer ---
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(800)
  await shot(page, "04-footer-simplified", "Footer: Preloved pieces. Always free. + Explore/About/Policies")

  // Desktop footer for clarity
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto(`${BASE}/drop`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1000)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(600)
  await shot(page, "05-footer-desktop", "Footer desktop — Track a Request, Partner With Us, About Reloved")

  // Back to mobile
  await page.setViewportSize({ width: 430, height: 900 })

  // --- Give: category Apparel, For, description optional, handover ---
  await page.goto(`${BASE}/give`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1200)
  await shot(page, "06-give-photo-step", "Give photo step — One Item / Multiple Items")

  // Try continue without photos may be blocked — click Multiple Items
  const multi = page.getByRole("button", { name: /Multiple Items/i })
  if (await multi.count()) {
    await multi.click()
    await page.waitForTimeout(400)
    await shot(page, "07-give-multi-item-mode", "Multiple Items — photos per item + Add another item")
  }

  // Inject a fake photo via file input if present, else jump by setting local state is hard.
  // Navigate with query won't work. Use evaluate to skip to step 2 if possible — instead
  // create a tiny PNG and upload.
  const input = page.locator('input[type="file"]').first()
  if (await input.count()) {
    const tinyPng = path.join(OUT, "_seed.png")
    // 1x1 png
    const b64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    fs.writeFileSync(tinyPng, Buffer.from(b64, "base64"))
    await input.setInputFiles(tinyPng)
    await page.waitForTimeout(800)
    await shot(page, "08-give-photo-added", "Photo added (multi / single flow)")

    const cont = page.getByRole("button", { name: /Continue|Next/i }).first()
    if (await cont.count()) {
      await cont.click()
      // May wait on analyze — allow longer
      await page.waitForTimeout(8000)
      await shot(page, "09-give-item-details", "Item details: Apparel + For (Men/Women/Girls/Boys) + Description optional")

      // Open category select if visible
      const cat = page.locator("select").first()
      if (await cat.count()) {
        await cat.click().catch(() => {})
        await page.waitForTimeout(300)
      }
      await shot(page, "10-give-category-apparel", "Category options (Apparel not Clothes)")

      // Gender / For select
      const selects = page.locator("select")
      const n = await selects.count()
      for (let i = 0; i < n; i++) {
        const opts = await selects.nth(i).locator("option").allTextContents()
        if (opts.some((o) => /Women|Men|Girls|Boys/i.test(o))) {
          await selects.nth(i).scrollIntoViewIfNeeded()
          await shot(page, "11-give-for-gender", "For: Men / Women / Girls / Boys")
          break
        }
      }

      // Description label
      const desc = page.getByText(/^Description$/i).first()
      if (await desc.count()) {
        await desc.scrollIntoViewIfNeeded()
        await page.waitForTimeout(300)
        await shot(page, "12-give-description-optional", "Description without mandatory *")
      }

      // Advance to handover if possible (may hit login)
      for (let step = 0; step < 4; step++) {
        const btn = page.getByRole("button", { name: /Continue|Next/i }).first()
        if (!(await btn.count()) || (await btn.isDisabled().catch(() => true))) break
        // Fill minimal required fields on details
        if (step === 0) {
          const title = page.locator('input').filter({ has: page.locator("xpath=ancestor::div[contains(.,'Item Title') or contains(.,'TITLE')]") }).first()
          // simpler: fill first text input that looks empty
          const titleInput = page.getByPlaceholder(/Vintage|Jacket|e\.g\./i).first()
          if (await titleInput.count()) await titleInput.fill("Pink corduroy jacket")
          const forSel = page.locator("select").nth(1)
          if (await forSel.count()) {
            const texts = await forSel.locator("option").allTextContents()
            if (texts.some((t) => /Women/i.test(t))) await forSel.selectOption({ label: "Women" }).catch(() => {})
          }
        }
        await btn.click().catch(() => {})
        await page.waitForTimeout(1500)
        const handover = page.getByText(/Handover option|How should this reach/i)
        if (await handover.count()) {
          await shot(page, "13-give-handover-options", "Handover — no Personal driver; I send it myself")
          const hoSelect = page.locator("select").filter({ has: page.locator("option", { hasText: /I send it myself|Borzo|Receiver collects/i }) }).first()
          if (await hoSelect.count()) {
            await hoSelect.click().catch(() => {})
            await page.waitForTimeout(400)
            await shot(page, "14-give-handover-dropdown-open", "Handover dropdown options (3 only)")
          }
          break
        }
        // Login gate
        if (await page.getByText(/Login|OTP|Mobile|Sign in/i).first().count()) {
          await shot(page, "13b-give-login-gate", "Login step before handover (expected for guests)")
          break
        }
      }
    }
  }

  // --- Account / Time Saved ---
  await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1500)
  await shot(page, "15-account-or-login", "Account (Giving stats without Time Saved — or login)")

  const giving = page.getByRole("button", { name: /Giving/i }).first()
  if (await giving.count()) {
    await giving.click()
    await page.waitForTimeout(800)
    await shot(page, "16-giving-no-time-saved", "Giving profile — Time Saved removed")
  }

  // --- Claim privacy / status (item detail if wall has items) ---
  await page.goto(`${BASE}/drop`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1500)
  const card = page.locator('a[href*="/item/"], a[href*="/drop/"]').first()
  if (await card.count()) {
    await card.click()
    await page.waitForTimeout(1500)
    await shot(page, "17-item-detail", "Item detail page")
    const claimBtn = page.getByRole("button", { name: /Claim|Request|Take/i }).first()
    if (await claimBtn.count()) {
      await claimBtn.click()
      await page.waitForTimeout(1200)
      await shot(page, "18-claim-flow-no-privacy-banner", "Claim flow — no IMPORTANT PRIVACY RULE pink box")
    }
  }

  // Track page rename
  await page.goto(`${BASE}/track`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1000)
  await shot(page, "19-track-request", "Track page (Track a Request naming in nav/footer)")

  // FAQ mention
  await page.goto(`${BASE}/faq`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("a, p, li, span")].find((n) =>
      /Track a Request/i.test(n.textContent || ""),
    )
    el?.scrollIntoView({ block: "center" })
  })
  await page.waitForTimeout(500)
  await shot(page, "20-faq-track-a-request", "FAQ: Track a Request (not Track Donation)")

  await browser.close()

  // Index markdown
  const md = [
    "# Client feedback — Changes & Fixes screenshots",
    "",
    `Captured: ${new Date().toISOString()}`,
    `Base URL: ${BASE}`,
    "",
    "| # | File | What it shows |",
    "|---|------|---------------|",
    ...shots.map((s, i) => `| ${i + 1} | \`${path.basename(s.file)}\` | ${s.label} |`),
    "",
    "## Not capturable as UI screenshots (backend / vendor)",
    "",
    "- **31–32** Email + WhatsApp wiring / trigger verification — needs live claim journey + Brevo/WhatsApp",
    "- **17–18** Multi-item AI fill for items 2+ — needs multi-item submit + AI response evidence",
    "- **23–24** Analyze speed / white-bg — before/after timing + Wall comparison after deploy",
    "- **25** Edit listing correction path — not built yet",
    "",
  ].join("\n")
  fs.writeFileSync(path.join(OUT, "INDEX.md"), md)
  console.log(`\nDone. ${shots.length} shots → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
