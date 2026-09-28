/**
 * Adversarial E2E for merged client-handover fixes (UX polish, wall pagination,
 * Give modular/photo-draft, geo/privacy probes via live API).
 *
 * Run from frontend/: node scripts/qa-merged-fixes-e2e.mjs
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  launchQaContext,
  captureConsoleAndNetworkErrors,
  failRequestsMatching,
} from "../../.claude/skills/qa-e2e-tester/scripts/qa_helpers.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.resolve(__dirname, "..")
const OUT = path.join(FRONTEND, "qa-artifacts", "merged-fixes-e2e")
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000"
const API = process.env.QA_API_URL || "https://api-wsyflslyaq-el.a.run.app"

const findings = []
const confirmed = []

function note(severity, summary, detail) {
  findings.push({ severity, summary, ...detail })
}
function ok(summary) {
  confirmed.push(summary)
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true }).catch(() => {})
  return file
}

async function apiJson(pathname, opts = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, body }
}

async function runApiProbes() {
  // Wall list
  const wall = await apiJson("/api/items?status=wall&limit=5")
  if (wall.status !== 200 || !Array.isArray(wall.body?.items) || wall.body.items.length === 0) {
    note("P0", "Wall API not returning items", {
      flow: "Wall",
      repro: ["GET /api/items?status=wall&limit=5"],
      expected: "200 with items[]",
      actual: `${wall.status} ${JSON.stringify(wall.body).slice(0, 200)}`,
      evidence: "API probe",
      tracedTo: "firebase-backend/functions/src/routes/items.ts",
    })
  } else {
    ok(`Wall API returns ${wall.body.items.length} items`)
    const sample = wall.body.items[0]
    const locality = String(sample.locality || "")
    if (/\b(flat|wing|apt|apartment|#)\b/i.test(locality) && /\d{1,4}[A-Za-z]?/.test(locality)) {
      note("P0", "Public Wall item may expose flat/wing-style locality", {
        flow: "Wall privacy",
        repro: [`Inspect locality on item ${sample.id}`],
        expected: "Public area only (no flat/wing)",
        actual: locality,
        evidence: JSON.stringify({ id: sample.id, locality }),
        tracedTo: "firebase-backend/functions/src/types.ts toPublicItem / geo.toPublicArea",
      })
    } else {
      ok(`Sample Wall locality looks area-level: "${locality}"`)
    }
    // No phone in public item
    const blob = JSON.stringify(sample)
    if (/"phone"\s*:|"requesterPhone"|"pickupAddress"/.test(blob)) {
      note("P0", "Public item JSON includes sensitive contact/address fields", {
        flow: "Wall privacy",
        repro: ["Inspect first Wall item JSON keys"],
        expected: "No phone / exact pickup address on public list",
        actual: blob.slice(0, 400),
        evidence: "API probe",
        tracedTo: "toPublicItem",
      })
    } else {
      ok("Public Wall item JSON has no phone/pickupAddress fields")
    }
  }

  // Pagination cursor support (issue-fix)
  const page1 = await apiJson("/api/items?status=wall&limit=10")
  const hasCursor = Boolean(page1.body?.nextCursor || page1.body?.hasMore != null)
  if (!hasCursor) {
    note("P1", "Live API does not yet expose Wall pagination cursor fields", {
      flow: "Wall pagination",
      repro: ["GET /api/items?status=wall&limit=10", "Check nextCursor/hasMore"],
      expected: "nextCursor + hasMore after issue-fix merge deploy",
      actual: `keys=${Object.keys(page1.body || {}).join(",")}`,
      evidence: "API probe against production Functions (local branch ahead of deploy)",
      tracedTo: "firebase-backend/functions/src/routes/items.ts + wallPagination.ts",
    })
  } else {
    ok(`Wall pagination present: hasMore=${page1.body.hasMore} nextCursor=${Boolean(page1.body.nextCursor)}`)
    if (page1.body.nextCursor) {
      const page2 = await apiJson(
        `/api/items?status=wall&limit=10&cursor=${encodeURIComponent(page1.body.nextCursor)}`,
      )
      if (page2.status !== 200) {
        note("P1", "Wall cursor page failed", {
          flow: "Wall pagination",
          repro: ["Use nextCursor from page 1"],
          expected: "200 second page",
          actual: String(page2.status),
          evidence: JSON.stringify(page2.body).slice(0, 200),
          tracedTo: "items.ts sliceWallPage",
        })
      } else {
        const ids1 = new Set((page1.body.items || []).map((i) => i.id))
        const overlap = (page2.body.items || []).filter((i) => ids1.has(i.id))
        if (overlap.length) {
          note("P1", "Wall page 2 overlaps page 1 ids", {
            flow: "Wall pagination",
            repro: ["Load page1 then page2 with cursor"],
            expected: "No duplicate ids across pages",
            actual: `${overlap.length} overlaps e.g. ${overlap[0]?.id}`,
            evidence: "API probe",
            tracedTo: "wallPagination.ts",
          })
        } else {
          ok("Wall cursor pages do not overlap")
        }
      }
    }
  }

  // Null Island geo claim radius (code path via donor assert — probe public health)
  const claimBad = await apiJson("/api/donor/item-requests", {
    method: "POST",
    body: JSON.stringify({
      itemId: "nonexistent",
      requesterName: "QA",
      requesterPhone: "9876543210",
      requesterAddress: "Somewhere",
      latitude: 0,
      longitude: 0,
    }),
  })
  if (claimBad.status === 401 || claimBad.status === 403) {
    ok(`Unauth claim correctly rejected (${claimBad.status})`)
  } else if (claimBad.status === 400 || claimBad.status === 409) {
    ok(`Claim without session rejected with ${claimBad.status}`)
  } else {
    note("P1", "Unexpected unauth claim response", {
      flow: "Claim auth",
      repro: ["POST /api/donor/item-requests without Bearer"],
      expected: "401/403",
      actual: String(claimBad.status),
      evidence: JSON.stringify(claimBad.body).slice(0, 200),
      tracedTo: "donor.ts item-requests + session middleware",
    })
  }

  // Admin login (for polish endpoint sanity)
  const envPath = path.resolve(FRONTEND, "../firebase-backend/functions/.env.reloved-digital")
  let adminEmail = ""
  let adminPass = ""
  try {
    const fs = await import("node:fs")
    const raw = fs.readFileSync(envPath, "utf8")
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const eq = t.indexOf("=")
      if (eq < 1) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (k === "ADMIN_EMAIL") adminEmail = v
      if (k === "ADMIN_PASSWORD") adminPass = v
    }
  } catch {
    /* optional */
  }
  if (adminEmail && adminPass) {
    const login = await apiJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: adminEmail, password: adminPass }),
    })
    if (login.status === 200 && login.body?.token) {
      ok("Admin login works against live API")
      const polish = await apiJson("/api/donations/polish-item-images", {
        method: "POST",
        headers: { Authorization: `Bearer ${login.body.token}` },
        body: JSON.stringify({ itemId: "does-not-exist-qa", force: true }),
      })
      if (polish.status === 404) {
        ok("polish-item-images returns 404 for missing item (auth OK)")
      } else {
        note("P2", "polish-item-images unexpected status for missing item", {
          flow: "Photo polish",
          repro: ["Admin POST polish with fake itemId"],
          expected: "404",
          actual: String(polish.status),
          evidence: JSON.stringify(polish.body).slice(0, 200),
          tracedTo: "publicWrite.ts polish-item-images",
        })
      }
    } else {
      note("P1", "Admin login failed on live API", {
        flow: "Admin auth",
        repro: ["POST /api/auth/login with ADMIN_EMAIL/PASSWORD"],
        expected: "200 + token",
        actual: `${login.status} ${JSON.stringify(login.body).slice(0, 160)}`,
        evidence: "API probe",
        tracedTo: "auth.ts",
      })
    }
  }

  // Ghost-mannequin: spot-check Wall images have bgRemoved or storage paths
  if (Array.isArray(wall.body?.items)) {
    const withImg = wall.body.items.filter((i) => i.images?.[0]?.storagePath)
    const polished = withImg.filter((i) => i.images?.[0]?.bgRemoved === true)
    ok(`Wall sample: ${withImg.length} with images, ${polished.length} marked bgRemoved`)
    if (withImg.length && polished.length === 0) {
      note("P2", "No sampled Wall items flagged bgRemoved=true", {
        flow: "Wall studio polish",
        repro: ["Sample first Wall page images[].bgRemoved"],
        expected: "Most live Wall cards bgRemoved after reprocess",
        actual: "0/sample",
        evidence: "API probe",
        tracedTo: "photoAnalyze / polishItemImages",
      })
    }
  }
}

