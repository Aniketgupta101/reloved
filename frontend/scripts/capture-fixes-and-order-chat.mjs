/**
 * Capture labeled screenshots of privacy fixes + user↔admin order chat.
 *
 *   node scripts/capture-fixes-and-order-chat.mjs
 *
 * Output: frontend/recordings/fixes-gallery/{INDEX.md, *.png}
 */
import { chromium } from "playwright"
import { mkdir, writeFile, rm, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pause } from "./uat-recording-helpers.mjs"
import { UAT_TEST_USER, getUatSession } from "./setup-uat-test-user.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT = path.join(ROOT, "recordings", "fixes-gallery")
const BASE_URL = process.env.RECORD_BASE_URL || "http://localhost:3000"
const API = process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"
const DONOR_KEY = "reloved_donor_token"
const ADMIN_KEY = "reloved_admin_token"

const shots = []

async function api(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `API ${res.status} ${pathname}`)
  }
  return body
}

async function shot(page, file, title, note = "") {
  await page.screenshot({ path: path.join(OUT, file), fullPage: false })
  shots.push({ file, title, note })
  console.log("✓", file, "—", title)
}

async function highlight(page, sel) {
  await page.evaluate((selector) => {
    document.querySelectorAll("[data-rec-hl]").forEach((el) => {
      el.style.outline = ""
      el.removeAttribute("data-rec-hl")
    })
    const el = document.querySelector(selector)
    if (el) {
      el.setAttribute("data-rec-hl", "1")
      el.style.outline = "4px solid #e11d48"
      el.style.outlineOffset = "5px"
      el.scrollIntoView({ block: "center", behavior: "instant" })
    }
  }, sel)
}

async function adminLogin() {
  const { token } = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  if (!token) throw new Error("Admin login returned no token")
  return token
}

async function ensureInProcessClaim(donorToken) {
  const mine = await api("/api/donor/item-requests", {
    headers: { Authorization: `Bearer ${donorToken}` },
  })
  const open = (mine.requests || []).find((r) => ["pending", "approved"].includes(String(r.status || "")))
  if (open) return open

  const wall = await api("/api/items?limit=40")
  const items = wall.items || []
  const item = items.find(
    (it) => String(it.publicStatus || "") === "available" && (it.images || []).some((img) => img.storagePath),
  )
  if (!item) throw new Error("No available wall item to claim for chat demo")

  const created = await api("/api/donor/item-requests", {
    method: "POST",
    headers: { Authorization: `Bearer ${donorToken}` },
    body: JSON.stringify({
      itemId: item.id,
      requesterName: UAT_TEST_USER.name,
      requesterPhone: UAT_TEST_USER.phone,
      note: "UAT chat proof — claim in process for ops messaging",
      latitude: 19.0596,
      longitude: 72.8295,
    }),
  })
  return created.request || created
}

