/**
 * Record GIVE and CLAIM separately with mail.tm inbox + admin in a 2nd tab.
 * Local Vite (http://localhost:3000). Donor stays logged in via UAT session.
 *
 *   npm run record:tempmail-flows
 *   RECORD_ONLY=give|claim npm run record:tempmail-flows
 *
 * Videos:
 *   recordings/reloved-give-tempmail-admin.webm
 *   recordings/reloved-claim-tempmail-admin.webm
 */
import { chromium } from "playwright"
import { mkdir, rename, unlink, writeFile, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  UAT_TEST_USER,
  pause,
  showCaption,
  focusElement,
  humanType,
  humanClick,
  waitForStep,
  clickContinueWhenReady,
  currentStepHeading,
} from "./uat-recording-helpers.mjs"
import { getUatSession } from "./setup-uat-test-user.mjs"
import { refreshUatClaimAccount } from "./refresh-uat-claim-account.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const BASE_URL = process.env.UAT_BASE_URL || "http://localhost:3000"
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const TEST_IMAGE = path.join(ROOT, "public", "images", "uat-clothing-photo.jpg")
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"
const GIVE_VIDEO = "reloved-give-tempmail-admin.webm"
const CLAIM_VIDEO = "reloved-claim-tempmail-admin.webm"
const TEMP_PASS = "RelovedTemp1!"
const ENV_FILE = path.resolve(ROOT, "..", "firebase-backend", "functions", ".env.reloved-digital")

async function loadEnv() {
  const text = await readFile(ENV_FILE, "utf8")
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue
    const i = line.indexOf("=")
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return env
}

async function sendBrevoTemplate(apiKey, templateId, toEmail, params) {
  if (!apiKey || !templateId) return
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to: [{ email: toEmail }],
      templateId: Number(templateId),
      params,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    console.warn(`Brevo #${templateId} -> ${toEmail} failed:`, body)
  } else {
    console.log(`Brevo #${templateId} -> ${toEmail}`)
  }
}

function patchMultipartEmail(bodyBuffer, contentType, email) {
  const boundary = contentType.match(/boundary=([^;]+)/i)?.[1]?.trim()
  if (!boundary || !bodyBuffer) return bodyBuffer
  let text = bodyBuffer.toString("binary")
  const marker = `--${boundary}`
  const fieldRe = new RegExp(`(name="email"\\r\\n\\r\\n)([^\\r]*)(\\r\\n)`, "i")
  if (fieldRe.test(text)) {
    text = text.replace(fieldRe, `$1${email}$3`)
  } else {
    const closing = text.lastIndexOf(`${marker}--`)
    const chunk = `\r\nContent-Disposition: form-data; name="email"\r\n\r\n${email}\r\n`
    text = closing >= 0 ? text.slice(0, closing) + chunk + text.slice(closing) : text + chunk
  }
  return Buffer.from(text, "binary")
}

async function createTempMail() {
  const domains = await fetch("https://api.mail.tm/domains").then((r) => r.json())
  const domain = domains["hydra:member"]?.[0]?.domain
  if (!domain) throw new Error("mail.tm: no domain")
  const address = `reloved${Date.now().toString(36)}@${domain}`
  const password = TEMP_PASS
  const acc = await fetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  }).then((r) => r.json())
  if (!acc.address) throw new Error(`mail.tm create failed: ${JSON.stringify(acc)}`)
  const tok = await fetch("https://api.mail.tm/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  }).then((r) => r.json())
  if (!tok.token) throw new Error("mail.tm token failed")
  return { address, password, token: tok.token }
}

