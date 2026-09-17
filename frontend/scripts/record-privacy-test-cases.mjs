/**
 * Accurate privacy test-case recording — each TC is shown live on screen.
 *
 *   npm run record:privacy-tests
 *
 * Output:
 *   recordings/privacy-test-cases.webm
 *   recordings/privacy-test-cases-RESULTS.md
 *   recordings/privacy-test-cases/frames/*.png
 */
import { chromium } from "playwright"
import { mkdir, writeFile, unlink, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { pause, showCaption } from "./uat-recording-helpers.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "recordings")
const FRAME_DIR = path.join(OUT_DIR, "privacy-test-cases", "frames")
const DEST_WEBM = path.join(OUT_DIR, "privacy-test-cases.webm")
const BASE_URL = process.env.RECORD_BASE_URL || "http://localhost:3000"
const FUNCTIONS_DIR = path.resolve(ROOT, "../firebase-backend/functions")

function runUnitTests() {
  const build = spawnSync("npm", ["run", "build"], { cwd: FUNCTIONS_DIR, encoding: "utf8", shell: true })
  if (build.status !== 0) {
    return { ok: false, log: (build.stdout || "") + "\n" + (build.stderr || ""), status: build.status }
  }
  const test = spawnSync("node", ["--test", "lib/scripts/testPrivacyAssumptions.js"], {
    cwd: FUNCTIONS_DIR,
    encoding: "utf8",
    shell: true,
  })
  return {
    ok: test.status === 0,
    log: (test.stdout || "") + (test.stderr || ""),
    status: test.status,
  }
}

/** Same rules as backend privacyText + frontend privacyChatWarning (shown live in video). */
function demoHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Reloved privacy test cases</title>
<style>
  :root { --bg:#faf8f5; --ink:#111; --pink:#f7c5d0; --green:#b8e0c8; --red:#f2b8b5; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Georgia, "Times New Roman", serif; background:var(--bg); color:var(--ink); }
  header { padding:28px 40px 12px; border-bottom:3px solid #111; background:#fff; }
  h1 { margin:0; font-size:34px; letter-spacing:-.02em; }
  .sub { margin:8px 0 0; font-size:15px; opacity:.75; }
  main { padding:24px 40px 100px; max-width:980px; }
  .case { border:3px solid #111; background:#fff; margin:0 0 18px; padding:18px 20px; box-shadow:4px 4px 0 #111; }
  .case h2 { margin:0 0 10px; font-size:18px; text-transform:uppercase; letter-spacing:.06em; }
  .row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin:8px 0; }
  code { background:#eee; padding:2px 6px; border:1px solid #ccc; font-family: ui-monospace, Consolas, monospace; font-size:13px; }
  .badge { display:inline-block; font-family:system-ui,sans-serif; font-weight:800; font-size:12px; letter-spacing:.08em;
    text-transform:uppercase; padding:6px 10px; border:2px solid #111; }
  .pass { background:var(--green); }
  .fail { background:var(--red); }
  .pending { background:#ddd; }
  .live { font-family:system-ui,sans-serif; font-size:14px; line-height:1.45; }
  input, button { font: inherit; }
  input[type=text] { flex:1; min-width:220px; height:42px; padding:0 12px; border:2px solid #111; background:#fff; }
  button.run { height:42px; padding:0 14px; border:2px solid #111; background:var(--pink); font-weight:800;
    text-transform:uppercase; letter-spacing:.06em; cursor:pointer; }
  #log { margin-top:20px; border:3px solid #111; background:#111; color:#f4f1ea; padding:16px; font-family:ui-monospace,Consolas,monospace; font-size:12px; white-space:pre-wrap; min-height:80px; }
</style>
</head>
<body>
<header>
  <h1>Privacy test cases — live proof</h1>
  <p class="sub">Each row runs the same rules as production peer-chat scrub / address mask / error sanitize.</p>
</header>
<main>
  <div class="case" id="c1">
    <h2>TC-C1 Allow landmark</h2>
    <div class="row live">Input: <code id="in-c1">Meet at Oberoi Springs gate</code></div>
    <div class="row"><span class="badge pending" id="badge-c1">PENDING</span> <span id="out-c1"></span></div>
  </div>
  <div class="case" id="c2">
    <h2>TC-C2 Block phone</h2>
    <div class="row live">Input: <code id="in-c2">Call me on 9876543210</code></div>
    <div class="row"><span class="badge pending" id="badge-c2">PENDING</span> <span id="out-c2"></span></div>
  </div>
  <div class="case" id="c3">
    <h2>TC-C3 Block +91 spaced phone</h2>
    <div class="row live">Input: <code id="in-c3">+91 98765 43210 at gate</code></div>
    <div class="row"><span class="badge pending" id="badge-c3">PENDING</span> <span id="out-c3"></span></div>
  </div>
  <div class="case" id="c4">
    <h2>TC-C4 Block flat / wing</h2>
    <div class="row live">Input: <code id="in-c4">Flat 1203 wing B</code></div>
    <div class="row"><span class="badge pending" id="badge-c4">PENDING</span> <span id="out-c4"></span></div>
  </div>
  <div class="case" id="c5">
    <h2>TC-C5 Block email</h2>
    <div class="row live">Input: <code id="in-c5">email me at a@b.com</code></div>
    <div class="row"><span class="badge pending" id="badge-c5">PENDING</span> <span id="out-c5"></span></div>
  </div>
  <div class="case" id="h1">
    <h2>TC-H1 Mask handover address (toPublicArea)</h2>
    <div class="row live">Raw: <code id="in-h1">Oberoi Springs, Flat 12, Wing A, Andheri West, Mumbai</code></div>
    <div class="row live">Public: <code id="out-h1-val">—</code></div>
    <div class="row"><span class="badge pending" id="badge-h1">PENDING</span> <span id="out-h1"></span></div>
  </div>
  <div class="case" id="p1">
    <h2>TC-P1 Sanitize Gemini error (never show raw API text)</h2>
    <div class="row live">Raw error: <code id="in-p1">Gemini API 429: RESOURCE_EXHAUSTED quota</code></div>
    <div class="row live">User sees: <code id="out-p1-val">—</code></div>
    <div class="row"><span class="badge pending" id="badge-p1">PENDING</span> <span id="out-p1"></span></div>
  </div>
  <div class="case" id="interactive">
    <h2>Interactive peer-chat scrub</h2>
    <div class="row">
      <input id="draft" type="text" placeholder="Type a message…" value="" />
      <button class="run" id="try-btn" type="button">Check</button>
    </div>
    <div class="row"><span class="badge pending" id="badge-live">WAITING</span> <span id="out-live"></span></div>
  </div>
  <div id="log">Waiting to run…</div>
</main>
<script>
const EMAIL_RE = /\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/i;
const HOUSING_RE = /\\b(flat|wing|apt\\.?|apartment|floor\\s*\\d|#\\s*\\d+)\\b/i;
function hasIndianMobile(text) {
  const compact = String(text || "").replace(/[\\s\\-().]/g, "");
  return /(?:\\+?91)?[6-9]\\d{9}/.test(compact);
}
function detect(text) {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  if (hasIndianMobile(raw)) return "phone";
  if (EMAIL_RE.test(raw)) return "email";
  if (HOUSING_RE.test(raw)) return "housing";
  return null;
}
function blocked(text) { return detect(text) != null; }
function toPublicArea(raw) {
  let cleaned = String(raw || "").trim()
    .replace(/\\b(flat|apt\\.?|apartment|wing|floor|house|unit|tower|block)\\s*[#.:-]?\\s*[a-z0-9/-]+/gi, "")
    .replace(/#\\s*\\d+[a-z]?/gi, "")
    .replace(/\\s{2,}/g, " ")
    .replace(/^[,.\\s]+|[,.\\s]+$/g, "")
    .trim();
  const parts = cleaned.split(",").map(p => p.trim()).filter(Boolean);
  if (!parts.length) return "Mumbai";
  const hints = ["andheri","bandra","juhu","mumbai","parel","worli","powai","colaba","dadar"];
  const area = parts.filter(p => hints.some(h => p.toLowerCase().includes(h)));
  if (area.length) return area.slice(-2).join(", ");
  if (parts.length >= 2) return parts.slice(1).join(", ");
  return "Mumbai";
}
function sanitize(msg) {
  const lower = String(msg||"").toLowerCase();
  const fallback = "Photo AI is busy right now. You can continue and fill details manually.";
  if (!msg || lower.includes("gemini") || lower.includes("429") || lower.includes("quota") || lower.includes("api key")) return fallback;
  return msg;
}
function setBadge(id, pass, detail) {
  const b = document.getElementById(id);
  b.textContent = pass ? "PASS" : "FAIL";
  b.className = "badge " + (pass ? "pass" : "fail");
  const out = document.getElementById(id.replace("badge","out"));
  if (out) out.textContent = detail || "";
}
const log = [];
function addLog(line) {
  log.push(line);
  document.getElementById("log").textContent = log.join("\\n");
}
window.__runAll = function() {
  const results = [];
  // C1
  {
    const input = document.getElementById("in-c1").textContent;
    const pass = !blocked(input);
    setBadge("badge-c1", pass, pass ? "Allowed — landmark only" : "Should allow");
    results.push({ id:"TC-C1", pass, input });
    addLog("TC-C1 " + (pass?"PASS":"FAIL") + " input=" + input);
  }
  // C2
  {
    const input = document.getElementById("in-c2").textContent;
    const hit = detect(input);
    const pass = blocked(input) && hit === "phone";
    setBadge("badge-c2", pass, "Blocked as " + hit + " — peer chat must reject");
    results.push({ id:"TC-C2", pass, input });
    addLog("TC-C2 " + (pass?"PASS":"FAIL") + " hit=" + hit);
  }
  // C3
  {
    const input = document.getElementById("in-c3").textContent;
    const pass = blocked(input);
    setBadge("badge-c3", pass, "Blocked — +91 spaced mobile");
    results.push({ id:"TC-C3", pass, input });
    addLog("TC-C3 " + (pass?"PASS":"FAIL"));
  }
  // C4
  {
    const input = document.getElementById("in-c4").textContent;
    const hit = detect(input);
    const pass = blocked(input) && hit === "housing";
    setBadge("badge-c4", pass, "Blocked as " + hit);
    results.push({ id:"TC-C4", pass, input });
    addLog("TC-C4 " + (pass?"PASS":"FAIL") + " hit=" + hit);
  }
  // C5
  {
    const input = document.getElementById("in-c5").textContent;
    const hit = detect(input);
    const pass = blocked(input) && hit === "email";
    setBadge("badge-c5", pass, "Blocked as " + hit);
    results.push({ id:"TC-C5", pass, input });
    addLog("TC-C5 " + (pass?"PASS":"FAIL") + " hit=" + hit);
  }
  // H1
  {
    const input = document.getElementById("in-h1").textContent;
    const pub = toPublicArea(input);
    document.getElementById("out-h1-val").textContent = pub;
    const pass = !/flat/i.test(pub) && !/wing/i.test(pub);
    setBadge("badge-h1", pass, pass ? "Flat/wing stripped from giver-facing address" : "Still contains housing detail");
    results.push({ id:"TC-H1", pass, input, pub });
    addLog("TC-H1 " + (pass?"PASS":"FAIL") + " public=" + pub);
  }
  // P1
  {
    const input = document.getElementById("in-p1").textContent;
    const user = sanitize(input);
    document.getElementById("out-p1-val").textContent = user;
    const pass = !/gemini/i.test(user) && !/429/.test(user);
    setBadge("badge-p1", pass, "Raw Gemini text never shown to donor");
    results.push({ id:"TC-P1", pass, input, user });
    addLog("TC-P1 " + (pass?"PASS":"FAIL") + " userSees=" + user);
  }
  window.__results = results;
  return results;
};
document.getElementById("try-btn").onclick = () => {
  const v = document.getElementById("draft").value;
  const hit = detect(v);
  const passBlock = hit != null;
  const b = document.getElementById("badge-live");
  b.textContent = passBlock ? "BLOCK" : "ALLOW";
  b.className = "badge " + (passBlock ? "fail" : "pass");
  document.getElementById("out-live").textContent = passBlock
    ? ("Share building or landmark only — hit=" + hit)
    : "OK for peer chat";
};
</script>
</body>
</html>`
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(FRAME_DIR, `${name}.png`), fullPage: false })
}

async function highlight(page, selector) {
  await page.evaluate((sel) => {
    document.querySelectorAll("[data-rec-hl]").forEach((el) => {
      el.style.outline = ""
      el.removeAttribute("data-rec-hl")
    })
    const el = document.querySelector(sel)
    if (el) {
      el.setAttribute("data-rec-hl", "1")
      el.style.outline = "4px solid #e11d48"
      el.style.outlineOffset = "4px"
      el.scrollIntoView({ behavior: "instant", block: "center" })
    }
  }, selector)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  await rm(FRAME_DIR, { recursive: true, force: true })
  await mkdir(FRAME_DIR, { recursive: true })

  console.log("Running backend unit tests…")
  const unit = runUnitTests()
  console.log(unit.ok ? `Unit tests OK (exit ${unit.status})` : `Unit tests FAILED (exit ${unit.status})`)
  if (!unit.ok) console.error(unit.log)

  // Ensure frontend is up
  try {
    const ping = await fetch(BASE_URL, { signal: AbortSignal.timeout(4000) })
    if (!ping.ok && ping.status >= 500) throw new Error(`Frontend ${ping.status}`)
  } catch (err) {
    throw new Error(`Frontend not reachable at ${BASE_URL}. Start: npm run dev\n${err}`)
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
  })
  const page = await context.newPage()
  const video = page.video()

  const uiProof = {
    liveDemoAllPass: false,
    interactiveBlockPhone: false,
    interactiveAllowLandmark: false,
    givePrivacyNotice: false,
    helpEscalatePhoneWarn: false,
    liveResults: [],
  }

  try {
    // —— Scene 1: live HTML demo of each TC ——
    await page.setContent(demoHtml(), { waitUntil: "domcontentloaded" })
    await showCaption(page, "Scene 1 — Run each privacy test case live on screen", 2800)
    await pause(600)

    const liveResults = await page.evaluate(() => window.__runAll())
    uiProof.liveResults = liveResults
    uiProof.liveDemoAllPass = liveResults.every((r) => r.pass)
    await pause(1200)

    for (const id of ["c1", "c2", "c3", "c4", "c5", "h1", "p1"]) {
      await highlight(page, `#${id}`)
      await showCaption(page, `Showing ${id.toUpperCase()} result`, 1800)
      await shot(page, `01-${id}`)
      await pause(700)
    }

    // Interactive: block phone
    await highlight(page, "#interactive")
    await page.fill("#draft", "Call me 9876543210")
    await page.click("#try-btn")
    await pause(1000)
    uiProof.interactiveBlockPhone = (await page.locator("#badge-live").textContent()) === "BLOCK"
    await showCaption(
      page,
      uiProof.interactiveBlockPhone
        ? "PASS — typing a phone shows BLOCK for peer chat"
        : "FAIL — phone was not blocked",
      2600,
    )
    await shot(page, "02-interactive-phone")

    // Interactive: allow landmark
    await page.fill("#draft", "Oberoi Springs main gate")
    await page.click("#try-btn")
    await pause(1000)
    uiProof.interactiveAllowLandmark = (await page.locator("#badge-live").textContent()) === "ALLOW"
    await showCaption(
      page,
      uiProof.interactiveAllowLandmark
        ? "PASS — landmark text is ALLOWED"
        : "FAIL — landmark was blocked",
      2600,
    )
    await shot(page, "03-interactive-landmark")

    // —— Scene 2: real Give page ——
    await showCaption(page, "Scene 2 — Real Give flow: photo privacy notice", 2400)
    await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle", timeout: 90000 })
    await pause(1500)
    const notice = page.getByTestId("privacy-photo-notice")
    await notice.waitFor({ state: "visible", timeout: 15000 })
    await notice.scrollIntoViewIfNeeded()
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="privacy-photo-notice"]')
      if (el) {
        el.style.outline = "4px solid #e11d48"
        el.style.outlineOffset = "6px"
      }
    })
    uiProof.givePrivacyNotice = await notice.isVisible()
    await showCaption(
      page,
      uiProof.givePrivacyNotice
        ? "PASS — Give step 1 shows Photo privacy notice (sensitive image = warn, never hard-block)"
        : "FAIL — privacy notice missing on /give",
      3200,
    )
    await shot(page, "04-give-privacy-notice")
    await pause(1500)

    // —— Scene 3: help escalate phone warn (FAB is hidden on /give — use home) ——
    await showCaption(page, "Scene 3 — Home help escalate soft-warns on phone", 2400)
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 90000 })
    await pause(1500)
    const helpBtn = page.getByRole("button", { name: /open help/i })
    await helpBtn.waitFor({ state: "visible", timeout: 15000 })
    await helpBtn.click()
    await pause(1000)
    const escalateInput = page.getByPlaceholder(/short note/i)
    await escalateInput.waitFor({ state: "visible", timeout: 10000 })
    await escalateInput.fill("Please call me on 9876543210 about my gift")
    await pause(600)
    await page.locator('button[aria-label="Escalate"]').click()
    await pause(1200)
    const warn = page.getByTestId("help-escalate-warn")
    uiProof.helpEscalatePhoneWarn = await warn.isVisible().catch(() => false)
    if (uiProof.helpEscalatePhoneWarn) {
      await warn.evaluate((el) => {
        el.style.outline = "4px solid #e11d48"
        el.style.outlineOffset = "4px"
      })
    }
    await showCaption(
      page,
      uiProof.helpEscalatePhoneWarn
        ? "PASS — escalate with phone shows soft warn (not sent)"
        : "FAIL — no escalate privacy warn",
      3200,
    )
    await shot(page, "05-help-escalate-phone")
    await pause(1500)

    // —— Closing scoreboard ——
    const allUi =
      uiProof.liveDemoAllPass &&
      uiProof.interactiveBlockPhone &&
      uiProof.interactiveAllowLandmark &&
      uiProof.givePrivacyNotice &&
      uiProof.helpEscalatePhoneWarn

    await page.setContent(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;background:#faf8f5;color:#111;padding:40px">
      <h1 style="font-size:40px;margin:0 0 8px">Recording scoreboard</h1>
      <p style="font-size:20px;margin:0 0 20px">${allUi && unit.ok ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}</p>
      <ul style="font-size:18px;line-height:1.7">
        <li>${unit.ok ? "✅" : "❌"} Backend unit tests (node --test)</li>
        <li>${uiProof.liveDemoAllPass ? "✅" : "❌"} Live on-screen TC-C / TC-H / TC-P demos</li>
        <li>${uiProof.interactiveBlockPhone ? "✅" : "❌"} Interactive: phone → BLOCK</li>
        <li>${uiProof.interactiveAllowLandmark ? "✅" : "❌"} Interactive: landmark → ALLOW</li>
        <li>${uiProof.givePrivacyNotice ? "✅" : "❌"} Give /give photo privacy notice</li>
        <li>${uiProof.helpEscalatePhoneWarn ? "✅" : "❌"} Help escalate phone soft-warn</li>
      </ul>
      <p style="margin-top:24px;opacity:.7">Assumptions: Indian mobile [6-9]########, email, flat/wing; Give never hard-blocks sensitive photos.</p>
    </body></html>`)
    await showCaption(page, "End — scoreboard matches what you just saw", 3500)
    await shot(page, "06-scoreboard")
    await pause(2000)

    const resultsMd = `# Privacy test-case results (accurate recording)

Generated: ${new Date().toISOString()}

## Video
- \`frontend/recordings/privacy-test-cases.webm\`
- Frame stills: \`frontend/recordings/privacy-test-cases/frames/\`

## Backend unit tests
- Status: ${unit.ok ? "PASS" : "FAIL"} (exit ${unit.status ?? "?"})

## On-video UI proof
- Live demo all pass: **${uiProof.liveDemoAllPass}**
- Interactive phone BLOCK: **${uiProof.interactiveBlockPhone}**
- Interactive landmark ALLOW: **${uiProof.interactiveAllowLandmark}**
- Give privacy notice: **${uiProof.givePrivacyNotice}**
- Help escalate phone warn: **${uiProof.helpEscalatePhoneWarn}**

### Live demo cases
${(uiProof.liveResults || []).map((r) => `- [${r.pass ? "x" : " "}] ${r.id}`).join("\n")}

## Overall
**${allUi && unit.ok ? "PASS" : "FAIL"}**

\`\`\`
${unit.log.slice(0, 6000)}
\`\`\`
`
    await writeFile(path.join(OUT_DIR, "privacy-test-cases-RESULTS.md"), resultsMd, "utf8")

    if (!allUi || !unit.ok) process.exitCode = 1

    // Finalize video BEFORE closing browser: close page first, then saveAs.
    await page.close()
    if (video) {
      try {
        await unlink(DEST_WEBM)
      } catch {
        // none
      }
      await video.saveAs(DEST_WEBM)
    }
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }

  console.log("Wrote", DEST_WEBM)
  console.log("Wrote", path.join(OUT_DIR, "privacy-test-cases-RESULTS.md"))
  console.log("Frames", FRAME_DIR)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
