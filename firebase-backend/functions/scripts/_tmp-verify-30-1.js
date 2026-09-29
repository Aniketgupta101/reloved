const fs = require("fs")
const path = require("path")

function loadEnv(p) {
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq < 1) continue
    let k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}
loadEnv(path.join(__dirname, "../.env.reloved-digital"))

function day(v) {
  if (!v) return null
  return new Date(v).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
}
function slotLabel(v) {
  if (!v) return null
  return new Date(v).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}
function dropArea(addr) {
  const s = String(addr || "")
  if (/Dombivli/i.test(s)) return "Dombivli East"
  if (/Santacruz/i.test(s)) return "Santacruz East, Mumbai"
  return s.slice(0, 60) || "—"
}

;(async () => {
  const api = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(/\/$/, "")
  const login = await fetch(`${api}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  })
  const { token } = await login.json()
  const ov = await (await fetch(`${api}/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const days = new Set(["2026-09-30", "2026-10-01"])
  const rows = [...(ov.matched || []), ...(ov.todayDeliveries || [])].filter((c) => {
    const ops = String(c.opsBookingStatus || "")
    const stage = String(c.handoverStage || "")
    if (stage === "received" || ops === "delivered") return false
    return days.has(day(c.agreedSlotAt || c.proposedSlotAt))
  })
  const seen = new Set()
  for (const c of rows.sort((a, b) => String(a.proposedSlotAt || "").localeCompare(String(b.proposedSlotAt || "")))) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    const slot = c.agreedSlotAt || c.proposedSlotAt
    console.log(
      [
        day(slot),
        c.itemTitle,
        `status=${c.handoverStage}`,
        `dropper=${c.giverName}`,
        `claimer=${c.requesterName}`,
        `pickup=${c.pickupLocality}`,
        `drop=${dropArea(c.requesterAddress)}`,
        `slot=${slotLabel(slot)}`,
        c.agreedSlotAt ? "agreed" : "proposed",
      ].join(" | ")
    )
  }
  console.log("total", seen.size)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