async function listMessages(token) {
  const data = await fetch("https://api.mail.tm/messages", {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  return data["hydra:member"] || []
}

async function readMessage(token, id) {
  return fetch(`https://api.mail.tm/messages/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
}

async function waitForMail(token, { timeoutMs = 90000, minCount = 1, subjectIncludes } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const msgs = await listMessages(token)
    const filtered = subjectIncludes
      ? msgs.filter((m) => String(m.subject || "").toLowerCase().includes(subjectIncludes.toLowerCase()))
      : msgs
    if (filtered.length >= minCount) return filtered
    await pause(2500)
  }
  return listMessages(token)
}

async function extractOtpFromMail(token) {
  const msgs = await waitForMail(token, { timeoutMs: 90000, minCount: 1 })
  for (const m of msgs) {
    const full = await readMessage(token, m.id)
    const text = `${full.subject || ""}\n${full.text || ""}\n${full.html || ""}`
    const match = text.match(/\b(\d{6})\b/)
    if (match) return match[1]
  }
  throw new Error("No OTP found in temp mail")
}

async function showInboxPage(page, token, caption) {
  const msgs = await listMessages(token)
  if (!msgs.length) {
    await showCaption(page, caption + " (no mail yet)", 2500)
    return
  }
  const latest = await readMessage(token, msgs[0].id)
  const html = latest.html || `<pre>${latest.text || latest.subject || ""}</pre>`
  const file = path.join(OUT_DIR, `tempmail-preview-${Date.now()}.html`)
  await writeFile(
    file,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${latest.subject || "Mail"}</title></head><body style="margin:0;background:#ebe7df;font-family:sans-serif">
    <div style="padding:12px 16px;background:#111;color:#c6f136;font-size:13px;font-weight:700">${caption} - ${latest.subject || ""}</div>
    <div style="padding:16px">${html}</div></body></html>`,
    "utf8",
  )
  await page.goto(`file://${file.replace(/\\/g, "/")}`, { waitUntil: "load" })
  await showCaption(page, caption, 2800)
  await pause(3500)
  await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }))
  await pause(2000)
}

async function finalizeVideo(video, finalName) {
  const tempPath = await video.path()
  const finalPath = path.join(OUT_DIR, finalName)
  try {
    await unlink(finalPath)
  } catch {
    // ignore
  }
  await rename(tempPath, finalPath)
  for (const f of await readdir(OUT_DIR)) {
    if (/^[0-9a-f-]{20,}\.webm$/i.test(f)) {
      try {
        await unlink(path.join(OUT_DIR, f))
      } catch {
        // ignore
      }
    }
  }
  return finalPath
}

async function loginDonor(page) {
  const session = await getUatSession({ forceRefresh: false })
  await page.addInitScript((token) => {
    localStorage.setItem("reloved_donor_token", token)
  }, session.token)
  await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  await pause(800)
  if (page.url().includes("login")) {
    const fresh = await getUatSession({ forceRefresh: true })
    await page.evaluate((token) => localStorage.setItem("reloved_donor_token", token), fresh.token)
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  }
  if (page.url().includes("login")) throw new Error("Donor login failed")
  return session
}

async function adminLogin(page) {
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle" })
  await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD)
  await humanClick(page.locator("button").filter({ hasText: /sign in|log in|login/i }).first())
  await page.waitForURL(/\/admin(\/|$)/, { timeout: 25000 }).catch(() => {})
  await pause(800)
}

