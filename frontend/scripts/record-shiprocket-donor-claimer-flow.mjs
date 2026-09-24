/**
 * Record donor + claimer + Shiprocket courier flow (screenshots + video).
 * Usage (from frontend/): node scripts/record-shiprocket-donor-claimer-flow.mjs
 * Requires: npm run dev on BASE_URL (default http://localhost:3000)
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "../recordings/shiprocket-donor-claimer-flow")
const BASE = process.env.BASE_URL || "http://localhost:3000"
const ENV_PATH = path.resolve(__dirname, "../../firebase-backend/functions/.env.reloved-digital")

fs.mkdirSync(OUT, { recursive: true })

function loadEnvFile(filePath) {
  const out = {}
  if (!fs.existsSync(filePath)) return out
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq < 1) continue
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
  }
  return out
}

const env = loadEnvFile(ENV_PATH)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || env.ADMIN_EMAIL || ""
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || env.ADMIN_PASSWORD || ""

const shots = []

async function titleCard(page, lines) {
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;font-family:system-ui,sans-serif;background:#F4F1EA;color:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px;box-sizing:border-box">
  <div style="max-width:720px;border:3px solid #111;background:#fff;padding:28px 32px;box-shadow:8px 8px 0 #111">
    ${lines.map((l, i) => `<p style="margin:${i ? "12px 0 0" : "0"};font-size:${i === 0 ? "28px" : "18px"};font-weight:${i === 0 ? 900 : 600};line-height:1.35">${l}</p>`).join("")}
  </div></body></html>`)
  await page.waitForTimeout(900)
}

async function shot(page, name, label) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  shots.push({ name, label })
  console.log(`✓ ${name} — ${label}`)
}

async function main() {
  console.log(`Recording → ${OUT}`)
  console.log(`Base URL: ${BASE}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)

  // --- Storyboard: flow overview ---
  await titleCard(page, [
    "Reloved — Donor + Claimer + Shiprocket",
    "End-to-end courier flow (demo recording)",
    "1–500 rides: Reloved prepaid · After 500: claimer COD at delivery",
  ])
  await shot(page, "00-flow-title", "Flow title card")

  await titleCard(page, [
    "Step map",
    "Donor drops item → Admin approves → Claimer claims → Donor accepts",
    "Then: Book Shiprocket (ops or Open Shiprocket) → Handed over → Received",
  ])
  await shot(page, "01-step-map", "Step map")

  // --- Public wall / give entry ---
  await page.goto(`${BASE}/drop`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2000)
  await shot(page, "02-wall", "Wall of Kindness — claimer browses free items")

  await page.goto(`${BASE}/give`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1500)
  await shot(page, "03-give-start", "Donor Give flow — start drop")

  // Handover options if we can reach them via login wall still useful
  await titleCard(page, [
    "Donor chooses courier handover",
    "“Use Borzo / arrange courier” = Shiprocket path in Reloved",
    "Building / gate only — ops phone 9653273812 on bookings",
  ])
  await shot(page, "04-handover-note", "Handover / privacy note")

  await titleCard(page, [
    "Claimer side",
    "Claim item → wait for donor Accept → save drop building (+ pincode)",
    "Then Open Shiprocket (self-pay) OR wait for Reloved ops to book",
  ])
  await shot(page, "05-claimer-note", "Claimer responsibilities")

  await page.goto(`${BASE}/account/login`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1200)
  await shot(page, "06-account-login", "Donor / claimer account login (OTP)")

  // --- Admin: Shiprocket booking UI ---
  await titleCard(page, [
    "Ops / Admin",
    "After match: Estimate fee → Book via Shiprocket API",
    "Or Open Shiprocket site (copy pickup + drop)",
  ])
  await shot(page, "07-ops-note", "Ops booking note")

  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(800)
    await page.fill('input[type="email"], input[name="email"]', ADMIN_EMAIL).catch(async () => {
      await page.locator("input").first().fill(ADMIN_EMAIL)
    })
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.getByRole("button", { name: /log in|sign in|login/i }).click()
    await page.waitForTimeout(2500)
    await shot(page, "08-admin-home", "Admin after login")

    await page.goto(`${BASE}/admin/item-requests`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2000)
    // Matched tab
    const matched = page.getByRole("button", { name: /^Matched$/i })
    if (await matched.count()) {
      await matched.click()
      await page.waitForTimeout(2000)
    }
    await shot(page, "09-admin-claims-matched", "Admin Claims → Matched")

    // Expand first card if needed / scroll to Shiprocket
    const shipBtn = page.getByRole("button", { name: /Shiprocket/i }).first()
    if (await shipBtn.count()) {
      await shipBtn.scrollIntoViewIfNeeded()
      await page.waitForTimeout(500)
      await shot(page, "10-admin-shiprocket-ctas", "Shiprocket CTAs: Open site / Estimate / Book API")
    } else {
      await shot(page, "10-admin-no-courier-claim", "No matched courier claim visible — CTAs appear on Use-Borzo handover claims")
    }

    // Status / subsidy copy on page
    await page.evaluate(() => window.scrollBy(0, 200))
    await page.waitForTimeout(400)
    await shot(page, "11-admin-claims-scroll", "Claims list with delivery stage actions")
  } else {
    await titleCard(page, [
      "Admin login skipped",
      "Set ADMIN_EMAIL / ADMIN_PASSWORD in functions .env to capture Shiprocket buttons live",
    ])
    await shot(page, "08-admin-skipped", "Admin skipped")
  }

  await titleCard(page, [
    "Who pays (automatic)",
    "Rides 1–500 → Reloved Prepaid (wallet)",
    "Rides 501+ → Claimer COD when delivery arrives",
  ])
  await shot(page, "12-who-pays", "Who pays card")

  await titleCard(page, [
    "Finish",
    "Donor: Handed over · Claimer: Received → Reloved ❤️",
    "Stages also: Notify rider dispatched → Mark picked up → Mark delivered",
  ])
  await shot(page, "13-finish", "Finish cards")

  const videoPath = await page.video()?.path()
  await context.close()
  await browser.close()

  // Rename video if present
  let finalVideo = null
  if (videoPath && fs.existsSync(videoPath)) {
    finalVideo = path.join(OUT, "shiprocket-donor-claimer-flow.webm")
    fs.renameSync(videoPath, finalVideo)
    console.log(`✓ video → ${finalVideo}`)
  }

  const index = `# Shiprocket — Donor + Claimer flow recording

**Captured:** ${new Date().toISOString().slice(0, 10)}  
**Base URL:** ${BASE}  
**Folder:** \`frontend/recordings/shiprocket-donor-claimer-flow/\`

${finalVideo ? `**Video:** \`shiprocket-donor-claimer-flow.webm\`\n` : ""}

## Flow (how it works)

\`\`\`
Donor Give (courier handover)
  → Admin approve item
  → Claimer claims
  → Donor Accepts
  → Book Shiprocket (ops API or Open Shiprocket)
       · 1–500: Reloved prepaid
       · 501+: claimer COD at delivery
  → Donor Handed over
  → Claimer Received
\`\`\`

## Screenshots

| File | What it shows |
|------|----------------|
${shots.map((s) => `| \`${s.name}.png\` | ${s.label} |`).join("\n")}

## Note on full live OTP E2E

Automated recording cannot complete real dual-account OTP (two phones).  
This pack shows the **UI + ops Shiprocket path**. For a live demo with two people, follow \`Docs/CLIENT_E2E_TEST_VIDEO_SCRIPT.md\` and use **Open Shiprocket** / Admin **Book via Shiprocket API** at the courier step.
`
  fs.writeFileSync(path.join(OUT, "INDEX.md"), index)
  console.log(`✓ INDEX.md (${shots.length} shots)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
