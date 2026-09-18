/**
 * Local Express API (bypasses flaky Firebase Functions emulator discovery on Windows).
 * Uses live Firestore when ADC / Firebase login is available.
 * Run: node local-server.js
 */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "reloved-digital"
const port = Number(process.env.PORT || 8787)
const { createApp } = require("./lib/app.js")
createApp().listen(port, "0.0.0.0", () => {
  console.log(`Reloved local API listening on http://127.0.0.1:${port}`)
  console.log(`Health: http://127.0.0.1:${port}/api/health`)
})
