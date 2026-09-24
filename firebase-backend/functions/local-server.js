/**
 * Local Express API (bypasses flaky Firebase Functions emulator discovery on Windows).
 * Uses live Firestore when ADC / Firebase login is available.
 * Run: node local-server.js
 *
 * Loads `.env.reloved-digital` (gitignored) into process.env before boot.
 */
const fs = require("fs")
const path = require("path")

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq < 1) continue
    const key = t.slice(0, eq).trim()
    const val = t.slice(eq + 1).trim()
    if (key && process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvFile(path.join(__dirname, ".env.reloved-digital"))
loadEnvFile(path.join(__dirname, ".env"))

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "reloved-digital"
const port = Number(process.env.PORT || 8787)
const { createApp } = require("./lib/app.js")
createApp().listen(port, "0.0.0.0", () => {
  console.log(`Reloved local API listening on http://127.0.0.1:${port}`)
  console.log(`Health: http://127.0.0.1:${port}/api/health`)
  console.log(
    `Shiprocket: ${process.env.SHIPROCKET_EMAIL ? "configured" : "missing"} · Shadowfax: ${
      process.env.SHADOWFAX_TOKEN ? "configured" : "missing"
    }`
  )
})
