/**
 * Capture CEO-ready evidence for BUG-01..BUG-24.
 * Run: node scripts/capture-ceo-bug-evidence.mjs
 * Output: Docs/CEO-Bug-Evidence/
 */
import { chromium } from "playwright"
import { mkdir, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getUatSession, UAT_TEST_USER } from "./setup-uat-test-user.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..", "..")
const OUT = path.join(ROOT, "Docs", "CEO-Bug-Evidence")
const BASE = process.env.UAT_BASE_URL || "https://reloved-digital.web.app"
const API = process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"

/** @typedef {"DONE"|"MOSTLY"|"BLOCKED"|"OPEN"} Status */

/** @type {Array<{id:string,slug:string,area:string,issue:string,fix:string,status:Status,note:string,capture:string}>} */
const BUGS = [
  {
    id: "BUG-01",
    slug: "pre-match-receiver-address",
    area: "Claim",
    issue: "Receiver/delivery building requested before a receiver exists",
    fix: "Remove pre-match receiver address; collect area only until match",
    status: "DONE",
    note: "Give form collects giver logistics + building/landmark only — no claimer delivery address pre-match.",
    capture: "give-logistics",
  },
  {
    id: "BUG-02",
    slug: "public-area-only",
    area: "Privacy",
    issue: "Exact building/flat/wing can appear on public listings",
    fix: "Public listings show area/neighbourhood only",
    status: "MOSTLY",
    note: "Item detail shows locality; no phone. Final wall audit still recommended.",
    capture: "drop-item",
  },
  {
    id: "BUG-03",
    slug: "privacy-warning",
    area: "Privacy",
    issue: "Privacy warning missing/inconsistent on address entry",
    fix: "Warn on every address entry + final confirmation",
    status: "MOSTLY",
    note: "PrivacyBuildingNotice + flat/wing live validator on Give/Claim/onboarding.",
    capture: "give-privacy",
  },
  {
    id: "BUG-04",
    slug: "location-fallback",
    area: "Location",
    issue: "Denied/unavailable browser location not handled",
    fix: "Manual area/location fallback",
    status: "MOSTLY",
    note: "Manual building/landmark search exists when GPS denied. Mobile deny-path still to screenshot.",
    capture: "give-location",
  },
  {
    id: "BUG-05",
    slug: "3km-matching",
    area: "Matching",
    issue: "3 km matching not implemented/verified",
    fix: "Apply 3 km for donor-send without exposing exact address",
    status: "MOSTLY",
    note: "UI + copy for 3 km on giver_sends path live. Needs Mumbai distance proof.",
    capture: "give-3km",
  },
  {
    id: "BUG-06",
    slug: "empty-3km-fallback",
    area: "Matching",
    issue: "Empty 3 km radius behaviour undefined",
    fix: "Explicit fallback after product decision — do not silently fail",
    status: "BLOCKED",
    note: "Needs Sheetal/Aakash lock: hard exclude vs ranking + fallback copy.",
    capture: "status-card",
  },
  {
    id: "BUG-07",
    slug: "call-masking",
    area: "Call Privacy",
    issue: "Donor/receiver phones can be exposed",
    fix: "Call masking / telephony relay",
    status: "BLOCKED",
    note: "Edesy configured in backend. Live phone dry-run not completed — do not mark Done.",
    capture: "status-card",
  },
  {
    id: "BUG-08",
    slug: "phone-or-email-verify",
    area: "Verification",
    issue: "Phone verification treated as compulsory",
    fix: "Phone OR email; at least one verified channel",
    status: "DONE",
    note: "Login offers phone and email OTP paths.",
    capture: "login",
  },
  {
    id: "BUG-09",
    slug: "receiver-collect-lifecycle",
    area: "Handover",
    issue: "Receiver-collect cannot complete full lifecycle",
    fix: "Matched → Handover → Handed Over → Received → RELOVED",
    status: "MOSTLY",
    note: "States + FAQ document full path. Needs one evidence recording.",
    capture: "faq-handover",
  },
  {
    id: "BUG-10",
    slug: "donor-send-courier",
    area: "Handover",
    issue: "Donor-send own-driver/courier incomplete",
    fix: "Support personal driver + third-party courier after match",
    status: "MOSTLY",
    note: "giver_sends + porter_arranged options live. Who-pays still open policy.",
    capture: "give-logistics",
  },
  {
    id: "BUG-11",
    slug: "reloved-not-courier",
    area: "Courier",
    issue: "UI implies Reloved fulfils courier",
    fix: "External Porter/Borzo wording — no ‘through Reloved’",
    status: "DONE",
    note: "Live label: Use Porter / Borzo (external courier). FAQ + Terms updated (04f4736).",
    capture: "faq-courier",
  },
  {
    id: "BUG-12",
    slug: "premature-borzo-cta",
    area: "Courier CTA",
    issue: "Book Borzo CTA at wrong stage",
    fix: "Show only after match + correct handover mode",
    status: "MOSTLY",
    note: "CTA gated in profile code. Re-verify once on matched gift page.",
    capture: "account-if-possible",
  },
  {
    id: "BUG-13",
    slug: "giver-accept-decline",
    area: "Claim Lifecycle",
    issue: "No proper giver Accept/Decline flow",
    fix: "Notify giver → Accept/Decline → notify claimer → update state",
    status: "DONE",
    note: "Item detail + FAQ + GiveSuccess all describe Accept/Decline by giver.",
    capture: "item-claim-copy",
  },
  {
    id: "BUG-14",
    slug: "no-conflicting-matches",
    area: "Claim Lifecycle",
    issue: "Duplicate claims may create conflicting matches",
    fix: "Only one accepted claimer becomes matched receiver",
    status: "DONE",
    note: "Accept path holds item while deciding; one Accept wins.",
    capture: "item-claim-copy",
  },
  {
    id: "BUG-15",
    slug: "handed-over-received-reloved",
    area: "Lifecycle",
    issue: "Handed Over → Received → RELOVED inconsistent",
    fix: "Persist completion states everywhere",
    status: "MOSTLY",
    note: "States in product + FAQ. Needs end-to-end evidence pass.",
    capture: "faq-handover",
  },
  {
    id: "BUG-16",
    slug: "core-notifications",
    area: "Notifications",
    issue: "Core transaction notifications missing/incomplete",
    fix: "Claim, accept/decline, matched, delivery, handed over, received",
    status: "MOSTLY",
    note: "In-app userNotifications + Brevo templates wired.",
    capture: "account-notifications",
  },
  {
    id: "BUG-17",
    slug: "notification-dedupe",
    area: "Notifications",
    issue: "Duplicate/missing notifications on state change",
    fix: "Exactly one notification per transition; expose failures to admin",
    status: "MOSTLY",
    note: "Designed one-per-transition; admin failure visibility to confirm.",
    capture: "account-notifications",
  },
  {
    id: "BUG-18",
    slug: "palette-cleanup",
    area: "Public UI",
    issue: "Stray blue/yellow on public pages",
    fix: "Approved Reloved palette",
    status: "MOSTLY",
    note: "Hero/CTAs on Reloved palette. Final visual sweep before launch.",
    capture: "home",
  },
  {
    id: "BUG-19",
    slug: "pre-match-location-privacy",
    area: "Privacy",
    issue: "Exact pickup/drop visible before matching",
    fix: "Keep exact location private until Accept",
    status: "MOSTLY",
    note: "Public item shows locality only; claim copy says details after Accept.",
    capture: "drop-item",
  },
  {
    id: "BUG-20",
    slug: "courier-data-minimisation",
    area: "Courier Privacy",
    issue: "Courier may expose more data than intended",
    fix: "Pass only required data; verify provider visibility",
    status: "OPEN",
    note: "Borzo matter uses gate-only copy. Provider-side audit still needed.",
    capture: "status-card",
  },
  {
    id: "BUG-21",
    slug: "profile-state-sync",
    area: "Profile State",
    issue: "Profile/item status inconsistent after Drop/Claim",
    fix: "Audit sync across profile, listing, admin",
    status: "MOSTLY",
    note: "Statuses shared via Firestore; needs matrix QA screenshot.",
    capture: "account-if-possible",
  },
  {
    id: "BUG-22",
    slug: "reloved-removed-from-wall",
    area: "Completion",
    issue: "RELOVED items may stay claimable",
    fix: "Remove RELOVED from active public inventory",
    status: "MOSTLY",
    note: "Wall filters active inventory; confirm RELOVED not on /drop.",
    capture: "drop-wall",
  },
  {
    id: "BUG-23",
    slug: "mobile-p0-qa",
    area: "Mobile",
    issue: "P0 flows may fail on mobile",
    fix: "Full Drop→Claim→Match→Handover→Received on mobile",
    status: "OPEN",
    note: "Mobile viewport smoke captured; full lifecycle recording pending.",
    capture: "mobile-home",
  },
  {
    id: "BUG-24",
    slug: "desktop-p0-qa",
    area: "Desktop",
    issue: "P0 flows may have desktop-specific issues",
    fix: "Full launch flow on desktop",
    status: "OPEN",
    note: "Desktop smoke captured across key public pages; full lifecycle recording pending.",
    capture: "home",
  },
]

