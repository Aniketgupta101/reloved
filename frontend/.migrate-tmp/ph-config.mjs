import { chromium } from "playwright"

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.goto("https://reloved-digital.web.app/", { waitUntil: "networkidle", timeout: 60000 })
await page.waitForTimeout(3000)
const info = await page.evaluate(() => {
  const p = window.posthog
  const cfg = p.config || {}
  return {
    api_host: cfg.api_host,
    ui_host: cfg.ui_host,
    autocapture: cfg.autocapture,
    capture_pageview: cfg.capture_pageview,
    capture_pageleave: cfg.capture_pageleave,
    disable_session_recording: cfg.disable_session_recording,
    opt_out_capturing_by_default: cfg.opt_out_capturing_by_default,
    advanced_disable_decide: cfg.advanced_disable_decide,
    request_batching: cfg.request_batching,
    before_send: typeof cfg.before_send,
    property_denylist: cfg.property_denylist,
    token: (cfg.token || "").slice(0, 12),
    // internals that often explain silent drops
    __loaded: p.__loaded,
    compression: cfg.compression,
    _is_bot: p._is_bot?.(),
    isException: typeof p._is_exception,
    sessionRecordingStarted: p.sessionRecordingStarted?.(),
    // try capture and read queue if exposed
  }
})
console.log(JSON.stringify(info, null, 2))

// Fetch remote config content shape
const cfgText = await page.evaluate(async () => {
  const r = await fetch("https://us-assets.i.posthog.com/array/phc_mk3exe5ivvABYZvsVRaAUHvmcr8UaicPeXvr9j7beFPp/config.js")
  const t = await r.text()
  return t.slice(0, 2500)
})
console.log("CONFIG_JS_PREFIX:\n", cfgText)
await browser.close()
