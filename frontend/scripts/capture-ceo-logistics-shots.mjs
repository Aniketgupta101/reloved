/**
 * Capture Give logistics / privacy / 3km screens that need a photo to unlock.
 */
import { chromium } from "playwright"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, "..", "..", "Docs", "CEO-Bug-Evidence")
const BASE = process.env.UAT_BASE_URL || "https://reloved-digital.web.app"
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

async function dest(page, bugId, slug, name) {
  const dir = path.join(OUT, `${bugId}_${slug}`)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log("saved", path.relative(OUT, file))
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()

  await page.route("**/api/donations/analyze-photos**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            ok: true,
            originalName: "tee.png",
            storagePath: "uploads/ceo-evidence-tee.png",
            url: "https://reloved-digital.web.app/og-default.png",
            suggestion: {
              title: "CEO Evidence Tee",
              category: "Tops",
              condition: "Good",
              gender: "Men",
              size: "M",
              brand: "Reloved",
              description: "Evidence capture item",
              quantity: 1,
            },
          },
        ],
      }),
    })
  })

  await page.goto(`${BASE}/give`, { waitUntil: "domcontentloaded", timeout: 90000 })
  await page.waitForTimeout(1500)
  const file = page.locator('input[type="file"]').first()
  console.log("file inputs", await page.locator('input[type="file"]').count())
  if (await file.count()) {
    await file.setInputFiles({ name: "tee.png", mimeType: "image/png", buffer: PNG })
    await page.waitForTimeout(1000)
  }

  // Kick analyze via Continue on step 1
  const cont1 = page.getByRole("button", { name: /continue/i }).first()
  console.log("continue visible", await cont1.count(), "disabled", await cont1.isDisabled().catch(() => null))
  if (await cont1.count()) {
    await cont1.click({ force: true }).catch(() => {})
    await page.waitForTimeout(2500)
  }
  await page.getByText(/item details|title|category|Drop something/i).first().waitFor({ timeout: 10000 }).catch(() => {})

  for (let i = 0; i < 10; i++) {
    const text = await page.locator("body").innerText()
    if (/3 km|building or landmark|Important privacy|Porter \/ Borzo|I send it|receiver collects|How will this item reach/i.test(text)) {
      console.log("on logistics/privacy step")
      break
    }

    // React-friendly fills
    const title = page.locator('input').filter({ hasText: /^$/ }).first()
    const titleByLabel = page.getByLabel(/item title/i).or(page.locator('input[name="itemTitle"], input[placeholder*="title" i]')).first()
    if (await titleByLabel.count()) await titleByLabel.fill("CEO Evidence Tee").catch(() => {})

    for (const label of [/Tops/i, /Men/i, /Good/i]) {
      const btn = page.getByRole("button", { name: label }).first()
      if (await btn.count()) await btn.click().catch(() => {})
    }
    // Size select
    const size = page.locator("select").first()
    if (await size.count()) await size.selectOption({ label: "M" }).catch(async () => {
      await size.selectOption({ index: 2 }).catch(() => {})
    })
    const desc = page.getByLabel(/description/i).or(page.locator("textarea")).first()
    if (await desc.count()) await desc.fill("CEO evidence capture item for bug pack.").catch(() => {})
    const brand = page.getByLabel(/brand/i).first()
    if (await brand.count()) await brand.fill("Reloved").catch(() => {})
    const qty = page.getByLabel(/quantity/i).first()
    if (await qty.count()) await qty.fill("1").catch(() => {})

    // Donor details if present
    for (const [lab, val] of [
      [/first name/i, "UAT"],
      [/last name/i, "Evidence"],
      [/email/i, "uat@example.com"],
      [/phone/i, "9876501235"],
    ]) {
      const el = page.getByLabel(lab).first()
      if (await el.count()) await el.fill(String(val)).catch(() => {})
    }

    void title
    const cont = page.getByRole("button", { name: /^continue$/i }).first()
    if (await cont.count()) {
      const disabled = await cont.isDisabled().catch(() => true)
      console.log("iter", i, "continue disabled?", disabled)
      if (!disabled) {
        await cont.click()
        await page.waitForTimeout(1500)
        continue
      }
    }
    console.log("stuck; dumping labels")
    break
  }

  const body = (await page.locator("body").innerText()).slice(0, 800)
  console.log("BODY:", body.replace(/\n/g, " | "))

  await dest(page, "BUG-01", "pre-match-receiver-address", "BUG-01-give-logistics.png")
  await dest(page, "BUG-03", "privacy-warning", "BUG-03-privacy-notice.png")
  await dest(page, "BUG-04", "location-fallback", "BUG-04-location.png")
  await dest(page, "BUG-05", "3km-matching", "BUG-05-3km.png")
  await dest(page, "BUG-10", "donor-send-courier", "BUG-10-logistics.png")

  for (const label of [/I send/i, /Porter/i, /receiver collects/i, /Arrange/i]) {
    const b = page.getByText(label).first()
    if (await b.count()) {
      await b.click().catch(() => {})
      await page.waitForTimeout(500)
    }
  }
  await dest(page, "BUG-05", "3km-matching", "BUG-05-3km-selected.png")
  await dest(page, "BUG-11", "reloved-not-courier", "BUG-11-porter-copy.png")

  await page.goto(`${BASE}/drop`, { waitUntil: "networkidle", timeout: 90000 })
  const href = await page.locator('a[href*="/drop/"]').first().getAttribute("href")
  const slug = href?.match(/\/drop\/([^/?#]+)/)?.[1]
  if (slug) {
    await page.goto(`${BASE}/drop/${slug}`, { waitUntil: "networkidle", timeout: 90000 })
    await dest(page, "BUG-02", "public-area-only", "BUG-02-item-detail.png")
    await dest(page, "BUG-19", "pre-match-location-privacy", "BUG-19-item-detail.png")
    await dest(page, "BUG-13", "giver-accept-decline", "BUG-13-item-claim-copy.png")
    await dest(page, "BUG-14", "no-conflicting-matches", "BUG-14-item-claim-copy.png")
  }

  await browser.close()
  console.log("done")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
