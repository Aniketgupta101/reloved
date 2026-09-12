/**
 * Record claim/email template walkthrough + send live Brevo samples.
 *
 *   EMAIL_TO=you@gmail.com npm run record:email-flow
 *
 * - Sends templates #4 (claimer confirmation), #12 (giver notify), #13 (approved)
 * - Playwright records: claimer profile approved card + HTML template previews
 * Output: recordings/reloved-email-templates-flow.webm
 */
import { chromium } from "playwright"
import { mkdir, rename, unlink, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pause, showCaption } from "./uat-recording-helpers.mjs"
import { getUatSession } from "./setup-uat-test-user.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const BASE_URL = process.env.UAT_BASE_URL || "http://localhost:3000"
const EMAIL_TO = process.env.EMAIL_TO || "aniketgupta83003@gmail.com"
const VIDEO_NAME = "reloved-email-templates-flow.webm"
const ENV_FILE = path.resolve(
  ROOT,
  "..",
  "firebase-backend",
  "functions",
  ".env.reloved-digital",
)
const TEMPLATES_DIR = path.resolve(ROOT, "..", "firebase-backend", "email-templates")

async function loadBrevoKey() {
  const text = await readFile(ENV_FILE, "utf8")
  const line = text.split(/\r?\n/).find((l) => l.startsWith("BREVO_API_KEY="))
  if (!line) throw new Error("BREVO_API_KEY missing in .env.reloved-digital")
  return line.slice("BREVO_API_KEY=".length).trim()
}

async function sendTemplate(apiKey, templateId, params, subjectHint) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to: [{ email: EMAIL_TO, name: "Aniket" }],
      templateId,
      params,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Brevo #${templateId} failed: ${res.status} ${JSON.stringify(body)}`)
  }
  console.log(`Sent #${templateId} (${subjectHint}) -> ${EMAIL_TO} messageId=${body.messageId || "?"}`)
  return body
}

function fillParams(html, params) {
  let out = html
  for (const [k, v] of Object.entries(params)) {
    out = out.replaceAll(`{{ params.${k} }}`, String(v))
  }
  return out
}

async function writePreview(name, html) {
  const dest = path.join(OUT_DIR, name)
  await writeFile(dest, html, "utf8")
  return dest
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const apiKey = await loadBrevoKey()

  console.log("Sending live emails…")
  await sendTemplate(
    apiKey,
    4,
    { REQUESTER_NAME: "Aniket", ITEM_TITLE: "Vintage Denim Jacket" },
    "claimer confirmation",
  )
  await sendTemplate(
    apiKey,
    12,
    {
      FIRST_NAME: "Aniket",
      ITEM_TITLE: "Vintage Denim Jacket",
      PROFILE_URL: "https://reloved-digital.web.app/account",
    },
    "giver claim notify",
  )
  await sendTemplate(
    apiKey,
    13,
    {
      REQUESTER_NAME: "Aniket",
      ITEM_TITLE: "Vintage Denim Jacket",
      DECISION_LABEL: "Approved",
      DECISION_COLOR: "#5C8A22",
      DECISION_MESSAGE: "great news — your claim was approved.",
      HEADLINE: "Your claim was accepted",
      NEXT_STEPS:
        "Open your profile to see delivery notes and Open Borzo / Open Porter. The item stays ₹0 free; you pay the courier when ops books (typically ₹40–80 in Mumbai).",
      PROFILE_URL: "https://reloved-digital.web.app/account",
      CTA_LABEL: "Open your profile",
    },
    "claimer approved",
  )

  const giverHtml = fillParams(await readFile(path.join(TEMPLATES_DIR, "item-claim-notify-giver.html"), "utf8"), {
    FIRST_NAME: "Aniket",
    ITEM_TITLE: "Vintage Denim Jacket",
    PROFILE_URL: "https://reloved-digital.web.app/account",
  })
  const decisionHtml = fillParams(await readFile(path.join(TEMPLATES_DIR, "claim-decision.html"), "utf8"), {
    REQUESTER_NAME: "Aniket",
    ITEM_TITLE: "Vintage Denim Jacket",
    DECISION_LABEL: "Approved",
    DECISION_COLOR: "#5C8A22",
    DECISION_MESSAGE: "great news — your claim was approved.",
    HEADLINE: "Your claim was accepted",
    NEXT_STEPS:
      "Open your profile to see delivery notes and Open Borzo / Open Porter. The item stays ₹0 free; you pay the courier when ops books (typically ₹40–80 in Mumbai).",
    PROFILE_URL: "https://reloved-digital.web.app/account",
    CTA_LABEL: "Open your profile",
  })
  const giverPreview = await writePreview("preview-giver-notify.html", giverHtml)
  const decisionPreview = await writePreview("preview-claimer-approved.html", decisionHtml)

  const browser = await chromium.launch({
    headless: false,
    slowMo: 80,
    channel: "chrome", // installed Google Chrome (new window � not an existing tab)
  })
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1400, height: 900 } },
  })
  const page = await context.newPage()

  try {
    await showCaption(page, "Email templates sent to " + EMAIL_TO + " — check inbox")
    await pause(2500)

    await page.goto(`file://${giverPreview.replace(/\\/g, "/")}`, { waitUntil: "load" })
    await showCaption(page, "Template #12 — Giver: someone wants your item")
    await pause(3500)
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: "smooth" }))
    await pause(2000)

    await page.goto(`file://${decisionPreview.replace(/\\/g, "/")}`, { waitUntil: "load" })
    await showCaption(page, "Template #13 — Claimer: claim approved + Open profile")
    await pause(3500)
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: "smooth" }))
    await pause(2000)

    // Site: open account if local/prod available
    try {
      const session = await getUatSession({ forceRefresh: false })
      await page.addInitScript((token) => {
        localStorage.setItem("reloved_donor_token", token)
      }, session.token)
      await page.goto(`${BASE_URL}/account`, { waitUntil: "domcontentloaded", timeout: 15000 })
      await showCaption(page, "In-app: after approval — Open Borzo / Open Porter on profile")
      await pause(4000)
      await page.evaluate(() => window.scrollTo({ top: 600, behavior: "smooth" }))
      await pause(2500)
    } catch (err) {
      console.warn("Account page skip:", err?.message || err)
      await page.goto("https://reloved-digital.web.app/account", { waitUntil: "domcontentloaded" })
      await showCaption(page, "Live site account — login to see approved claim buttons")
      await pause(3000)
    }

    await showCaption(page, "Done — check Gmail for #4, #12, #13")
    await pause(2500)
  } finally {
    const video = page.video()
    await page.close()
    await context.close()
    await browser.close()
    if (video) {
      const tempPath = await video.path()
      const finalPath = path.join(OUT_DIR, VIDEO_NAME)
      try {
        await unlink(finalPath)
      } catch {
        // first run
      }
      await rename(tempPath, finalPath)
      console.log("Video:", finalPath)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
