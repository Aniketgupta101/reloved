/**
 * Mobile QA walkthrough for https://reloved-digital.web.app
 * Records a single video + screenshots + issue report.
 *
 * Run: node scripts/mobile-qa-record.mjs
 */
import { chromium, devices } from "playwright"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "..", "qa-artifacts", "mobile-" + Date.now())
const BASE = process.env.QA_BASE_URL || "https://reloved-digital.web.app"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"

const PUBLIC_PAGES = [
  { name: "Home", path: "/" },
  { name: "Wall / Drop", path: "/drop" },
  { name: "Give", path: "/give" },
  { name: "Track", path: "/track" },
  { name: "Love", path: "/love" },
  { name: "Map", path: "/map" },
  { name: "About", path: "/about" },
  { name: "Standards", path: "/standards" },
  { name: "FAQ", path: "/faq" },
  { name: "Privacy", path: "/privacy" },
  { name: "Terms", path: "/terms" },
  { name: "Contact", path: "/contact" },
  { name: "Partner", path: "/partner" },
  { name: "Account login", path: "/account/login" },
  { name: "Partner login", path: "/partner/login" },
  { name: "Admin login", path: "/admin/login" },
]

fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true })

const issues = []
const log = []

function note(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  log.push(line)
}

function addIssue(sev, page, detail) {
  issues.push({ severity: sev, page, detail })
  note(`ISSUE (${sev}) [${page}] ${detail}`)
}

async function checkHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const scrollW = Math.max(doc.scrollWidth, body.scrollWidth)
    const clientW = doc.clientWidth
    if (scrollW <= clientW + 2) return null
    const offenders = []
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect()
      if (r.width > clientW + 8 && r.right > clientW + 4) {
        const tag = el.tagName.toLowerCase()
        const cls = (el.className && typeof el.className === "string" ? el.className : "").slice(0, 80)
        offenders.push(`${tag}.${cls} w=${Math.round(r.width)} right=${Math.round(r.right)}`)
        if (offenders.length >= 5) break
      }
    }
    return { scrollW, clientW, offenders }
  })
  if (overflow) {
    addIssue(
      "high",
      label,
      `Horizontal overflow: scrollWidth=${overflow.scrollW} clientWidth=${overflow.clientW}; e.g. ${overflow.offenders.join(" | ") || "n/a"}`
    )
  }
}

async function safeGoto(page, url, label) {
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForTimeout(900)
  const status = res?.status() ?? 0
  if (status >= 400) addIssue("high", label, `HTTP ${status} for ${url}`)
  return status
}

async function shot(page, name) {
  const file = path.join(OUT, "shots", `${name.replace(/[^\w.-]+/g, "_")}.png`)
  await page.screenshot({ path: file, fullPage: false })
  return file
}

async function openMobileNav(page) {
  const btn = page.getByRole("button", { name: /toggle navigation/i })
  if (await btn.count()) {
    await btn.click({ timeout: 3000 })
    await page.waitForTimeout(500)
    return true
  }
  return false
}

const iPhone = devices["iPhone 13"]

// Prefer installed Chrome (avoids ms-playwright Chromium EPERM on some Windows setups).
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
})
const context = await browser.newContext({
  ...iPhone,
  recordVideo: { dir: path.join(OUT, "video"), size: { width: 390, height: 844 } },
  locale: "en-IN",
})

const page = await context.newPage()
page.on("pageerror", (err) => addIssue("high", "runtime", err.message))
page.on("console", (msg) => {
  if (msg.type() === "error") addIssue("medium", "console", msg.text().slice(0, 240))
})