const tone = {
  DONE: "#166534",
  MOSTLY: "#1d4ed8",
  BLOCKED: "#b91c1c",
  OPEN: "#a16207",
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

async function writeStatus(dir, bug) {
  const md = `# ${bug.id} — ${bug.slug}

**Area:** ${bug.area}  
**Priority:** P0  
**Status:** ${bug.status}

## Bug / Issue
${bug.issue}

## Expected Fix
${bug.fix}

## Engineering note (15 Sep 2026)
${bug.note}

## Live
- Wall: ${BASE}
- Waitlist: https://reloved.digital
`
  await writeFile(path.join(dir, "STATUS.md"), md, "utf8")
}

async function shot(page, file, opts = {}) {
  await page.screenshot({ path: file, fullPage: !!opts.fullPage })
}

async function loginIfPossible(page, context) {
  try {
    const { token } = await getUatSession()
    await page.goto(`${BASE}/account/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
    // Prefer injecting session if app stores bearer in localStorage
    await page.evaluate(
      ({ token, user }) => {
        try {
          localStorage.setItem("reloved_donor_token", token)
          localStorage.setItem("reloved_token", token)
          localStorage.setItem("donorToken", token)
          localStorage.setItem("token", token)
          sessionStorage.setItem("reloved_donor_token", token)
        } catch {}
        window.__UAT__ = { token, user }
      },
      { token, user: UAT_TEST_USER },
    )
    // API OTP path for UI login
    const req = await fetch(`${API}/api/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "sms", target: UAT_TEST_USER.phone }),
    })
    const body = await req.json().catch(() => ({}))
    if (body.devCode) {
      await page.goto(`${BASE}/account/login`, { waitUntil: "networkidle", timeout: 60000 })
      const phoneInput = page.locator('input[type="tel"], input[name="phone"], input[placeholder*="phone" i], input[placeholder*="mobile" i]').first()
      if (await phoneInput.count()) {
        await phoneInput.fill(UAT_TEST_USER.phone)
        const send = page.getByRole("button", { name: /send|otp|continue|verify/i }).first()
        if (await send.count()) await send.click().catch(() => {})
        await page.waitForTimeout(800)
        const codeInput = page.locator('input[name="code"], input[placeholder*="code" i], input[autocomplete="one-time-code"]').first()
        if (await codeInput.count()) {
          await codeInput.fill(String(body.devCode))
          const verify = page.getByRole("button", { name: /verify|continue|log ?in|submit/i }).first()
          if (await verify.count()) await verify.click().catch(() => {})
          await page.waitForTimeout(1500)
        }
      }
    }
    await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded", timeout: 60000 })
    return true
  } catch (err) {
    console.warn("UAT login skipped:", err.message)
    return false
  }
}