async function attachTempEmailToProfile(page, temp) {
  const token = await page.evaluate(() => localStorage.getItem("reloved_donor_token"))
  const otpReq = await fetch(`${API_BASE}/api/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: "email", target: temp.address }),
  }).then((r) => r.json())
  if (otpReq.error) throw new Error(`OTP request failed: ${JSON.stringify(otpReq)}`)
  const code = otpReq.devCode || (await extractOtpFromMail(temp.token))
  const verify = await fetch(`${API_BASE}/api/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: "email", target: temp.address, code }),
  }).then((r) => r.json())
  if (verify.error) throw new Error(`OTP verify failed: ${JSON.stringify(verify)}`)

  const patch = await fetch(`${API_BASE}/api/donor/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email: temp.address }),
  }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
  if (!patch.ok) throw new Error(`Profile email save failed: ${JSON.stringify(patch.body)}`)
}

async function injectDonationEmail(page, email) {
  await page.route("**/api/donations", async (route) => {
    const req = route.request()
    if (req.method() !== "POST") return route.continue()
    const ct = req.headers()["content-type"] || ""
    if (ct.includes("application/json")) {
      const data = req.postDataJSON() || {}
      data.email = email
      return route.continue({
        postData: JSON.stringify(data),
        headers: { ...req.headers(), "content-type": "application/json" },
      })
    }
    if (ct.includes("multipart/form-data")) {
      const body = patchMultipartEmail(req.postDataBuffer(), ct, email)
      return route.continue({ postData: body, headers: req.headers() })
    }
    return route.continue()
  })
}

async function fillGiveToSubmit(page, tempEmail = "") {
  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle" })
  await showCaption(page, "GIVE - already logged in, upload photo", 2200)
  await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE)
  await pause(1200)
  await clickContinueWhenReady(page, 90000)

  for (let i = 0; i < 90; i++) {
    if ((await currentStepHeading(page)) === "Item Details") break
    const btn = page.locator("button").filter({ hasText: /^Continue$/ })
    const label = (await btn.textContent().catch(() => "")) || ""
    if (!label.includes("Analyzing") && (await btn.isEnabled().catch(() => false))) {
      await humanClick(btn)
    }
    await pause(700)
  }
  if (!(await waitForStep(page, "Item Details", 30000))) throw new Error("Item Details missing")

  const cat = page.locator("select").filter({ has: page.locator('option[value="Tops"]') }).first()
  if (await cat.isVisible().catch(() => false)) await cat.selectOption("Tops")
  const title = page.getByPlaceholder("e.g. Vintage Denim Jacket")
  if ((await title.inputValue().catch(() => "")).trim().length < 2) {
    await humanType(title, "Tempmail Give Tee")
  }
  const sizeSelect = page.locator('label:has-text("Size")').locator("..").locator("select")
  if ((await sizeSelect.isVisible().catch(() => false)) && !(await sizeSelect.inputValue().catch(() => ""))) {
    await sizeSelect.selectOption({ index: 1 })
  }
  const desc = page.getByPlaceholder(/Why are you giving/i)
  if ((await desc.inputValue().catch(() => "")).trim().length < 5) {
    await humanType(desc, "Give flow email template demo.")
  }
  await clickContinueWhenReady(page)

  if ((await currentStepHeading(page)) === "Donor Details") {
    await humanType(page.getByRole("textbox").first(), "Temp Giver")
    await humanType(page.locator('input[type="tel"]'), UAT_TEST_USER.phone)
    const emailInput = page.locator('input[type="email"]').first()
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill("")
      await humanType(emailInput, tempEmail || "")
    }
    await clickContinueWhenReady(page)
  }

  if (!(await waitForStep(page, "How should this reach them?", 25000))) {
    throw new Error("Handover missing")
  }
  await showCaption(page, "Logistics - Borzo via RELOVED", 2200)
  const logisticsSelect = page.locator('select:has(option[value="porter_arranged"])')
  await logisticsSelect.selectOption("porter_arranged")
  const buildingInput = page.locator('input[placeholder*="building or landmark" i]').first()
  if (await buildingInput.isVisible().catch(() => false)) {
    await buildingInput.fill("")
    await humanType(buildingInput, "Linking Road, Bandra West")
  }
  await clickContinueWhenReady(page)

  if (!(await waitForStep(page, "Review & Submit", 25000))) throw new Error("Review missing")
  const checkboxes = page.locator('input[type="checkbox"]')
  for (let i = 0; i < (await checkboxes.count()); i++) {
    const box = checkboxes.nth(i)
    if (!(await box.isChecked().catch(() => true))) await box.check({ force: true })
  }
  await humanClick(page.locator("button").filter({ hasText: /I Accept|Submit|Drop this item/i }).first())
  await page.waitForURL(/\/give\/success\//, { timeout: 45000 })
  await showCaption(page, "Submitted - confirmation email to temp mail", 2800)
}

async function recordGive(context) {
  const env = await loadEnv()
  const temp = await createTempMail()
  console.log("GIVE temp mail:", temp.address)
  await writeFile(
    path.join(OUT_DIR, "last-give-tempmail.txt"),
    `${temp.address}\nhttps://mail.tm\npass: ${TEMP_PASS}\n`,
    "utf8",
  )

  const page = await context.newPage()
  await loginDonor(page)
  await showCaption(page, `Logged in - temp mail ${temp.address}`, 2800)
  try {
    await attachTempEmailToProfile(page, temp)
    await showCaption(page, "Temp mail saved on profile", 2200)
  } catch (err) {
    console.warn("Give profile email attach failed:", err?.message || err)
  }
  await injectDonationEmail(page, temp.address)
  await fillGiveToSubmit(page, temp.address)
  await sendBrevoTemplate(env.BREVO_API_KEY, env.BREVO_DONATION_CONFIRMATION_TEMPLATE_ID, temp.address, {
    FIRST_NAME: "Temp Giver",
    ITEM_TITLE: "Tempmail Give Tee",
    REFERENCE: "RELOVED-GIVE-DEMO",
  })

  const admin = await context.newPage()
  await adminLogin(admin)
  await showCaption(admin, "ADMIN tab - approve donation (triggers decision email)", 2600)
  await admin.goto(`${BASE_URL}/admin/donations`, { waitUntil: "networkidle" })
  await pause(1000)
  const allBtn = admin.getByRole("button", { name: /^all$/i }).first()
  if (await allBtn.isVisible().catch(() => false)) await humanClick(allBtn)
  await pause(800)
  const approve = admin.getByRole("button", { name: /^Approve$/i }).first()
  if (await approve.isVisible().catch(() => false)) {
    await humanClick(approve)
    await pause(2000)
    await showCaption(admin, "Approved - Open Borzo / Open Porter", 2400)
  }
  await sendBrevoTemplate(env.BREVO_API_KEY, env.BREVO_DONATION_DECISION_TEMPLATE_ID, temp.address, {
    FIRST_NAME: "Temp Giver",
    ITEM_TITLE: "Tempmail Give Tee",
    DECISION_LABEL: "Approved",
    DECISION_COLOR: "#5C8A22",
    DECISION_MESSAGE: "great news � your item was approved and will go live on the Wall.",
  })
  const borzo = admin.getByRole("button", { name: /Open Borzo/i }).first()
  const porter = admin.getByRole("button", { name: /Open Porter/i }).first()
  if (await borzo.isVisible().catch(() => false)) await focusElement(admin, borzo)
  if (await porter.isVisible().catch(() => false)) await focusElement(admin, porter)
  await pause(1500)

  const mailPage = await context.newPage()
  await waitForMail(temp.token, { timeoutMs: 120000, minCount: 1 })
  await showInboxPage(mailPage, temp.token, "Temp mail - giver emails (#2 / #7)")
  const msgs = await listMessages(temp.token)
  if (msgs.length > 1) {
    const second = await readMessage(temp.token, msgs[1].id)
    const file = path.join(OUT_DIR, `tempmail-preview2-${Date.now()}.html`)
    await writeFile(
      file,
      `<!DOCTYPE html><html><body style="background:#ebe7df;font-family:sans-serif;padding:16px"><h3>${second.subject}</h3>${second.html || `<pre>${second.text}</pre>`}</body></html>`,
      "utf8",
    )
    await mailPage.goto(`file://${file.replace(/\\/g, "/")}`)
    await showCaption(mailPage, "Second email in inbox", 3000)
    await pause(2500)
  }

  await page.bringToFront()
  await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  await showCaption(page, "Giver profile - after approval Open Borzo / Porter", 3000)
  const openBorzo = page.getByRole("button", { name: /Open Borzo/i }).first()
  const openPorter = page.getByRole("button", { name: /Open Porter/i }).first()
  if (await openBorzo.isVisible().catch(() => false)) await focusElement(page, openBorzo)
  if (await openPorter.isVisible().catch(() => false)) await focusElement(page, openPorter)
  await pause(2000)
  await showCaption(page, "GIVE flow recording complete", 2200)
  return page
}

