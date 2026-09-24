import { chromium } from "playwright"
import fs from "fs"
import path from "path"
import os from "os"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "../recordings/same-item-fix-verify")
fs.mkdirSync(OUT, { recursive: true })
const token = fs.readFileSync(path.join(os.tmpdir(), "totem-donor-token.txt"), "utf8").trim()
const BASE = "https://reloved-digital.web.app"

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" })
await page.evaluate((t) => localStorage.setItem("reloved_donor_token", t), token)
await page.goto(`${BASE}/account?tab=giving`, { waitUntil: "domcontentloaded" })
await page.waitForSelector("text=Your giving history", { timeout: 30000 })
await page.waitForTimeout(2500)

const openLinks = page.locator('a:has-text("Open")')
const n = await openLinks.count()
console.log("open buttons", n)

const titles = []
for (let i = 0; i < Math.min(n, 3); i++) {
  await page.goto(`${BASE}/account?tab=giving`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("text=Your giving history", { timeout: 20000 })
  await page.waitForTimeout(1500)
  await page.getByText("Your giving history").scrollIntoViewIfNeeded()
  const href = await page.locator('a:has-text("Open")').nth(i).getAttribute("href")
  const cardTitle = await page
    .locator("a.text-xs.font-bold")
    .nth(i)
    .innerText()
    .catch(() => "?")
  await page.locator('a:has-text("Open")').nth(i).click()
  await page.waitForTimeout(2500)
  const url = page.url()
  const detailTitle = await page
    .locator("h1, h2, .font-display")
    .filter({ hasText: /./ })
    .first()
    .innerText()
    .catch(() => "")
  titles.push({ i, cardTitle, href, url, detailTitle: String(detailTitle).slice(0, 100) })
  await page.screenshot({ path: path.join(OUT, `open-${i}.png`), fullPage: false })
}

console.log(JSON.stringify(titles, null, 2))
const itemParams = titles.map((t) => {
  try {
    return new URL(t.url).searchParams.get("item")
  } catch {
    return null
  }
})
console.log("item params", itemParams)
console.log("distinct items", new Set(itemParams.filter(Boolean)).size)
await browser.close()
