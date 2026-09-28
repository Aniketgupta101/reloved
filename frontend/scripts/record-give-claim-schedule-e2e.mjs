/**
 * E2E video: login → give → claim → donor accept → both confirm address & date
 * → delivery stage with agreed date shown (no Shadowfax/Shiprocket booking).
 *
 * Usage (from frontend/):
 *   node scripts/record-give-claim-schedule-e2e.mjs
 *
 * Env:
 *   BASE_URL  UI origin (default http://localhost:3000)
 *   API_URL   API origin (default https://reloved-digital.web.app/api)
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { SignJWT } from "jose"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "../recordings/give-claim-schedule-e2e")
const BASE = process.env.BASE_URL || "http://localhost:3000"
const API = (process.env.API_URL || "https://reloved-digital.web.app/api").replace(/\/$/, "")
const ENV_PATH = path.resolve(__dirname, "../../firebase-backend/functions/.env.reloved-digital")
const SAMPLE_PHOTO = path.join(__dirname, "_e2e-sample.jpg")

fs.mkdirSync(OUT, { recursive: true })

function loadEnv(filePath) {
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

const env = loadEnv(ENV_PATH)
const GIVER_PHONE = process.env.E2E_GIVER_PHONE || "9876501236"
const CLAIMER_PHONE = process.env.E2E_CLAIMER_PHONE || "9876501235"

async function mintToken(uid) {
  const secret = new TextEncoder().encode(env.JWT_SECRET || "reloved-firebase-dev-jwt-change-me")
  return new SignJWT({ email: uid, role: "donor", epoch: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(uid)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret)
}

async function apiJson(method, pathName, { token, body, formData } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (formData) {
    payload = formData
  } else if (body != null) {
    headers["Content-Type"] = "application/json"
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${API}${pathName}`, { method, headers, body: payload })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    throw new Error(`${method} ${pathName} → ${res.status} ${JSON.stringify(data).slice(0, 400)}`)
  }
  return data
}

async function ensureProfile(token, phone, name) {
  const me = await apiJson("GET", "/donor/profile", { token })
  if (me?.profile?.name && me?.profile?.address) return me.profile
  return apiJson("POST", "/donor/profile", {
    token,
    body: {
      name,
      username: name.replace(/\s+/g, "").slice(0, 16).toLowerCase() + String(Date.now()).slice(-4),
      phone,
      email: `${phone}@e2e.reloved.digital`,
      gender: "men",
      address: phone === GIVER_PHONE
        ? "Perry Cross Road, Bandra West, Mumbai 400050"
        : "Linking Road, Bandra West, Mumbai 400050",
      pincode: "400050",
      latitude: 19.0596,
      longitude: 72.8295,
    },
  })
}

async function createPorterDrop(giverToken) {
  // Reuse an existing public Wall image URL so we don't depend on multipart upload.
  const wall = await apiJson("GET", "/items?status=wall")
  const items = wall.items || wall || []
  const withImg = (Array.isArray(items) ? items : []).find((it) => it?.images?.[0]?.storagePath)
  const photoUrl = withImg?.images?.[0]?.storagePath
  if (!photoUrl) throw new Error("No Wall image available to attach to the E2E drop")

  const fields = {
    itemTitle: `E2E Schedule Tee ${Date.now().toString(36).slice(-4)}`,
    category: "Clothing",
    gender: "men",
    condition: "Good",
    size: "M",
    quantity: "1",
    description: "Playwright E2E demo item for schedule flow.",
    firstName: "E2E",
    lastName: "Giver",
    phone: GIVER_PHONE,
    email: `${GIVER_PHONE}@e2e.reloved.digital`,
    contactMethod: "WhatsApp",
    recognitionPreference: "name",
    giverLogistics: "porter_arranged",
    porterPaidBy: "receiver",
    pickupLocality: "Perry Cross Road, Bandra West, Mumbai 400050",
    declaration: "true",
    latitude: "19.0596",
    longitude: "72.8295",
    photoStoragePaths: JSON.stringify([photoUrl]),
    photoBgRemoved: JSON.stringify([true]),
  }
  const body = new URLSearchParams(fields)
  const res = await fetch(`${API}/donations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${giverToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`donations → ${res.status} ${JSON.stringify(data).slice(0, 400)}`)

  const itemId = data.itemId || data.item?.id
  if (!itemId) throw new Error(`No itemId in donation response: ${JSON.stringify(data).slice(0, 300)}`)

  // Resolve slug for Wall deep-link
  const wall2 = await apiJson("GET", "/items?status=wall")
  const list = wall2.items || wall2 || []
  const found = (Array.isArray(list) ? list : []).find((it) => it.id === itemId)
  if (found?.slug) {
    return { ...data, item: found, slug: found.slug, itemId }
  }
  // Fallback: admin-less public item by scanning again shortly
  await new Promise((r) => setTimeout(r, 800))
  const wall3 = await apiJson("GET", "/items?status=wall")
  const list3 = wall3.items || wall3 || []
  const found3 = (Array.isArray(list3) ? list3 : []).find((it) => it.id === itemId)
  return { ...data, item: found3 || { id: itemId }, slug: found3?.slug, itemId }
}

async function titleCard(page, lines) {
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;font-family:system-ui,sans-serif;background:#F4F1EA;color:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px;box-sizing:border-box">
  <div style="max-width:760px;border:3px solid #111;background:#fff;padding:28px 32px;box-shadow:8px 8px 0 #111">
    ${lines
      .map(
        (l, i) =>
          `<p style="margin:${i ? "12px 0 0" : "0"};font-size:${i === 0 ? "28px" : "17px"};font-weight:${i === 0 ? 900 : 600};line-height:1.35">${l}</p>`,
      )
      .join("")}
  </div></body></html>`)
  await page.waitForTimeout(1100)
}

async function injectSession(page, token) {
  await page.goto(`${BASE}/account/login`, { waitUntil: "domcontentloaded" })
  await page.evaluate((t) => {
    localStorage.setItem("reloved_donor_token", t)
  }, token)
}

async function shot(page, name, label) {
  const file = path.join(OUT, `${String(shots.length).padStart(2, "0")}-${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  shots.push({ name, label, file })
  console.log(`✓ ${name} — ${label}`)
}

const shots = []

async function main() {
  console.log(`Recording → ${OUT}`)
  console.log(`UI ${BASE} · API ${API}`)

  const giverToken = await mintToken(GIVER_PHONE)
  const claimerToken = await mintToken(CLAIMER_PHONE)
  console.log("Minted giver/claimer JWTs")

  await ensureProfile(giverToken, GIVER_PHONE, "E2E Giver")
  await ensureProfile(claimerToken, CLAIMER_PHONE, "E2E Claimer")
  console.log("Profiles ready")

  // Clear claimer's prior claims so weekly quota doesn't block
  try {
    await fetch(`${API}/dev/seed/reset-uat-claims`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-seed-secret": env.SEED_SECRET || "reloved-dev-seed" },
      body: JSON.stringify({ phone: CLAIMER_PHONE }),
    })
  } catch {
    /* optional */
  }

  const drop = await createPorterDrop(giverToken)
  const item = drop?.item || drop?.items?.[0] || drop
  const slug = item?.slug || drop?.slug
  const itemId = item?.id || drop?.itemId
  const reference = drop?.reference || drop?.submission?.reference
  if (!slug || !itemId) {
    throw new Error(`Donation response missing slug/id: ${JSON.stringify(drop).slice(0, 500)}`)
  }
  console.log(`Drop live: ${slug} (${itemId}) ref=${reference || "?"}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  let claimId = null

  async function gotoSafe(url, settleMs = 1500) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
    await page.waitForTimeout(settleMs)
  }

  try {
    await titleCard(page, [
      "Reloved — Give → Claim → Schedule",
      "End-to-end user flow (no courier booking)",
      "Login · Drop item · Claim · Accept · Confirm address & date",
    ])
    await shot(page, "title", "Flow title")

    // --- 1. Login (giver) ---
    await titleCard(page, ["1. Donor logs in", `Phone session · ${GIVER_PHONE}`])
    await injectSession(page, giverToken)
    await gotoSafe(`${BASE}/account`)
    await shot(page, "giver-account", "Donor account after login")

    // --- 2. Give (show success / giving tab for the new drop) ---
    await titleCard(page, [
      "2. Donor drops an item",
      "Logistics: Reloved arranges courier (porter_arranged)",
      `Item on Wall: ${slug}`,
    ])
    await gotoSafe(`${BASE}/give`, 1200)
    await shot(page, "give-start", "Give flow start")

    if (reference) {
      await gotoSafe(`${BASE}/give/success/${reference}?logistics=porter_arranged`)
      await shot(page, "give-success", "Drop submitted — success")
    }

    await gotoSafe(`${BASE}/drop/${slug}`)
    await shot(page, "item-on-wall", "New item detail on Wall")

    // --- 3. Claimer logs in + claims ---
    await titleCard(page, ["3. Claimer logs in & claims the item", `Phone session · ${CLAIMER_PHONE}`])
    await injectSession(page, claimerToken)
    await gotoSafe(`${BASE}/account`, 1200)
    await shot(page, "claimer-account", "Claimer account after login")

    await gotoSafe(`${BASE}/drop/${slug}`)
    await shot(page, "claimer-item", "Claimer views item")

    // Prefer UI claim button; fall back to API
    const claimBtn = page.getByRole("button", { name: /claim|relove|request/i }).first()
    if (await claimBtn.count()) {
      await claimBtn.click()
      await page.waitForTimeout(800)
      // Fill claim form fields if present
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first()
      if (await nameInput.count()) {
        await nameInput.fill("E2E Claimer").catch(() => {})
      }
      const note = page.locator("textarea").first()
      if (await note.count()) {
        await note.fill("Near Linking Road gate — E2E demo").catch(() => {})
      }
      const submit = page.getByRole("button", { name: /submit|send|confirm|claim/i }).last()
      if (await submit.count()) {
        await submit.click()
        await page.waitForTimeout(2500)
      }
      await shot(page, "claim-submitted-ui", "Claim submitted via UI")
    }

    // Ensure claim exists via API (idempotent if UI already did it)
    try {
      const created = await apiJson("POST", "/donor/item-requests", {
        token: claimerToken,
        body: {
          itemId,
          requesterName: "E2E Claimer",
          requesterPhone: CLAIMER_PHONE,
          note: "Near Linking Road gate — E2E demo",
          requesterLocality: "Bandra West, Mumbai",
          requesterAddress: "Linking Road, Bandra West, Mumbai 400050",
          requesterLatitude: 19.0596,
          requesterLongitude: 72.8295,
        },
      })
      claimId = created?.request?.id || created?.id || created?.itemRequest?.id
    } catch (err) {
      console.warn("claim API:", String(err.message || err).slice(0, 200))
      const list = await apiJson("GET", "/donor/item-requests", { token: claimerToken })
      const rows = list?.requests || list?.items || list || []
      const hit = (Array.isArray(rows) ? rows : []).find((r) => String(r.itemId) === String(itemId))
      claimId = hit?.id
    }
    if (!claimId) throw new Error("Could not create/find claim id")
    console.log(`Claim id=${claimId}`)

    await gotoSafe(`${BASE}/account/claims/${claimId}`)
    await shot(page, "claimer-pending", "Claimer claim page — awaiting donor")

    // --- 4. Donor accepts ---
    await titleCard(page, ["4. Donor accepts the claim", "Matched → schedule & addresses"])
    await injectSession(page, giverToken)
    await gotoSafe(`${BASE}/account`, 1000)
    // Try Giving / drops UI
    const givingTab = page.getByRole("button", { name: /giving|drops|my drops/i }).first()
    if (await givingTab.count()) {
      await givingTab.click()
      await page.waitForTimeout(1200)
    }
    await shot(page, "giver-inbox", "Donor account — pending claim")

    await apiJson("POST", `/donor/item-requests/${claimId}/giver-decision`, {
      token: giverToken,
      body: { decision: "accept" },
    })
    console.log("Donor accepted claim")

    // Open give detail if we have submission link; else claim page as giver via account
    await gotoSafe(`${BASE}/account/claims/${claimId}`).catch(() => {})
    // Givers usually see claim on GiveDetail — try account notifications / drops
    await gotoSafe(`${BASE}/account`, 1000)
    const openClaim = page.locator(`a[href*="${claimId}"]`).first()
    if (await openClaim.count()) {
      await openClaim.click()
      await page.waitForTimeout(1500)
    } else {
      // Fetch submission from claim for giver URL
      const claim = await apiJson("GET", `/donor/item-requests/${claimId}`, { token: giverToken })
      const subId = claim?.request?.submissionId || claim?.submissionId
      if (subId) {
        await gotoSafe(`${BASE}/give/${subId}`)
      } else {
        await gotoSafe(`${BASE}/account/claims/${claimId}`)
      }
    }
    await shot(page, "giver-matched", "Donor view after accept — matched")

    // --- 5. Confirm addresses + schedule via API (reliable), then show UI ---
    await titleCard(page, [
      "5. Confirm location & delivery date",
      "Both confirm building + agree a slot (2+ days ahead)",
      "Stop before Reloved books any courier",
    ])

    // Claimer confirm drop address
    await apiJson("POST", `/donor/item-requests/${claimId}/confirm-address`, {
      token: claimerToken,
      body: {
        role: "claimer",
        address: "Linking Road, Bandra West, Mumbai 400050",
        pincode: "400050",
      },
    }).catch(async (err) => {
      console.warn("claimer confirm-address", err.message)
      // Some builds omit role
      await apiJson("POST", `/donor/item-requests/${claimId}/confirm-address`, {
        token: claimerToken,
        body: { address: "Linking Road, Bandra West, Mumbai 400050", pincode: "400050" },
      })
    })

    // Giver confirm pickup
    await apiJson("POST", `/donor/item-requests/${claimId}/confirm-address`, {
      token: giverToken,
      body: {
        role: "giver",
        address: "Perry Cross Road, Bandra West, Mumbai 400050",
        pincode: "400050",
      },
    }).catch(async () => {
      await apiJson("POST", `/donor/item-requests/${claimId}/confirm-address`, {
        token: giverToken,
        body: { address: "Perry Cross Road, Bandra West, Mumbai 400050", pincode: "400050" },
      })
    })

    const slot = new Date()
    slot.setDate(slot.getDate() + 3)
    slot.setHours(18, 0, 0, 0)
    const slotIso = slot.toISOString()

    await apiJson("POST", `/donor/item-requests/${claimId}/propose-schedule`, {
      token: giverToken,
      body: { slots: [slotIso], mode: "specific" },
    })
    console.log(`Proposed slot ${slotIso}`)

    await apiJson("POST", `/donor/item-requests/${claimId}/respond-schedule`, {
      token: claimerToken,
      body: { decision: "accept", slotAt: slotIso },
    })
    console.log("Claimer accepted slot")

    // --- 6. Show both date pages ---
    await injectSession(page, claimerToken)
    await gotoSafe(`${BASE}/account/claims/${claimId}`, 2000)
    await page.evaluate(() => window.scrollBy(0, 320))
    await page.waitForTimeout(600)
    await shot(page, "claimer-agreed-date", "Claimer — agreed delivery date page")

    await injectSession(page, giverToken)
    // Prefer giver give detail if available
    const claimFresh = await apiJson("GET", `/donor/item-requests/${claimId}`, { token: giverToken })
    const subId = claimFresh?.request?.submissionId || claimFresh?.submissionId
    if (subId) {
      await gotoSafe(`${BASE}/give/${subId}`, 2000)
    } else {
      await gotoSafe(`${BASE}/account`)
      const link = page.locator(`a[href*="${claimId}"]`).first()
      if (await link.count()) await link.click()
      else await gotoSafe(`${BASE}/account/claims/${claimId}`, 2000)
      await page.waitForTimeout(2000)
    }
    await page.evaluate(() => window.scrollBy(0, 360))
    await page.waitForTimeout(600)
    await shot(page, "giver-agreed-date", "Donor — agreed delivery date page")

    await titleCard(page, [
      "Delivery stage ready",
      "Both sides see the locked date & locations",
      "Next (ops): book courier — not part of this demo",
      "No Shadowfax / Shiprocket booking in this video",
    ])
    await shot(page, "done", "Done — schedule locked")
  } finally {
    const videoPath = await page.video()?.path()
    await context.close()
    await browser.close()

    let finalVideo = null
    if (videoPath && fs.existsSync(videoPath)) {
      finalVideo = path.join(OUT, "give-claim-schedule-e2e.webm")
      fs.renameSync(videoPath, finalVideo)
      console.log(`✓ video → ${finalVideo}`)
    }

    const md = `# Give → Claim → Schedule E2E

**Captured:** ${new Date().toISOString()}
**UI:** ${BASE}
**API:** ${API}
**Item:** \`${slug}\`
**Claim:** \`${claimId || "?"}\`

${finalVideo ? `**Video:** \`give-claim-schedule-e2e.webm\`\n` : ""}

## Steps
1. Donor login
2. Drop item (\`porter_arranged\` — Reloved courier path)
3. Claimer login + claim
4. Donor accept
5. Both confirm address + agree delivery date
6. Stop at delivery-stage date page (no courier book)

## Screenshots
${shots.map((s) => `- **${s.name}** — ${s.label}`).join("\n")}
`
    fs.writeFileSync(path.join(OUT, "README.md"), md)
    console.log(`✓ README → ${path.join(OUT, "README.md")}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