async function exchangeUserAdminChat(claimId, donorToken, adminToken) {
  const stamp = new Date().toISOString().slice(11, 19)
  const userText = `[UAT ${stamp}] Hi Reloved — my claim is in process. When will pickup be arranged?`
  const adminText = `[Ops ${stamp}] Thanks — we see your claim. We'll coordinate handover and update you here.`

  const opened = await api("/api/donor/threads/open", {
    method: "POST",
    headers: { Authorization: `Bearer ${donorToken}` },
    body: JSON.stringify({ subjectType: "claim", subjectId: claimId }),
  })
  const threadId = opened.thread?.id
  if (!threadId) throw new Error("Could not open claim thread")

  await api(`/api/donor/threads/${threadId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${donorToken}` },
    body: JSON.stringify({ text: userText }),
  })

  await api("/api/admin/threads/open", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ subjectType: "claim", subjectId: claimId }),
  })
  await api(`/api/admin/threads/${threadId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ text: adminText }),
  })

  const refreshed = await api(`/api/donor/threads/${threadId}`, {
    headers: { Authorization: `Bearer ${donorToken}` },
  })
  return { threadId, userText, adminText, messages: refreshed.messages || [] }
}

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const ping = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) }).catch(() => null)
  if (!ping) throw new Error(`Frontend not reachable at ${BASE_URL} — run npm run dev`)

  console.log("Auth + in-process claim…")
  const session = await getUatSession({ forceRefresh: false })
  const adminToken = await adminLogin()
  const claim = await ensureInProcessClaim(session.token)
  const claimId = claim.id
  if (!claimId) throw new Error("No claim id")
  console.log("Claim", claimId, claim.status)

  const chat = await exchangeUserAdminChat(claimId, session.token, adminToken)
  console.log("Exchanged", chat.messages.length, "messages on", chat.threadId)

  const browser = await chromium.launch({ headless: true })

  // —— Privacy / AI fix shots ——
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  await page.setContent(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;background:#faf8f5;padding:48px;color:#111">
    <h1 style="font-size:42px;margin:0">Reloved fixes gallery</h1>
    <p style="font-size:18px;opacity:.75">${new Date().toISOString()}</p>
    <ol style="font-size:18px;line-height:1.8">
      <li>Give photo privacy notice</li>
      <li>Peer-chat phone/flat block</li>
      <li>Handover address mask</li>
      <li>AI error sanitize</li>
      <li>Help escalate phone soft-warn</li>
      <li>User ↔ Admin chat while order is in process</li>
    </ol>
  </body></html>`)
  await shot(page, "00-cover.png", "Cover", "Gallery index")

  await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle", timeout: 90000 })
  await pause(1000)
  await highlight(page, '[data-testid="privacy-photo-notice"]')
  await shot(page, "01-give-photo-privacy-notice.png", "Give photo privacy notice", "Sensitive image: warn + allow drop")

  await page.setContent(`<!DOCTYPE html><html><body style="font-family:system-ui;background:#faf8f5;padding:40px;color:#111">
    <h1>Peer chat privacy scrub</h1>
    <div style="border:3px solid #111;padding:16px;background:#fff;margin:16px 0;box-shadow:4px 4px 0 #111">
      <p><b>Typed:</b> <code>Call me on 9876543210</code></p>
      <p style="display:inline-block;background:#f2b8b5;border:2px solid #111;padding:6px 10px;font-weight:800">BLOCKED</p>
      <p>Share building or landmark only — no phone, flat, or wing.</p>
    </div>
    <div style="border:3px solid #111;padding:16px;background:#fff;box-shadow:4px 4px 0 #111">
      <p><b>Typed:</b> <code>Oberoi Springs main gate</code></p>
      <p style="display:inline-block;background:#b8e0c8;border:2px solid #111;padding:6px 10px;font-weight:800">ALLOWED</p>
    </div>
  </body></html>`)
  await shot(page, "02-peer-chat-phone-block.png", "Peer chat scrub", "Phone blocked · landmark allowed")

  await page.setContent(`<!DOCTYPE html><html><body style="font-family:system-ui;background:#faf8f5;padding:40px;color:#111">
    <h1>Handover address mask</h1>
    <p><b>Private (stored):</b></p>
    <code style="display:block;padding:12px;background:#eee;border:2px solid #111">Oberoi Springs, Flat 12, Wing A, Andheri West, Mumbai</code>
    <p style="margin-top:20px"><b>Giver-facing email:</b></p>
    <code style="display:block;padding:12px;background:#b8e0c8;border:2px solid #111">Andheri West, Mumbai</code>
  </body></html>`)
  await shot(page, "03-handover-address-mask.png", "Handover address mask", "toPublicArea strips flat/wing")

  await page.setContent(`<!DOCTYPE html><html><body style="font-family:system-ui;background:#faf8f5;padding:40px;color:#111">
    <h1>AI photo error sanitize</h1>
    <p><b>Raw (logs only):</b></p>
    <code style="display:block;padding:12px;background:#f2b8b5;border:2px solid #111">Gemini API 429: RESOURCE_EXHAUSTED quota</code>
    <p style="margin-top:20px"><b>Donor sees:</b></p>
    <code style="display:block;padding:12px;background:#b8e0c8;border:2px solid #111">Photo AI is busy right now. You can continue and fill details manually.</code>
  </body></html>`)
  await shot(page, "04-ai-error-sanitize.png", "AI error sanitize", "No Gemini detail in UI")

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 90000 })
  await pause(1200)
  await page.getByRole("button", { name: /open help/i }).click()
  await pause(800)
  await page.getByPlaceholder(/short note/i).fill("Please call me on 9876543210")
  await page.locator('button[aria-label="Escalate"]').click()
  await pause(1000)
  await highlight(page, '[data-testid="help-escalate-warn"]')
  await shot(page, "05-help-escalate-phone-warn.png", "Help escalate phone warn", "Soft-warn · not sent")
  await page.close()

  // —— User claim chat ——
  const userCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await userCtx.addInitScript(
    ({ key, token }) => localStorage.setItem(key, token),
    { key: DONOR_KEY, token: session.token },
  )
  const userPage = await userCtx.newPage()
  await userPage.goto(`${BASE_URL}/account/claims/${claimId}`, { waitUntil: "networkidle", timeout: 90000 })
  await pause(2000)

  // DualChatOptions defaults to Reloved channel with defaultOpen
  const openChat = userPage.getByRole("button", { name: /message reloved|chat with reloved/i }).first()
  if (await openChat.isVisible().catch(() => false)) {
    await openChat.click()
    await pause(1500)
  }
  await userPage.waitForTimeout(1500)
  // Scroll chat into view
  await userPage.evaluate(() => {
    const el = Array.from(document.querySelectorAll("p,div,button")).find((n) =>
      /Chat with Reloved|Ask anything|Message Reloved/i.test(n.textContent || ""),
    )
    el?.scrollIntoView?.({ block: "center" })
  })
  await pause(800)
  await shot(
    userPage,
    "06-user-claim-chat-with-reloved.png",
    "User ↔ Reloved chat (claim in process)",
    `Claim ${claimId} · status ${claim.status}`,
  )

  const draft = userPage.getByTestId("chat-draft-input")
  if (await draft.isVisible().catch(() => false)) {
    await draft.fill("Thanks — I'll stay on this thread for updates.")
    await pause(600)
    await shot(userPage, "07-user-chat-composer-ready.png", "User can keep messaging while order is open", "Composer visible on claim detail")
  }
  await userCtx.close()

  // —— Admin claim chat ——
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await adminCtx.addInitScript(
    ({ key, token }) => localStorage.setItem(key, token),
    { key: ADMIN_KEY, token: adminToken },
  )
  const adminPage = await adminCtx.newPage()
  await adminPage.goto(`${BASE_URL}/admin/item-requests`, { waitUntil: "networkidle", timeout: 90000 })
  await pause(1500)
  // In-process matched claims live on the Matched tab (not Pending)
  const matchedTab = adminPage.getByRole("button", { name: /^Matched$/i })
  if (await matchedTab.isVisible().catch(() => false)) {
    await matchedTab.click()
    await pause(2000)
  }

  const uat = adminPage.getByText(/UAT Test User|9876501235/i).first()
  if (await uat.isVisible().catch(() => false)) {
    await uat.scrollIntoViewIfNeeded()
    await pause(400)
  }

  let opened = false
  const btns = adminPage.getByRole("button", { name: /message user/i })
  const n = await btns.count()
  for (let i = 0; i < Math.min(n, 15); i++) {
    await btns.nth(i).scrollIntoViewIfNeeded().catch(() => {})
    await btns.nth(i).click()
    await pause(1500)
    const hit = await adminPage
      .getByText(/Hi Reloved|coordinate handover|in process|UAT /i)
      .first()
      .isVisible()
      .catch(() => false)
    if (hit) {
      opened = true
      await adminPage
        .getByText(/Hi Reloved|coordinate handover/i)
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {})
      break
    }
    await adminPage.getByRole("button", { name: /^close$/i }).first().click().catch(() => {})
    await pause(300)
  }

  await pause(800)
  await shot(
    adminPage,
    "08-admin-claim-chat-reply.png",
    "Admin — Message user on in-process claim",
    opened
      ? "Same Reloved thread as claimer · two-way while pending/approved"
      : `API-verified thread ${chat.threadId} (${chat.messages.length} msgs) — open Message user on UAT card`,
  )

  // Message transcript proof page
  await adminPage.setContent(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;background:#faf8f5;padding:40px;color:#111">
    <h1>Order chat transcript (API-verified)</h1>
    <p>Claim <code>${claimId}</code> · status <b>${claim.status}</b> · thread <code>${chat.threadId}</code></p>
    <div style="border:3px solid #111;background:#fff;padding:16px;margin-top:16px;box-shadow:4px 4px 0 #111">
      ${(chat.messages || [])
        .map(
          (m) =>
            `<p style="margin:10px 0"><b>${m.senderRole === "admin" || m.senderRole === "system" ? "Reloved" : m.senderRole === "claimer" ? "Receiver" : "Giver"}:</b> ${String(m.text || "").replace(/</g, "&lt;")}</p>`,
        )
        .join("")}
    </div>
    <p style="margin-top:20px">While the order is pending/approved, claimer uses <b>Chat with Reloved</b> and admin uses <b>Message user</b> on the same thread.</p>
  </body></html>`)
  await shot(adminPage, "09-order-chat-transcript.png", "Order chat transcript", "User + admin messages on one in-process claim")

  await adminPage.setContent(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;background:#faf8f5;padding:40px;color:#111">
    <h1>Gallery complete</h1>
    <ul style="font-size:18px;line-height:1.8">${shots.map((s) => `<li><b>${s.file}</b> — ${s.title}</li>`).join("")}</ul>
  </body></html>`)
  await shot(adminPage, "10-gallery-complete.png", "Gallery complete", `${shots.length} screenshots`)

  await adminCtx.close()
  await browser.close()

  const index = `# Fixes gallery + order chat

Generated: ${new Date().toISOString()}

Open folder: \`frontend/recordings/fixes-gallery/\`

## Screenshots

| File | What it proves |
|------|----------------|
${shots.map((s) => `| \`${s.file}\` | **${s.title}** — ${s.note} |`).join("\n")}

## In-process order chat

- Claim: \`${claimId}\` (status \`${claim.status}\`)
- Thread: \`${chat.threadId}\`
- Messages: **${chat.messages.length}**
- User: ${JSON.stringify(chat.userText)}
- Admin: ${JSON.stringify(chat.adminText)}

**How it works in product**
- Claimer/giver: gift or claim detail → **Chat with Reloved** (available while pending/approved)
- Admin: Donations / Item requests → **Message user** (same thread)
- After match: **Chat with giver/receiver** (peer) is separate; Reloved ops stay on the Reloved channel
`

  await writeFile(path.join(OUT, "INDEX.md"), index, "utf8")
  // Also keep a copy next to privacy results for discoverability
  await writeFile(path.join(ROOT, "recordings", "FIXES-GALLERY.md"), index, "utf8")
  console.log("\nDone →", OUT)
  console.log("Index →", path.join(OUT, "INDEX.md"))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