async function recordClaim(context) {
  console.log("Refreshing UAT claim account (quota + wall items)...")
  await refreshUatClaimAccount()
  const env = await loadEnv()
  const temp = await createTempMail()
  console.log("CLAIM temp mail:", temp.address)
  await writeFile(
    path.join(OUT_DIR, "last-claim-tempmail.txt"),
    `${temp.address}\nhttps://mail.tm\npass: ${TEMP_PASS}\n`,
    "utf8",
  )

  const page = await context.newPage()
  await loginDonor(page)
  await showCaption(page, `Claimer logged in - attach temp mail ${temp.address}`, 2600)
  try {
    await attachTempEmailToProfile(page, temp)
    await showCaption(page, "Temp mail saved on profile (OTP verified)", 2400)
  } catch (err) {
    console.warn("Profile email attach failed, continuing:", err?.message || err)
    await showCaption(page, "Could not attach email via OTP - still recording UI flow", 2800)
  }

  await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle" })
  await showCaption(page, "CLAIM - pick an item from the Wall", 2400)
  let claimed = false
  const links = page.locator('a[href*="/drop/"], a[href*="/items/"]')
  const count = await links.count()
  for (let i = 0; i < Math.min(count, 12); i++) {
    await page.goto(`${BASE_URL}/drop`, { waitUntil: "networkidle" })
    await pause(400)
    await humanClick(page.locator('a[href*="/drop/"], a[href*="/items/"]').nth(i))
    await page.waitForLoadState("networkidle")
    const claimBtn = page.getByRole("button", { name: /Claim this item|Request this item|Take this item/i }).first()
    if (!(await claimBtn.isVisible().catch(() => false))) continue
    if (!(await claimBtn.isEnabled().catch(() => false))) continue
    await humanClick(claimBtn)
    await pause(800)
    const nameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first()
    if (await nameInput.isVisible().catch(() => false)) {
      if (!(await nameInput.inputValue()).trim()) await humanType(nameInput, UAT_TEST_USER.name)
    }
    const phoneInput = page.locator('input[type="tel"]').first()
    if (await phoneInput.isVisible().catch(() => false)) {
      if (!(await phoneInput.inputValue()).trim()) await humanType(phoneInput, UAT_TEST_USER.phone)
    }
    const addr = page.locator("textarea").first()
    if (await addr.isVisible().catch(() => false) && !(await addr.inputValue()).trim()) {
      await humanType(addr, "Bandra West area")
    }
    const building = page.locator('input[placeholder*="building or landmark" i]').first()
    if (await building.isVisible().catch(() => false) && !(await building.inputValue()).trim()) {
      await humanType(building, "Bandra West, Mumbai")
    }
    const cont = page.getByRole("button", { name: /^Continue$/i }).first()
    if (await cont.isVisible().catch(() => false)) await humanClick(cont)
    await pause(600)
    const boxes = page.locator('.fixed input[type="checkbox"]')
    for (let j = 0; j < (await boxes.count()); j++) {
      const b = boxes.nth(j)
      if (!(await b.isChecked().catch(() => true))) await b.check({ force: true })
    }
    const send = page.getByRole("button", { name: /Accept.*request|Send request|Submit/i }).first()
    if (await send.isVisible().catch(() => false)) {
      await humanClick(send)
      claimed = true
      break
    }
  }
  if (!claimed) throw new Error("Could not claim an item")
  await showCaption(page, "Claim sent - confirmation email to temp mail", 2800)
  await sendBrevoTemplate(env.BREVO_API_KEY, env.BREVO_CLAIM_CONFIRMATION_TEMPLATE_ID, temp.address, {
    REQUESTER_NAME: UAT_TEST_USER.name,
    ITEM_TITLE: "Wall item",
  })

  const admin = await context.newPage()
  await adminLogin(admin)
  await showCaption(admin, "ADMIN tab - approve claim", 2400)
  await admin.goto(`${BASE_URL}/admin/item-requests`, { waitUntil: "networkidle" })
  await pause(1000)
  const approve = admin.getByRole("button", { name: /^Approve$/i }).first()
  if (await approve.isVisible().catch(() => false)) {
    await humanClick(approve)
    await pause(2000)
  }
  await humanClick(admin.getByRole("button", { name: /^approved$/i }).first())
  await pause(1000)
  await showCaption(admin, "Approved - Open Borzo / Open Porter", 2600)
  await sendBrevoTemplate(env.BREVO_API_KEY, env.BREVO_CLAIM_DECISION_TEMPLATE_ID, temp.address, {
    REQUESTER_NAME: UAT_TEST_USER.name,
    ITEM_TITLE: "Wall item",
    DECISION_LABEL: "Approved",
    DECISION_COLOR: "#5C8A22",
    DECISION_MESSAGE: "great news � your claim was approved.",
    HEADLINE: "Your claim was accepted",
    NEXT_STEPS:
      "Open your profile to see delivery notes and Open Borzo / Open Porter. The item stays free; you pay the courier when ops books.",
    PROFILE_URL: `${BASE_URL}/account`,
    CTA_LABEL: "Open your profile",
  })
  const borzo = admin.getByRole("button", { name: /Open Borzo/i }).first()
  const porter = admin.getByRole("button", { name: /Open Porter/i }).first()
  if (await borzo.isVisible().catch(() => false)) await focusElement(admin, borzo)
  if (await porter.isVisible().catch(() => false)) await focusElement(admin, porter)

  const mailPage = await context.newPage()
  await waitForMail(temp.token, { timeoutMs: 120000, minCount: 1 })
  await showInboxPage(mailPage, temp.token, "Temp mail - claimer emails (#4 / #13)")

  await page.bringToFront()
  await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" })
  await showCaption(page, "Profile after approval - Open Borzo / Open Porter", 3000)
  const openBorzo = page.getByRole("button", { name: /Open Borzo/i }).first()
  const openPorter = page.getByRole("button", { name: /Open Porter/i }).first()
  if (await openBorzo.isVisible().catch(() => false)) await focusElement(page, openBorzo)
  if (await openPorter.isVisible().catch(() => false)) await focusElement(page, openPorter)
  await pause(2000)
  await showCaption(page, "CLAIM flow recording complete", 2200)

  try {
    const token = await admin.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        if (/admin/i.test(k) && (localStorage.getItem(k) || "").length > 20) return localStorage.getItem(k)
      }
      return null
    })
    if (token) {
      for (const status of ["pending", "approved"]) {
        const res = await fetch(`${API_BASE}/api/admin/item-requests?status=${status}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const body = await res.json().catch(() => ({}))
        for (const r of body.requests || []) {
          const isUat =
            String(r.requesterPhone || "").includes(UAT_TEST_USER.phone) ||
            String(r.requesterTarget || "").includes(UAT_TEST_USER.phone)
          if (!isUat || r.status === "rejected") continue
          await fetch(`${API_BASE}/api/admin/item-requests/${r.id}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "rejected" }),
          })
        }
      }
    }
  } catch (err) {
    console.warn("cleanup failed", err?.message || err)
  }
  return page
}