try {
  note(`Starting mobile QA against ${BASE}`)
  note(`Artifacts → ${OUT}`)

  // --- Public pages crawl ---
  for (const p of PUBLIC_PAGES) {
    note(`Visit ${p.name} (${p.path})`)
    await safeGoto(page, BASE + p.path, p.name)
    await shot(page, `01-${p.name}`)
    await checkHorizontalOverflow(page, p.name)
    // Light scroll to exercise sticky/layout
    await page.evaluate(() => window.scrollBy(0, 600))
    await page.waitForTimeout(400)
    await page.evaluate(() => window.scrollBy(0, 800))
    await page.waitForTimeout(400)
  }

  // --- Home: mobile nav + CTAs ---
  note("Flow: Home nav / CTAs")
  await safeGoto(page, BASE + "/", "Home flow")
  const navOpened = await openMobileNav(page)
  note(`Mobile nav open attempt: ${navOpened}`)
  await shot(page, "02-home-nav")
  // Try primary CTAs if visible
  for (const label of ["Give", "Take", "Wall", "Drop", "Account"]) {
    const link = page.getByRole("link", { name: new RegExp(label, "i") }).first()
    if (await link.count()) {
      await link.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(800)
      await shot(page, `03-cta-${label}`)
      await checkHorizontalOverflow(page, `CTA ${label}`)
      break
    }
  }

  // --- Wall → first item detail ---
  note("Flow: Wall → Item detail")
  await safeGoto(page, BASE + "/drop", "Wall flow")
  await page.waitForTimeout(1500)
  const itemLink = page.locator('a[href*="/drop/"], a[href*="/wall/"]').first()
  if (await itemLink.count()) {
    await itemLink.click()
    await page.waitForTimeout(1200)
    await shot(page, "04-item-detail")
    await checkHorizontalOverflow(page, "Item detail")
    // Claim / Take CTA if present
    const claim = page.getByRole("button", { name: /claim|take|request/i }).first()
    if (await claim.count()) {
      await claim.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(1000)
      await shot(page, "05-claim-step")
      await checkHorizontalOverflow(page, "Claim step")
    }
  } else {
    addIssue("medium", "Wall", "No item links found on /drop")
  }

  // --- Give form (first screen only — don't submit spam) ---
  note("Flow: Give form UI")
  await safeGoto(page, BASE + "/give", "Give flow")
  await page.waitForTimeout(1000)
  await shot(page, "06-give")
  await checkHorizontalOverflow(page, "Give")
  // Fill a couple fields if present
  const nameInput = page.locator('input[name*="name" i], input[placeholder*="name" i]').first()
  if (await nameInput.count()) {
    await nameInput.fill("QA Mobile Tester").catch(() => {})
  }

  // --- Contact form UI ---
  note("Flow: Contact form UI")
  await safeGoto(page, BASE + "/contact", "Contact flow")
  await shot(page, "07-contact")
  await checkHorizontalOverflow(page, "Contact")

  // --- Account login: email tab ---
  note("Flow: Account login (email tab)")
  await safeGoto(page, BASE + "/account/login", "Account login")
  await shot(page, "08-account-login")
  const emailTab = page.getByRole("button", { name: /email/i }).first()
  if (await emailTab.count()) await emailTab.click().catch(() => {})
  await page.waitForTimeout(300)
  await checkHorizontalOverflow(page, "Account login")

  // --- Phone tab ---
  const phoneTab = page.getByRole("button", { name: /phone/i }).first()
  if (await phoneTab.count()) {
    await phoneTab.click().catch(() => {})
    await page.waitForTimeout(400)
    await shot(page, "09-account-phone")
  }

  // --- Admin login + dashboard ---
  note("Flow: Admin login")
  await safeGoto(page, BASE + "/admin/login", "Admin login")
  await shot(page, "10-admin-login")
  await checkHorizontalOverflow(page, "Admin login")
  const emailField = page.locator('input[type="email"], input[name*="email" i]').first()
  const passField = page.locator('input[type="password"]').first()
  if ((await emailField.count()) && (await passField.count())) {
    await emailField.fill(ADMIN_EMAIL)
    await passField.fill(ADMIN_PASSWORD)
    const submit = page.getByRole("button", { name: /sign in|log in|login/i }).first()
    if (await submit.count()) {
      await submit.click()
      await page.waitForTimeout(2000)
      await shot(page, "11-admin-dashboard")
      await checkHorizontalOverflow(page, "Admin dashboard")
      // Visit admin subpages
      for (const sub of [
        "/admin/donations",
        "/admin/items",
        "/admin/item-requests",
        "/admin/messages",
        "/admin/partners",
        "/admin/bulk-upload",
      ]) {
        note(`Admin subpage ${sub}`)
        await safeGoto(page, BASE + sub, `Admin ${sub}`)
        await shot(page, `12-admin-${sub.replace(/\W+/g, "_")}`)
        await checkHorizontalOverflow(page, `Admin ${sub}`)
      }
    } else {
      addIssue("medium", "Admin login", "Submit button not found")
    }
  } else {
    addIssue("high", "Admin login", "Email/password fields not found")
  }

  // --- 404 ---
  note("Flow: 404")
  await safeGoto(page, BASE + "/this-page-does-not-exist-qa", "404")
  await shot(page, "13-404")
  await checkHorizontalOverflow(page, "404")

  note("Crawl complete")
} catch (err) {
  addIssue("critical", "runner", String(err?.stack || err))
} finally {
  await page.close()
  await context.close()
  await browser.close()
}

// Move/rename video to a single file
const videoDir = path.join(OUT, "video")
let videoPath = null
if (fs.existsSync(videoDir)) {
  const vids = fs.readdirSync(videoDir).filter((f) => f.endsWith(".webm"))
  if (vids.length) {
    videoPath = path.join(OUT, "mobile-qa-walkthrough.webm")
    fs.renameSync(path.join(videoDir, vids[0]), videoPath)
  }
}

const report = {
  base: BASE,
  viewport: "iPhone 13 (390x844)",
  artifactDir: OUT,
  video: videoPath,
  issueCount: issues.length,
  issues,
  log,
}
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2))
fs.writeFileSync(
  path.join(OUT, "FIXES_AND_FINDINGS.md"),
  [
    `# Mobile QA findings`,
    ``,
    `- Base: ${BASE}`,
    `- Viewport: iPhone 13 (390×844)`,
    `- Video: ${videoPath || "(none)"}`,
    `- Issues: ${issues.length}`,
    ``,
    `## Issues`,
    ...(issues.length
      ? issues.map((i, n) => `${n + 1}. **[${i.severity}] ${i.page}** — ${i.detail}`)
      : ["(none detected by automated checks)"]),
    ``,
  ].join("\n")
)

console.log("\n=== SUMMARY ===")
console.log(`Video: ${videoPath}`)
console.log(`Issues: ${issues.length}`)
console.log(`Report: ${path.join(OUT, "FIXES_AND_FINDINGS.md")}`)
