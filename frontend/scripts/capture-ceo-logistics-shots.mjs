/**
 * Reach Give logistics (step 4) and capture CEO evidence shots.
 */
import { chromium } from "playwright"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, "..", "..", "Docs", "CEO-Bug-Evidence")
const BASE = process.env.UAT_BASE_URL || "https://reloved-digital.web.app"
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6aAAAAAElFTkSuQmCC",
  "base64",
)

async function shot(page, id, slug, name) {
  const dir = path.join(OUT, `${id}_${slug}`)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log("ok", path.relative(OUT, file))
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage()

  await page.route("**/api/donations/analyze-photos**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            ok: true,
            originalName: "tee.png",
            storagePath: "uploads/x.png",
            url: `${BASE}/og-default.png`,
            suggestion: {
              title: "CEO Evidence Tee",
              category: "Tops",
              condition: "Good",
              gender: "Men",
              size: "M",
              brand: "Reloved",
              description: "Evidence capture item for bug pack screenshots.",
              quantity: 1,
            },
          },
        ],
      }),
    }),
  )

  await page.goto(`${BASE}/give`, { waitUntil: "domcontentloaded", timeout: 90000 })
  await page.waitForTimeout(1200)
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "tee.png",
    mimeType: "image/png",
    buffer: PNG,
  })
  await page.waitForTimeout(600)
  await page.getByRole("button", { name: /continue/i }).first().click()
  await page.waitForTimeout(2500)

  // Step 2 — item details
  for (const label of [/^Tops$/i, /^Men$/i, /^Good$/i, /^M$/i]) {
    const btn = page.getByRole("button", { name: label }).first()
    if (await btn.count()) await btn.click().catch(() => {})
  }
  const title = page.locator('input:not([type="file"]):not([type="hidden"])').first()
  if (await title.count()) await title.fill("CEO Evidence Tee")
  const ta = page.locator("textarea").first()
  if (await ta.count()) await ta.fill("Evidence capture item for bug pack screenshots.")
  await page.waitForTimeout(400)
  let cont = page.getByRole("button", { name: /^continue$/i }).first()
  console.log("step2 disabled?", await cont.isDisabled().catch(() => null))
  if (!(await cont.isDisabled())) await cont.click()
  await page.waitForTimeout(1500)
  console.log("after2", (await page.locator("body").innerText()).slice(0, 350).replace(/\n/g, " | "))

  // Step 3 — donor details (if shown)
  const inputs = page.locator('input:not([type="file"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')
  for (let i = 0; i < (await inputs.count()); i++) {
    const el = inputs.nth(i)
    const t = (await el.getAttribute("type")) || ""
    const ph = `${(await el.getAttribute("placeholder")) || ""} ${(await el.getAttribute("name")) || ""} ${(await el.getAttribute("aria-label")) || ""}`.toLowerCase()
    if (/phone|tel|mobile/.test(ph) || t === "tel") await el.fill("9876501235")
    else if (/email/.test(ph) || t === "email") await el.fill("uat@example.com")
    else if (/first/.test(ph)) await el.fill("UAT")
    else if (/last/.test(ph)) await el.fill("Evidence")
    else if (!(await el.inputValue())) await el.fill("UAT Evidence")
  }
  cont = page.getByRole("button", { name: /^continue$/i }).first()
  if ((await cont.count()) && !(await cont.isDisabled().catch(() => true))) {
    await cont.click()
    await page.waitForTimeout(1500)
  }
  let body = await page.locator("body").innerText()
  console.log("after3", body.slice(0, 450).replace(/\n/g, " | "))

  if (!/3 km|building or landmark|Important privacy|Porter|I send|receiver collect|handover/i.test(body)) {
    cont = page.getByRole("button", { name: /^continue$/i }).first()
    if ((await cont.count()) && !(await cont.isDisabled().catch(() => true))) {
      await cont.click()
      await page.waitForTimeout(1500)
    }
    body = await page.locator("body").innerText()
    console.log("after4", body.slice(0, 450).replace(/\n/g, " | "))
  }

  await shot(page, "BUG-01", "pre-match-receiver-address", "BUG-01-give-logistics.png")
  await shot(page, "BUG-03", "privacy-warning", "BUG-03-privacy-notice.png")
  await shot(page, "BUG-04", "location-fallback", "BUG-04-location.png")
  await shot(page, "BUG-05", "3km-matching", "BUG-05-3km.png")
  await shot(page, "BUG-10", "donor-send-courier", "BUG-10-logistics.png")

  for (const t of [/I send/i, /Porter/i, /receiver collect/i]) {
    const b = page.getByText(t).first()
    if (await b.count()) {
      await b.click().catch(() => {})
      await page.waitForTimeout(500)
    }
  }
  await shot(page, "BUG-05", "3km-matching", "BUG-05-3km-selected.png")
  await shot(page, "BUG-11", "reloved-not-courier", "BUG-11-porter-copy.png")

  // Public item shots
  await page.goto(`${BASE}/drop`, { waitUntil: "networkidle", timeout: 90000 })
  const href = await page.locator('a[href*="/drop/"]').first().getAttribute("href")
  const slug = href?.match(/\/drop\/([^/?#]+)/)?.[1]
  if (slug) {
    await page.goto(`${BASE}/drop/${slug}`, { waitUntil: "networkidle", timeout: 90000 })
    await shot(page, "BUG-02", "public-area-only", "BUG-02-item-detail.png")
    await shot(page, "BUG-19", "pre-match-location-privacy", "BUG-19-item-detail.png")
    await shot(page, "BUG-13", "giver-accept-decline", "BUG-13-item-claim-copy.png")
    await shot(page, "BUG-14", "no-conflicting-matches", "BUG-14-item-claim-copy.png")
  }

  await browser.close()
  console.log("done")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