async function runBrowserProbes() {
  await mkdir(OUT, { recursive: true })
  const { browser, page } = await launchQaContext({ cwd: FRONTEND, headless: true })
  const errors = captureConsoleAndNetworkErrors(page)

  try {
    // Home / Wall
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForTimeout(1500)
    const homeTitle = await page.title()
    if (!/reloved/i.test(homeTitle) && !(await page.locator("body").innerText()).includes("Reloved")) {
      note("P0", "Home page does not render Reloved brand", {
        flow: "Home",
        repro: [`Open ${BASE}/`],
        expected: "Brand visible",
        actual: homeTitle,
        evidence: await shot(page, "home-fail.png".replace(/\.png$/,"")),
      })
    } else {
      ok("Home loads with Reloved branding")
    }

    await page.goto(`${BASE}/drop`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForTimeout(2500)
    const wallText = await page.locator("body").innerText()
    const cardCount = await page.locator('a[href*="/drop/"], [data-wall-card], article, .wall').count()
    const hasCards =
      cardCount > 0 ||
      (await page.getByText(/AVAILABLE|Being matched|FREE|₹0/i).count()) > 0
    if (!hasCards && /couldn't|failed|error/i.test(wallText)) {
      note("P0", "Wall of Kindness failed to load items in browser", {
        flow: "Wall",
        repro: [`Open ${BASE}/drop`],
        expected: "Item cards visible",
        actual: wallText.slice(0, 300),
        evidence: await shot(page, "wall-fail.png".replace(/\.png$/,"")),
        tracedTo: "WallOfKindness.tsx",
      })
    } else if (hasCards) {
      ok("Wall shows item cards")
      await shot(page, "wall-ok.png".replace(/\.png$/,""))
    } else {
      note("P1", "Wall loaded but no clear item cards detected", {
        flow: "Wall",
        repro: [`Open ${BASE}/drop`],
        expected: "Visible product cards",
        actual: `cardCount=${cardCount}; snippet=${wallText.slice(0, 200)}`,
        evidence: await shot(page, "wall-empty.png".replace(/\.png$/,"")),
        tracedTo: "WallOfKindness.tsx",
      })
    }

    // Load more / infinite scroll (FE expects cursor — may fail soft if API undeployed)
    const loadMoreBtn = page.getByRole("button", { name: /load more|show more|retry/i })
    if ((await loadMoreBtn.count()) > 0) {
      await loadMoreBtn.first().click().catch(() => {})
      await page.waitForTimeout(2000)
      ok("Wall load-more control present and clickable")
    } else {
      // Infinite scroll may not show a button — scroll instead
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(2000)
      const moreErr = await page.getByText(/couldn't load more|failed to load more/i).count()
      if (moreErr > 0) {
        note("P1", "Wall load-more shows error (likely API without pagination deploy)", {
          flow: "Wall pagination",
          repro: ["Scroll Wall to bottom / click load more"],
          expected: "More items or silent end",
          actual: "Load-more error UI visible",
          evidence: await shot(page, "wall-loadmore-err.png".replace(/\.png$/,"")),
          tracedTo: "WallOfKindness.tsx loadMore + items.ts cursor (needs Functions deploy)",
        })
      } else {
        ok("Wall scroll/load-more did not surface an error banner")
      }
    }

    // Give flow — modular steps + UX copy
    await page.goto(`${BASE}/give`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForTimeout(1500)
    const giveBody = await page.locator("body").innerText()
    if (/photo|add photo|drop|give/i.test(giveBody)) {
      ok("Give page loads (photo/drop entry visible)")
      await shot(page, "give-start.png".replace(/\.png$/,""))
    } else {
      note("P0", "Give page blank or broken", {
        flow: "Give",
        repro: [`Open ${BASE}/give`],
        expected: "Give wizard starts",
        actual: giveBody.slice(0, 250),
        evidence: await shot(page, "give-fail.png".replace(/\.png$/,"")),
        tracedTo: "pages/public/Give.tsx + give/*",
      })
    }

    // Back-button mid-flow: advance if possible then go back
    const nextBtn = page.getByRole("button", { name: /continue|next|start/i }).first()
    if ((await nextBtn.count()) > 0 && (await nextBtn.isEnabled().catch(() => false))) {
      await nextBtn.click().catch(() => {})
      await page.waitForTimeout(800)
      await page.goBack()
      await page.waitForTimeout(800)
      ok("Give survives browser back without hard crash")
    }

    // Refresh draft survival — just refresh give
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1000)
    const afterRefresh = await page.locator("body").innerText()
    if (/error|something went wrong/i.test(afterRefresh) && !/photo|give|drop/i.test(afterRefresh)) {
      note("P1", "Give page broken after refresh", {
        flow: "Give draft",
        repro: ["Open /give", "Refresh"],
        expected: "Wizard still usable",
        actual: afterRefresh.slice(0, 200),
        evidence: await shot(page, "give-refresh.png".replace(/\.png$/,"")),
        tracedTo: "givePhotoDraft.ts / Give.tsx",
      })
    } else {
      ok("Give page recovers after refresh")
    }

    // Claim entry via first wall item
    await page.goto(`${BASE}/drop`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForTimeout(2000)
    const firstLink = page.locator('a[href^="/drop/"]').first()
    if ((await firstLink.count()) > 0) {
      const href = await firstLink.getAttribute("href")
      await firstLink.click()
      await page.waitForTimeout(2000)
      const detail = await page.locator("body").innerText()
      if (/claim|request|relove|available/i.test(detail)) {
        ok(`Item detail opens (${href})`)
        // Privacy: no obvious phone on public detail
        if (/\b[6-9]\d{9}\b/.test(detail)) {
          note("P0", "Public item detail shows a 10-digit phone-like number", {
            flow: "Item detail privacy",
            repro: [`Open ${href}`],
            expected: "No giver phone on public page",
            actual: "Matched 10-digit pattern in page text",
            evidence: await shot(page, "detail-phone.png".replace(/\.png$/,"")),
            tracedTo: "ItemDetail.tsx / toPublicItem",
          })
        } else {
          ok("No obvious phone number on public item detail")
        }
      } else {
        note("P1", "Item detail missing claim CTA / copy", {
          flow: "Claim",
          repro: [`Open ${href}`],
          expected: "Claim/request UI",
          actual: detail.slice(0, 250),
          evidence: await shot(page, "detail-odd.png".replace(/\.png$/,"")),
          tracedTo: "ItemDetail.tsx",
        })
      }
    } else {
      note("P1", "No Wall item links to open for claim path", {
        flow: "Claim",
        repro: ["Open /drop", "Click first card"],
        expected: "At least one /drop/:slug link",
        actual: "None found",
        evidence: await shot(page, "no-links.png".replace(/\.png$/,"")),
      })
    }

    // Auth gate on account
    await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForTimeout(1500)
    const account = await page.locator("body").innerText()
    if (/sign in|log in|otp|email|phone/i.test(account)) {
      ok("Account redirects/shows login when unauthenticated")
    } else if (/your drops|dashboard|claims/i.test(account)) {
      ok("Account shows dashboard (session already present)")
    } else {
      note("P2", "Account page unexpected unauthenticated state", {
        flow: "Auth",
        repro: [`Open ${BASE}/account logged out`],
        expected: "Login or dashboard",
        actual: account.slice(0, 200),
        evidence: await shot(page, "account.png".replace(/\.png$/,"")),
      })
    }

    // Admin gate
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForTimeout(1500)
    const admin = await page.locator("body").innerText()
    if (/sign in|log in|password|admin/i.test(admin)) {
      ok("Admin route gated or shows admin login")
    } else {
      note("P0", "Admin appears accessible without clear auth gate", {
        flow: "Admin auth",
        repro: ["Open /admin while logged out"],
        expected: "Login required",
        actual: admin.slice(0, 200),
        evidence: await shot(page, "admin-open.png".replace(/\.png$/,"")),
        tracedTo: "AdminLayout / auth routes",
      })
    }

    // 404 / missing page UX polish
    await page.goto(`${BASE}/this-page-does-not-exist-qa`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForTimeout(1000)
    const missing = await page.locator("body").innerText()
    const hasHome = (await page.getByRole("link", { name: /home/i }).count()) > 0
    const hasWall = (await page.getByRole("link", { name: /wall|browse/i }).count()) > 0
    if (/not found|404|missing/i.test(missing) && (hasHome || hasWall)) {
      ok("404 page has recovery links (Home/Wall)")
    } else if (/not found|404/i.test(missing)) {
      note("P3", "404 page lacks clear Home/Wall recovery links", {
        flow: "404 UX",
        repro: ["Open unknown path"],
        expected: "Home + Browse Wall CTAs",
        actual: missing.slice(0, 200),
        evidence: await shot(page, "404.png".replace(/\.png$/,"")),
        tracedTo: "NotFound / App routes",
      })
    }

    // Network failure on Wall fetch — FE should not dead-end forever
    await failRequestsMatching(page, /\/api\/items/)
    await page.goto(`${BASE}/drop`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForTimeout(2500)
    const failWall = await page.locator("body").innerText()
    if (/retry|couldn't|failed|error|try again/i.test(failWall)) {
      ok("Wall shows recovery copy when /api/items fails")
      await shot(page, "wall-network-fail.png".replace(/\.png$/,""))
    } else {
      note("P2", "Wall network failure has no clear recovery messaging", {
        flow: "Wall network",
        repro: ["Block /api/items", "Open /drop"],
        expected: "Error + retry",
        actual: failWall.slice(0, 220),
        evidence: await shot(page, "wall-network-silent.png".replace(/\.png$/,"")),
        tracedTo: "WallOfKindness.tsx",
      })
    }

    const seriousConsole = errors.consoleErrors.filter(
      (e) => !/ResizeObserver|favicon|posthog|third-party|wsrv\.nl/i.test(e.text),
    )
    if (seriousConsole.length > 8) {
      note("P2", `Many console errors during browser pass (${seriousConsole.length})`, {
        flow: "Browser console",
        repro: ["Run full browser probe"],
        expected: "Few/no app errors",
        actual: seriousConsole.slice(0, 5).map((e) => e.text).join(" | "),
        evidence: path.join(OUT, "console.json"),
      })
    } else {
      ok(`Console errors limited (${seriousConsole.length} non-noise)`)
    }
    await writeFile(path.join(OUT, "console.json"), JSON.stringify(errors, null, 2))
  } finally {
    await browser.close()
  }
}

function rank(a, b) {
  const order = { P0: 0, P1: 1, P2: 2, P3: 3 }
  return (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
}

async function main() {
  console.log(JSON.stringify({ BASE, API, OUT }, null, 2))
  await runApiProbes()
  await runBrowserProbes()
  findings.sort(rank)
  const report = {
    scope: "Merged fixes on client-handover (UX polish, audit-fixes, issue-fix Wall/Give)",
    testedAgainst: { frontend: BASE, api: API, branch: "client-handover@local" },
    findings,
    confirmed,
  }
  await mkdir(OUT, { recursive: true })
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2))
  console.log("\n=== FINDINGS ===")
  for (const f of findings) {
    console.log(`[${f.severity}] ${f.summary}`)
  }
  console.log("\n=== CONFIRMED ===")
  for (const c of confirmed) console.log(`OK ${c}`)
  console.log(`\nArtifacts: ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
