// Reusable Playwright QA toolkit for adversarial end-to-end testing.
//
// This is a *toolkit*, not a fixed test script — the flows and what you're
// attacking change too much per session to hardcode. Import what you need
// into an ad hoc script written fresh for the test session, e.g.:
//
//   import { launchQaContext, captureConsoleAndNetworkErrors, failRequestsMatching,
//            delayRequestsMatching, screenshotOnFailure } from
//     '../.claude/skills/qa-e2e-tester/scripts/qa_helpers.mjs'
//
//   const { browser, context, page } = await launchQaContext()
//   const errors = captureConsoleAndNetworkErrors(page)
//   await page.goto('http://localhost:3000/give')
//   // ... drive the flow, assert things, deliberately misuse it ...
//   console.log(errors.consoleErrors, errors.failedRequests)
//   await browser.close()
//
// Run from `frontend/` (or pass an explicit cwd) so `playwright` resolves —
// same resolution trick as capture_viewports.mjs, since this script lives
// under .claude/skills/, outside any node_modules tree.

import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'

async function loadPlaywright(cwd = process.cwd()) {
  const require = createRequire(path.join(cwd, 'package.json'))
  const entry = require.resolve('playwright')
  const mod = await import(pathToFileURL(entry).href)
  return mod.chromium ?? mod.default.chromium
}

/**
 * Launch a fresh browser + context + page. Pass `cwd` if not running from
 * frontend/. `contextOptions` forwards straight to Playwright (useful for
 * e.g. a second isolated context to simulate a second concurrent user).
 */
export async function launchQaContext({ cwd, headless = true, contextOptions = {} } = {}) {
  const chromium = await loadPlaywright(cwd)
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  return { browser, context, page }
}

/**
 * Attach console-error and failed-network-request collectors to a page.
 * Returns live arrays — read them any time during or after the run.
 * A finding isn't verified until you've checked these, not just the
 * rendered UI: plenty of real bugs (a failed background request, a
 * swallowed exception) produce zero visible symptom.
 */
export function captureConsoleAndNetworkErrors(page) {
  const consoleErrors = []
  const failedRequests = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), location: msg.location() })
    }
  })
  page.on('pageerror', (err) => {
    consoleErrors.push({ text: String(err), location: null, uncaught: true })
  })
  page.on('requestfailed', (req) => {
    failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || 'unknown',
    })
  })
  page.on('response', (res) => {
    if (res.status() >= 400) {
      failedRequests.push({ url: res.url(), method: res.request().method(), status: res.status() })
    }
  })

  return { consoleErrors, failedRequests }
}

/**
 * Force every request whose URL matches `urlPattern` (string substring or
 * RegExp) to fail, as if the network/backend were down. Use this to test
 * "what happens if the submit call 500s after the user filled out a whole
 * form" without needing to actually break the backend.
 */
export async function failRequestsMatching(page, urlPattern) {
  await page.route(urlPattern, (route) => route.abort('failed'))
}

/**
 * Delay every request matching `urlPattern` by `delayMs` before letting it
 * through. Use this to test stuck-loading states, or to widen the window
 * for a race condition (e.g. delay the claim-approve request so you have
 * time to also fire a decline before it lands).
 */
export async function delayRequestsMatching(page, urlPattern, delayMs) {
  await page.route(urlPattern, async (route) => {
    await new Promise((r) => setTimeout(r, delayMs))
    await route.continue()
  })
}

/**
 * Force a specific response body/status for requests matching `urlPattern`
 * — e.g. simulate a session-expired 401 mid-flow, or an admin action
 * hitting an already-terminal-state error from the server.
 */
export async function mockResponseMatching(page, urlPattern, { status = 200, body = {}, contentType = 'application/json' } = {}) {
  await page.route(urlPattern, (route) =>
    route.fulfill({ status, contentType, body: typeof body === 'string' ? body : JSON.stringify(body) })
  )
}

/**
 * Wrap a test step; on throw, save a full-page screenshot plus the page's
 * current URL and title before re-throwing, so a failing adversarial test
 * still leaves you evidence to put in the report.
 */
export async function screenshotOnFailure(page, outDir, name, fn) {
  try {
    return await fn()
  } catch (err) {
    await mkdir(outDir, { recursive: true })
    const file = path.join(outDir, `${name.replace(/[^a-z0-9-_]+/gi, '-')}.png`)
    await page.screenshot({ path: file, fullPage: true }).catch(() => {})
    console.error(`FAILED: ${name} — screenshot: ${file} — url: ${page.url()}`)
    throw err
  }
}

/**
 * Fire the same async action N times as close together as possible, to
 * probe double-submit / race-condition handling. Returns settled results
 * (fulfilled/rejected) for all N — inspect how many "succeeded" when only
 * one should have.
 */
export async function fireConcurrently(actionFn, times = 2) {
  return Promise.allSettled(Array.from({ length: times }, () => actionFn()))
}
