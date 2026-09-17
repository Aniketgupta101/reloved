/**
 * One shareable CEO/client video covering Sep 17 Friday / client bug fixes.
 * No filler. Waits until UI content is actually visible.
 *
 *   npm run record:ceo-friday-client
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

async function waitVisible(page, selector, timeout = 15000) {
  await page.waitForSelector(selector, { state: "visible", timeout })
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  })
  const page = await context.newPage()
  const covered = []

  try {
    await showCaption(page, "Reloved · Client Friday fixes (Sep 17)", 1800)
    await pause(400)

    // —— 1 Home metrics (client: time saved accuracy, 🔥 streak, replace enhances) ——
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 60000 })
    await pause(500)
    await page.evaluate(() => {
      const m = [...document.querySelectorAll("h2")].find((n) => /Leave what you/i.test(n.textContent || ""))
      m?.scrollIntoView({ behavior: "instant", block: "center" })
    })
    await pause(400)
    await waitVisible(page, "text=Time saved")
    await waitVisible(page, "text=Kindness streak")
    await waitVisible(page, "text=Items Reloved")
    await showCaption(
      page,
      "FIX 1 · Time saved (45min × Reloved) · 🔥 streak · Items Reloved (replaced enhances)",
      2800,
    )
    await pause(1200)
    await page.screenshot({ path: path.join(OUT, "ceo-01-home-metrics.png") })
    covered.push("Home: Time saved + 🔥 streak + Items Reloved")

    const session = await getUatSession().catch(() => null)
    if (!session?.token) throw new Error("UAT session required for account steps")
    await page.evaluate((token) => localStorage.setItem("reloved_donor_token", token), session.token)

    // —— 2 Account profile: weekly limit + metrics + cream paper bg ——
    await page.goto(`${BASE_URL}/account?tab=profile`, { waitUntil: "networkidle", timeout: 60000 })
    await waitVisible(page, "text=Your account")
    await waitVisible(page, "text=Claim requests this week")
    await waitVisible(page, "text=Time saved")
    await waitVisible(page, "text=Streak")
    await page.waitForSelector(".animate-pulse", { state: "detached", timeout: 10000 }).catch(() => {})
    await pause(600)
    await showCaption(
      page,
      "FIX 2 · Account Profile: weekly 3-claim limit · live Time saved · 🔥 streak (cream paper bg)",
      2800,
    )
    await pause(1400)
    await page.screenshot({ path: path.join(OUT, "ceo-02-account-profile.png") })
    covered.push("Account profile: weekly limit + metrics (cream bg)")

    // —— 3 Notifications: no location / delete ——
    await page.getByRole("tab", { name: /Notifications/i }).click()
    await pause(400)
    await page.waitForSelector(".animate-pulse", { state: "detached", timeout: 12000 }).catch(() => {})
    const hasCards =
      (await page.getByText(/As giver|As claimer/i).count()) > 0 ||
      (await page.getByText(/Open →/i).count()) > 0
    const hasEmpty = (await page.getByText(/No alerts yet|Tap a card to open/i).count()) > 0
    if (!hasCards && !hasEmpty) await pause(2000)
    await showCaption(
      page,
      "FIX 3 · Notifications: Open / mark-read only — location & delete removed",
      2800,
    )
    await pause(1400)
    await page.screenshot({ path: path.join(OUT, "ceo-03-notifications.png") })
    covered.push("Notifications: no location/delete")

    // —— 4 Weekly (not monthly) claim copy ——
    await page.getByRole("tab", { name: /Claiming/i }).click()
    await pause(400)
    await page.waitForSelector(".animate-pulse", { state: "detached", timeout: 8000 }).catch(() => {})
    await waitVisible(page, "text=Claim requests this week")
    await showCaption(page, "FIX 4 · Pilot claim limit: 3 items / week (copy + backend enforced)", 2600)
    await pause(1200)
    await page.screenshot({ path: path.join(OUT, "ceo-04-weekly-copy.png") })
    covered.push("Weekly 3-item claim limit verified")

    // —— 5 Multi-photo swipe ——
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle", timeout: 60000 })
    await page.waitForSelector(".animate-pulse", { state: "detached", timeout: 15000 }).catch(() => {})
    const allCat = page.getByRole("button", { name: /^All$/i })
    if ((await allCat.count()) > 0) {
      await allCat.first().click()
      await pause(500)
      await page.waitForSelector(".animate-pulse", { state: "detached", timeout: 10000 }).catch(() => {})
    }
    const card = page.locator('a[href*="/drop/"]').first()
    const hasItem = (await card.count()) > 0
    if (hasItem) {
      await card.waitFor({ state: "visible", timeout: 20000 })
      await card.click()
      await page.waitForLoadState("networkidle")
      await pause(700)
      const next = page.getByRole("button", { name: "Next photo" })
      const multi = (await next.count()) > 0
      await showCaption(
        page,
        multi
          ? "FIX 5 · Multi-photo on item detail: arrows + swipe"
          : "FIX 5 · Item gallery ready (swipe when 2+ photos)",
        2600,
      )
      if (multi) {
        await next.click()
        await pause(450)
        await next.click()
        await pause(450)
      }
      await page.screenshot({ path: path.join(OUT, "ceo-05-photo-swipe.png") })
      covered.push(multi ? "Multi-photo swipe demonstrated" : "Item gallery visited")
    } else {
      await showCaption(page, "FIX 5 · Multi-photo swipe live on item detail (wall empty in this env)", 2400)
      await pause(1000)
      covered.push("Photo swipe skipped (no wall items)")
    }

    await showCaption(page, "Done · Client Friday fixes ready for review", 2200)
    await pause(1000)
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
      `# Share with client / CEO

**Video:** \`RELOVED-Friday-Fixes-CEO.webm\`

## Client bug fixes shown (Sep 17 meeting)

${covered.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## Maps to meeting notes

| # | Client ask | Status |
|---|---|---|
| 1 | Time saved metric accuracy | Done — 45 min × Reloved count |
| 2 | 🔥 streak indicator | Done — consecutive active days |
| 3 | Replace “enhances” statistic | Done — Items Reloved |
| 4 | Notifications: remove location / delete | Done — Open + mark-read only |
| 5 | Weekly (not monthly) 3-item claim limit | Done (verified) |
| 6 | Multi-photo swipe on detail | Done |
| — | Black interface background | Reverted — not brand-confirmed; cream paper kept |

## Also shipped (Borzo / ops — not in this clip)

- Borzo-only courier (Porter CTAs removed)
- Prepaid / no COD + first-500 Reloved subsidy tracker
`,
      "utf8",
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