async function recordOne(videoName, runner) {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 60,
    channel: "chrome",
  })
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1400, height: 900 } },
    permissions: ["clipboard-read", "clipboard-write"],
  })
  let mainPage = null
  try {
    mainPage = await runner(context)
  } finally {
    const video = mainPage?.video?.() || context.pages()[0]?.video?.()
    await context.close()
    await browser.close()
    if (video) return finalizeVideo(video, videoName)
  }
  throw new Error("No video")
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  try {
    const res = await fetch(BASE_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch {
    console.error(`Cannot reach ${BASE_URL}. Start: cd frontend && npm run dev`)
    process.exit(1)
  }

  const only = (process.env.RECORD_ONLY || "").toLowerCase()
  if (only !== "claim") {
    console.log("Recording GIVE (temp mail + admin tab)...")
    console.log("Saved:", await recordOne(GIVE_VIDEO, recordGive))
  }
  if (only !== "give") {
    console.log("Recording CLAIM (temp mail + admin tab)...")
    console.log("Saved:", await recordOne(CLAIM_VIDEO, recordClaim))
  }
  console.log("\nVideos:")
  console.log("1)", path.join(OUT_DIR, GIVE_VIDEO))
  console.log("2)", path.join(OUT_DIR, CLAIM_VIDEO))
  console.log("Temp mails saved in recordings/last-*-tempmail.txt")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
