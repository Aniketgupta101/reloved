/**
 * CEO live verification: docs checklist (except DLT) → APIs → Brevo triggers → match flow.
 * Run: node scripts/ceo-live-verification.mjs
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const WEB = process.env.UAT_BASE_URL || "https://reloved-digital.web.app"
const SEED_SECRET = process.env.SEED_SECRET || "reloved-dev-seed"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"

const GIVER = {
  phone: "9876501241",
  name: "UAT Giver",
  username: "uat_giver",
  email: "uat.giver.reloved@gmail.com",
}
const CLAIMER = {
  phone: "9876501235",
  name: "UAT Test User",
  username: "uat_reviewer",
  email: "uat.claimer.reloved@gmail.com",
}

const results = []
function ok(name, detail = "") {
  results.push({ status: "PASS", name, detail })
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`)
}
function fail(name, detail = "") {
  results.push({ status: "FAIL", name, detail })
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`)
}
function skip(name, detail = "") {
  results.push({ status: "SKIP", name, detail })
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ""}`)
}

function loadBrevoKey() {
  const envPath = path.resolve(__dirname, "../../firebase-backend/functions/.env.reloved-digital")
  const raw = readFileSync(envPath, "utf8")
  const line = raw.split(/\r?\n/).find((l) => l.startsWith("BREVO_API_KEY="))
  if (!line) throw new Error("BREVO_API_KEY missing")
  return line.slice("BREVO_API_KEY=".length).trim()
}

async function api(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  })
  const text = await res.text()
  let body = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { raw: text }
  }
  return { res, body, status: res.status }
}

async function mustOk(pathname, options = {}) {
  const out = await api(pathname, options)
  if (!out.res.ok) {
    throw new Error(`${pathname} → ${out.status} ${JSON.stringify(out.body).slice(0, 240)}`)
  }
  return out.body
}

async function login(phone) {
  const { devCode } = await mustOk("/api/otp/request", {
    method: "POST",
    body: JSON.stringify({ channel: "sms", target: phone }),
  })
  if (!devCode) throw new Error(`No OTP devCode for ${phone}`)
  await mustOk("/api/otp/verify", {
    method: "POST",
    body: JSON.stringify({ channel: "sms", target: phone, code: devCode }),
  })
  const { token } = await mustOk("/api/donor/session", {
    method: "POST",
    body: JSON.stringify({ channel: "sms", target: phone }),
  })
  return token
}

async function ensureProfile(token, user) {
  await mustOk("/api/donor/profile", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: user.name,
      username: user.username,
      gender: "unisex",
      phone: user.phone,
      email: user.email || undefined,
      address: "Bandra West, Mumbai",
      addressLabel: "home",
      pincode: "400050",
      latitude: 19.0596,
      longitude: 72.8295,
    }),
  })
}

async function brevoRecentByTemplate(brevoKey, templateId, startDate) {
  const url = new URL("https://api.brevo.com/v3/smtp/emails")
  url.searchParams.set("templateId", String(templateId))
  url.searchParams.set("limit", "20")
  url.searchParams.set("startDate", startDate)
  url.searchParams.set("endDate", startDate)
  const res = await fetch(url, { headers: { "api-key": brevoKey, accept: "application/json" } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { count: 0, error: body }
  return { count: (body.transactionalEmails || []).length, emails: body.transactionalEmails || [] }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const brevoKey = loadBrevoKey()
  const stamp = Date.now()

  console.log("\n=== 1) Public + health APIs ===")
  {
    const h = await api("/api/health")
    h.status === 200 && h.body?.ok ? ok("GET /api/health", JSON.stringify(h.body)) : fail("GET /api/health", JSON.stringify(h.body))
  }
  {
    const items = await api("/api/items")
    const n = items.body?.items?.length ?? items.body?.length ?? 0
    items.res.ok && n > 0 ? ok("GET /api/items", `count≈${n}`) : fail("GET /api/items", JSON.stringify(items.body).slice(0, 200))
  }
  {
    const phone = `9${String(stamp).slice(-9)}`
    const email = `ceo.verify.${stamp}@gmail.com`
    const w = await api("/api/waitlist", {
      method: "POST",
      body: JSON.stringify({ fullName: "CEO Verify", email, phone, intent: "donate" }),
    })
    w.status === 201 && w.body?.ok
      ? ok("POST /api/waitlist", `emailSent=${w.body.emailSent} id=${w.body.id}`)
      : fail("POST /api/waitlist", `${w.status} ${JSON.stringify(w.body)}`)
  }
  {
    const contact = await api("/api/contact", {
      method: "POST",
      body: JSON.stringify({
        name: "CEO Verify",
        email: `ceo.contact.${stamp}@gmail.com`,
        message: "CEO live verification contact ping",
      }),
    })
    contact.res.ok ? ok("POST /api/contact", JSON.stringify(contact.body).slice(0, 120)) : fail("POST /api/contact", `${contact.status} ${JSON.stringify(contact.body)}`)
  }
  {
    const partner = await api("/api/partner-applications", {
      method: "POST",
      body: JSON.stringify({
        orgName: `CEO Verify NGO ${stamp}`,
        orgType: "NGO",
        registrationStatus: "Registered",
        contactPerson: "CEO Verify",
        phone: "9876501999",
        email: `ceo.partner.${stamp}@gmail.com`,
        locality: "Mumbai",
        requiredCategories: ["Tops"],
        message: "CEO verification partner application",
        consent: true,
      }),
    })
    partner.res.ok
      ? ok("POST /api/partner-applications", JSON.stringify(partner.body).slice(0, 120))
      : fail("POST /api/partner-applications", `${partner.status} ${JSON.stringify(partner.body)}`)
  }

  console.log("\n=== 2) Auth + donor APIs ===")
  let giverToken
  let claimerToken
  try {
    giverToken = await login(GIVER.phone)
    await ensureProfile(giverToken, GIVER)
    ok("Giver OTP session", GIVER.phone)
  } catch (e) {
    fail("Giver OTP session", e.message)
  }
  try {
    claimerToken = await login(CLAIMER.phone)
    await ensureProfile(claimerToken, CLAIMER)
    ok("Claimer OTP session", CLAIMER.phone)
  } catch (e) {
    fail("Claimer OTP session", e.message)
  }

  if (claimerToken) {
    const notes = await api("/api/donor/notifications", {
      headers: { Authorization: `Bearer ${claimerToken}` },
    })
    notes.res.ok
      ? ok("GET /api/donor/notifications", `count=${notes.body?.notifications?.length ?? 0} unread=${notes.body?.unreadCount ?? "?"}`)
      : fail("GET /api/donor/notifications", `${notes.status}`)
  }

  console.log("\n=== 3) Admin APIs ===")
  let adminToken
  {
    const loginAdmin = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    })
    if (loginAdmin.res.ok && loginAdmin.body?.token) {
      adminToken = loginAdmin.body.token
      ok("POST /api/admin/login")
    } else {
      fail("POST /api/admin/login", `${loginAdmin.status} ${JSON.stringify(loginAdmin.body)}`)
    }
  }
  if (adminToken) {
    for (const route of ["/api/admin/donations", "/api/admin/item-requests", "/api/admin/messages", "/api/admin/partners"]) {
      const r = await api(route, { headers: { Authorization: `Bearer ${adminToken}` } })
      r.res.ok ? ok(`GET ${route}`) : fail(`GET ${route}`, `${r.status}`)
    }
  }

  console.log("\n=== 4) Match flow (seed → claim → accept → address → Borzo estimate) ===")
  let claimId
  let itemId
  let itemSlug
  try {
    const seeded = await mustOk("/api/dev/seed/match-flow", {
      method: "POST",
      headers: { "x-seed-secret": SEED_SECRET },
      body: JSON.stringify({ giverPhone: GIVER.phone, claimerPhone: CLAIMER.phone }),
    })
    itemId = seeded.itemId
    itemSlug = seeded.slug
    ok("POST /api/dev/seed/match-flow", `slug=${itemSlug}`)
  } catch (e) {
    fail("POST /api/dev/seed/match-flow", e.message)
  }

  if (claimerToken && itemId) {
    try {
      const claim = await mustOk("/api/donor/item-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${claimerToken}` },
        body: JSON.stringify({
          itemId,
          requesterName: CLAIMER.name,
          requesterPhone: CLAIMER.phone,
          requesterAddress: "Carter Road Gate, Bandra West",
          note: "CEO live verification claim",
          latitude: 19.061,
          longitude: 72.83,
        }),
      })
      claimId = claim.request?.id || claim.id || claim.requestId
      ok("POST /api/donor/item-requests", `claimId=${claimId}`)
    } catch (e) {
      fail("Claim item", e.message)
    }
  }

  if (giverToken) {
    const gNotes = await api("/api/donor/notifications", {
      headers: { Authorization: `Bearer ${giverToken}` },
    })
    const hasClaimNote = (gNotes.body?.notifications || []).some(
      (n) => n.type === "item_claimed" || String(n.body || "").toLowerCase().includes("accept")
    )
    gNotes.res.ok && hasClaimNote
      ? ok("Giver in-app notification after claim")
      : fail("Giver in-app notification after claim", JSON.stringify(gNotes.body).slice(0, 300))
  }

  if (giverToken && claimId) {
    try {
      const decided = await mustOk(`/api/donor/item-requests/${claimId}/giver-decision`, {
        method: "POST",
        headers: { Authorization: `Bearer ${giverToken}` },
        body: JSON.stringify({ decision: "accept" }),
      })
      ok("POST giver-decision accept", JSON.stringify(decided).slice(0, 160))
    } catch (e) {
      fail("Giver accept claim", e.message)
    }
  }

  if (claimerToken && claimId) {
    try {
      const addr = await mustOk(`/api/donor/item-requests/${claimId}/delivery-address`, {
        method: "POST",
        headers: { Authorization: `Bearer ${claimerToken}` },
        body: JSON.stringify({
          address: "Linking Road Gate, Bandra West",
          latitude: 19.061,
          longitude: 72.83,
        }),
      })
      ok("POST delivery-address", JSON.stringify(addr).slice(0, 160))
    } catch (e) {
      fail("Claimer share address", e.message)
    }
  }

  if (claimerToken && claimId) {
    try {
      const est = await mustOk(`/api/donor/item-requests/${claimId}/borzo/estimate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${claimerToken}` },
        body: JSON.stringify({}),
      })
      ok("POST borzo/estimate", JSON.stringify(est).slice(0, 200))
    } catch (e) {
      fail("Borzo estimate", e.message)
    }
  }

  console.log("\n=== 5) Website route smoke ===")
  for (const route of ["/", "/drop", "/give", "/faq", "/story", "/contact", "/partners", "/qr", "/account", "/admin/login", "/wall-of-love", "/logistics", "/privacy", "/terms"]) {
    const res = await fetch(`${WEB}${route}`)
    const html = await res.text()
    const spa = html.includes('id="root"') && /assets\/index-[A-Za-z0-9_-]+\.js/.test(html)
    res.ok && spa ? ok(`WEB ${route}`) : fail(`WEB ${route}`, `status=${res.status}`)
  }
  {
    const home = await (await fetch(WEB)).text()
    const jsMatch = home.match(/assets\/index-[A-Za-z0-9_-]+\.js/)
    if (jsMatch) {
      const js = await (await fetch(`${WEB}/${jsMatch[0]}`)).text()
      const privacyRe = new RegExp("in a bag|bag it|security", "i")
      const notesRe = new RegExp("Mark all read|Notifications", "i")
      const borzoRe = new RegExp("Estimate|Book via Borzo|Track Live", "i")
      privacyRe.test(js)
        ? ok("Privacy bag / security copy present in live bundle")
        : fail("Privacy bag / security copy present in live bundle")
      notesRe.test(js)
        ? ok("Notifications UI present in live bundle")
        : fail("Notifications UI present in live bundle")
      borzoRe.test(js)
        ? ok("Borzo claimer UI present in live bundle")
        : fail("Borzo claimer UI present in live bundle")
    } else {
      fail("Find live JS bundle")
    }
  }
  {
    const coming = await (await fetch("https://reloved.digital/")).text()
    const waitlistRe = new RegExp("waitlistForm|Join the waitlist", "i")
    waitlistRe.test(coming)
      ? ok("reloved.digital waitlist form live")
      : fail("reloved.digital waitlist form live")
  }

  console.log("\n=== 6) Brevo template inventory + recent sends ===")
  const expected = {
    1: "OTP",
    2: "Donation confirm",
    3: "Donation admin",
    4: "Claim confirm",
    5: "Claim admin",
    6: "Welcome",
    7: "Donation decision",
    8: "Claim decision",
    9: "Partner confirm",
    10: "Partner admin",
    11: "Contact admin",
    12: "Item claim notify giver",
    14: "New message admin",
    15: "New message donor",
    16: "Delivery picked up",
    17: "Delivery delivered claimer",
    18: "Delivery delivered giver",
    19: "Delivery failed",
    26: "Rider dispatched giver",
    27: "Waitlist welcome",
  }
  const tplRes = await fetch("https://api.brevo.com/v3/smtp/templates?limit=50&sort=desc", {
    headers: { "api-key": brevoKey, accept: "application/json" },
  })
  const tplBody = await tplRes.json()
  const byId = new Map((tplBody.templates || []).map((t) => [t.id, t]))
  for (const [id, label] of Object.entries(expected)) {
    const t = byId.get(Number(id))
    t?.isActive ? ok(`Brevo #${id} ${label}`, t.name) : fail(`Brevo #${id} ${label}`, t ? "inactive" : "missing")
  }

  // After our triggers, check key templates fired today
  const checkIds = [
    [4, "Claim confirm"],
    [5, "Claim admin"],
    [8, "Claim decision"],
    [11, "Contact admin"],
    [12, "Item claim notify giver"],
    [9, "Partner confirm"],
    [10, "Partner admin"],
    [27, "Waitlist welcome"],
  ]
  for (const [id, label] of checkIds) {
    const { count, error } = await brevoRecentByTemplate(brevoKey, id, today)
    if (error) fail(`Brevo #${id} sends today (${label})`, JSON.stringify(error).slice(0, 160))
    else if (count > 0) ok(`Brevo #${id} sends today (${label})`, `count=${count}`)
    else fail(`Brevo #${id} sends today (${label})`, "0 sends found for today")
  }

  // Spot-check claim #4 / #12 subjects (fixed copy)
  for (const id of [4, 12]) {
    const t = byId.get(id)
    if (!t) continue
    const detail = await fetch(`https://api.brevo.com/v3/smtp/templates/${id}`, {
      headers: { "api-key": brevoKey, accept: "application/json" },
    })
    const full = await detail.json()
    const html = String(full.htmlContent || "")
    const bad = /admin will review|awaiting admin approval/i.test(html)
    !bad
      ? ok(`Brevo #${id} copy not admin-approve outdated`)
      : fail(`Brevo #${id} copy not admin-approve outdated`, "still mentions admin review")
  }

  console.log("\n=== SUMMARY ===")
  const pass = results.filter((r) => r.status === "PASS").length
  const fails = results.filter((r) => r.status === "FAIL")
  const skips = results.filter((r) => r.status === "SKIP").length
  console.log(`PASS=${pass} FAIL=${fails.length} SKIP=${skips}`)
  if (fails.length) {
    console.log("Failures:")
    for (const f of fails) console.log(` - ${f.name}: ${f.detail}`)
  }
  process.exit(fails.length ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