async function captureStatusCard(page, dir, bug) {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
  body{font-family:Georgia,serif;margin:0;padding:40px;background:#f7f3eb;color:#1a1a1a}
  .card{max-width:720px;margin:0 auto;background:#fff;border:1px solid #d6cfc0;padding:28px}
  .id{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#666}
  h1{font-size:28px;margin:8px 0 4px}
  .meta{font-size:14px;color:#444;margin-bottom:18px}
  .badge{display:inline-block;padding:6px 12px;border-radius:999px;color:#fff;font-weight:700;font-size:13px;background:${tone[bug.status]}}
  .box{margin-top:18px;padding:14px;background:#faf7f1;border:1px solid #e7e0d2}
  .label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#777;margin-bottom:6px}
  p{line-height:1.45;margin:0}
  </style></head><body><div class="card">
  <div class="id">${bug.id} · ${bug.area} · P0</div>
  <h1>${bug.slug.replace(/-/g, " ")}</h1>
  <div class="meta"><span class="badge">${bug.status}</span></div>
  <div class="box"><div class="label">Bug / Issue</div><p>${bug.issue}</p></div>
  <div class="box"><div class="label">Expected Fix</div><p>${bug.fix}</p></div>
  <div class="box"><div class="label">Engineering note</div><p>${bug.note}</p></div>
  </div></body></html>`
  const tmp = path.join(dir, "_card.html")
  await writeFile(tmp, html, "utf8")
  await page.goto(`file://${tmp.replace(/\\/g, "/")}`, { waitUntil: "domcontentloaded" })
  await shot(page, path.join(dir, `${bug.id}-status-card.png`))
}

async function firstLiveItemSlug(page) {
  await page.goto(`${BASE}/drop`, { waitUntil: "networkidle", timeout: 90000 })
  const href = await page.locator('a[href*="/drop/"]').first().getAttribute("href").catch(() => null)
  if (!href) return null
  const m = href.match(/\/drop\/([^/?#]+)/)
  return m ? m[1] : null
}

async function main() {
  await ensureDir(OUT)
  const browser = await chromium.launch({ headless: true })
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  })
  const page = await desktop.newPage()
  const mpage = await mobile.newPage()

  const loggedIn = await loginIfPossible(page, desktop)
  const slug = await firstLiveItemSlug(page)

  for (const bug of BUGS) {
    const dir = path.join(OUT, `${bug.id}_${bug.slug}`)
    await ensureDir(dir)
    await writeStatus(dir, bug)
    console.log(`→ ${bug.id} (${bug.status})`)

    try {
      if (bug.capture === "status-card") {
        await captureStatusCard(page, dir, bug)
      }

      if (bug.capture === "home" || bug.id === "BUG-18" || bug.id === "BUG-24") {
        await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 })
        await shot(page, path.join(dir, `${bug.id}-home-desktop.png`))
      }

      if (bug.capture === "mobile-home" || bug.id === "BUG-23") {
        await mpage.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 })
        await shot(mpage, path.join(dir, `${bug.id}-home-mobile.png`))
        await mpage.goto(`${BASE}/drop`, { waitUntil: "networkidle", timeout: 90000 })
        await shot(mpage, path.join(dir, `${bug.id}-drop-mobile.png`))
      }

      if (bug.capture === "drop-wall" || bug.capture === "drop-item") {
        await page.goto(`${BASE}/drop`, { waitUntil: "networkidle", timeout: 90000 })
        await shot(page, path.join(dir, `${bug.id}-wall.png`))
        if (slug) {
          await page.goto(`${BASE}/drop/${slug}`, { waitUntil: "networkidle", timeout: 90000 })
          await shot(page, path.join(dir, `${bug.id}-item-detail.png`), { fullPage: true })
        }
      }

      if (bug.capture === "item-claim-copy" && slug) {
        await page.goto(`${BASE}/drop/${slug}`, { waitUntil: "networkidle", timeout: 90000 })
        await shot(page, path.join(dir, `${bug.id}-item-claim-copy.png`), { fullPage: true })
      }

      if (["give-logistics", "give-privacy", "give-location", "give-3km"].includes(bug.capture)) {
        await page.goto(`${BASE}/give`, { waitUntil: "networkidle", timeout: 90000 })
        await shot(page, path.join(dir, `${bug.id}-give-step1.png`))
        // Try advance through steps if Continue available without photo (may stay on step 1)
        const bodyText = await page.content()
        // Highlight 3km / porter / privacy by scrolling FAQ fallback if give gated
        if (bug.capture === "give-3km" || bug.capture === "give-logistics") {
          await page.goto(`${BASE}/faq`, { waitUntil: "networkidle", timeout: 90000 })
          await page.getByText(/3 km|Porter|Borzo|handover|Accept or Decline/i).first().scrollIntoViewIfNeeded().catch(() => {})
          await shot(page, path.join(dir, `${bug.id}-faq-support.png`), { fullPage: true })
        }
        if (bug.capture === "give-privacy") {
          await page.goto(`${BASE}/give`, { waitUntil: "domcontentloaded", timeout: 90000 })
          // Also capture PrivacyBuildingNotice via onboarding if reachable
          await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {})
          const hit = await page.getByText(/important privacy rule/i).count()
          if (hit) {
            await page.getByText(/important privacy rule/i).first().scrollIntoViewIfNeeded()
            await shot(page, path.join(dir, `${bug.id}-privacy-notice.png`))
          } else {
            await captureStatusCard(page, dir, bug)
          }
        }
        void bodyText
      }

      if (bug.capture === "login") {
        await page.goto(`${BASE}/account/login`, { waitUntil: "networkidle", timeout: 90000 })
        await shot(page, path.join(dir, `${bug.id}-login.png`))
        // Try email channel toggle if present
        const emailTab = page.getByRole("button", { name: /email/i }).first()
        if (await emailTab.count()) {
          await emailTab.click().catch(() => {})
          await page.waitForTimeout(400)
          await shot(page, path.join(dir, `${bug.id}-login-email.png`))
        }
      }

      if (bug.capture === "faq-handover" || bug.capture === "faq-courier") {
        await page.goto(`${BASE}/faq`, { waitUntil: "networkidle", timeout: 90000 })
        if (bug.capture === "faq-courier") {
          await page.getByText(/Porter|Borzo|courier|does not|external/i).first().scrollIntoViewIfNeeded().catch(() => {})
        } else {
          await page.getByText(/Accept or Decline|Handed over|RELOVED|Who approves/i).first().scrollIntoViewIfNeeded().catch(() => {})
        }
        await shot(page, path.join(dir, `${bug.id}-faq.png`), { fullPage: true })
      }

      if ((bug.capture === "account-if-possible" || bug.capture === "account-notifications") && loggedIn) {
        await page.goto(`${BASE}/account`, { waitUntil: "networkidle", timeout: 90000 })
        await shot(page, path.join(dir, `${bug.id}-account.png`), { fullPage: true })
        if (bug.capture === "account-notifications") {
          await page.goto(`${BASE}/account?tab=notifications`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {})
          await shot(page, path.join(dir, `${bug.id}-notifications.png`), { fullPage: true })
        }
      } else if (bug.capture === "account-if-possible" || bug.capture === "account-notifications") {
        await captureStatusCard(page, dir, bug)
      }

      // Always ensure at least one PNG exists
      const { readdir } = await import("node:fs/promises")
      const files = await readdir(dir)
      if (!files.some((f) => f.endsWith(".png"))) {
        await captureStatusCard(page, dir, bug)
      }
    } catch (err) {
      console.warn(`  ! ${bug.id} capture error:`, err.message)
      await captureStatusCard(page, dir, bug).catch(() => {})
    }
  }

  // CEO index
  const counts = BUGS.reduce((a, b) => {
    a[b.status] = (a[b.status] || 0) + 1
    return a
  }, {})
  const rows = BUGS.map(
    (b) => `<tr>
      <td><strong>${b.id}</strong></td>
      <td>${b.area}</td>
      <td>${b.issue}</td>
      <td><span class="badge" style="background:${tone[b.status]}">${b.status}</span></td>
      <td>${b.note}</td>
      <td><a href="./${b.id}_${b.slug}/">Open folder</a></td>
    </tr>`,
  ).join("\n")

  const indexHtml = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>RELOVED CEO Bug Evidence — 15 Sep 2026</title>
<style>
  body{font-family:Inter,Segoe UI,system-ui,sans-serif;margin:0;background:#f4f1ea;color:#111;padding:28px}
  h1{font-family:Georgia,serif;font-size:34px;margin:0 0 6px}
  .sub{color:#555;margin-bottom:18px}
  .stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
  .stat{background:#fff;border:1px solid #ddd2bf;padding:12px 16px;min-width:110px}
  .stat b{display:block;font-size:24px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #ddd2bf;font-size:13px}
  th,td{border-bottom:1px solid #eee5d6;padding:10px 8px;vertical-align:top;text-align:left}
  th{background:#1f3d2a;color:#fff;font-size:12px;letter-spacing:.04em}
  .badge{color:#fff;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700}
  .callout{background:#fff1f1;border:1px solid #f0c2c2;padding:14px;margin:16px 0}
</style></head><body>
  <h1>RELOVED — CEO Bug Evidence Pack</h1>
  <div class="sub">Prepared 15 Sep 2026 · Live: ${BASE} · Folder: Docs/CEO-Bug-Evidence</div>
  <div class="stats">
    <div class="stat"><b>${counts.DONE || 0}</b>DONE</div>
    <div class="stat"><b>${counts.MOSTLY || 0}</b>MOSTLY</div>
    <div class="stat"><b>${counts.BLOCKED || 0}</b>BLOCKED</div>
    <div class="stat"><b>${counts.OPEN || 0}</b>OPEN</div>
  </div>
  <div class="callout"><strong>CEO decisions still required:</strong>
    BUG-06 empty 3 km fallback · BUG-07 live call-masking phone test · courier who-pays policy
  </div>
  <table>
    <thead><tr><th>ID</th><th>Area</th><th>Bug / Issue</th><th>Status</th><th>Note</th><th>Evidence</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`

  await writeFile(path.join(OUT, "INDEX.html"), indexHtml, "utf8")
  await writeFile(
    path.join(OUT, "README.md"),
    `# CEO Bug Evidence Pack (15 Sep 2026)

Open **INDEX.html** in a browser, then screenshot the table for WhatsApp/email.

Each folder is named \`BUG-XX_slug/\` and contains:
- \`STATUS.md\` — bug text + engineering status
- \`*.png\` — live UI screenshot or status card

## Summary
- DONE: ${counts.DONE || 0}
- MOSTLY: ${counts.MOSTLY || 0}
- BLOCKED: ${counts.BLOCKED || 0}
- OPEN: ${counts.OPEN || 0}

## Blockers for CEO
1. BUG-06 — empty 3 km radius fallback
2. BUG-07 — call masking live phone dry-run
3. Courier booking/payer ownership
`,
    "utf8",
  )

  // Screenshot the index itself for easy share
  await page.setViewportSize({ width: 1400, height: 1800 })
  await page.goto(`file://${path.join(OUT, "INDEX.html").replace(/\\/g, "/")}`, { waitUntil: "domcontentloaded" })
  await shot(page, path.join(OUT, "00-CEO-SUMMARY-TABLE.png"), { fullPage: true })

  await browser.close()
  console.log(`\nDone → ${OUT}`)
  console.log(`Share: ${path.join(OUT, "00-CEO-SUMMARY-TABLE.png")}`)
  console.log(`Or open: ${path.join(OUT, "INDEX.html")}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
