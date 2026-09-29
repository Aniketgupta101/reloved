/**
 * List open deliveries for today + next 2 IST days.
 *   node scripts/_tmp-list-upcoming-deliveries.js
 */
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnv(path.join(__dirname, "../.env.reloved-digital"))

function istDayKey(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
}

function addIstDays(baseKey, n) {
  const [y, m, dd] = baseKey.split("-").map(Number)
  const utc = new Date(Date.UTC(y, m - 1, dd))
  utc.setUTCDate(utc.getUTCDate() + n)
  return utc.toISOString().slice(0, 10)
}

function formatSlot(v) {
  if (!v) return "Time TBC"
  const d = new Date(v)
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

;(async () => {
  const api = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(/\/$/, "")
  const login = await fetch(`${api}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  })
  const lj = await login.json().catch(() => ({}))
  if (!lj.token) {
    console.error("login failed", login.status, lj)
    process.exit(1)
  }

  const [ovRes, ordRes] = await Promise.all([
    fetch(`${api}/api/admin/overview`, { headers: { Authorization: `Bearer ${lj.token}` } }),
    fetch(`${api}/api/admin/orders`, { headers: { Authorization: `Bearer ${lj.token}` } }),
  ])
  const ov = await ovRes.json()
  const ord = await ordRes.json()

  const today = ov.todayIst || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  const keys = new Set([today, addIstDays(today, 1), addIstDays(today, 2)])

  console.log("Today IST:", today)
  console.log("Looking at days:", [...keys].join(", "))
  console.log("Overview todayDeliveries count:", ov.counts?.todayDeliveries)

  const open = (ord.orders || []).filter((o) => {
    const ops = String(o.opsBookingStatus || "")
    const stage = String(o.handoverStage || "")
    if (stage === "received" || ops === "delivered") return false
    const slot = o.agreedSlotAt || o.proposedSlotAt
    return keys.has(istDayKey(slot))
  })

  open.sort((a, b) =>
    String(a.agreedSlotAt || a.proposedSlotAt || "").localeCompare(
      String(b.agreedSlotAt || b.proposedSlotAt || "")
    )
  )

  console.log("Open deliveries today + next 2 days:", open.length)
  for (const o of open) {
    const slot = o.agreedSlotAt || o.proposedSlotAt
    console.log(
      "-",
      istDayKey(slot),
      formatSlot(slot),
      "|",
      o.itemTitle,
      "| giver:",
      o.giverName || "?",
      "| claimer:",
      o.requesterName || "?",
      "| area:",
      o.pickupLocality || "—",
      "|",
      o.opsBookingStatus || o.handoverStage || "?",
      "| id:",
      o.id
    )
  }

  // Overview today cards (same filter as ops morning email)
  const todayCards = ov.todayDeliveries || []
  if (todayCards.length) {
    console.log("\nOverview todayDeliveries detail:")
    for (const c of todayCards) {
      const slot = c.agreedSlotAt || c.proposedSlotAt
      console.log("-", formatSlot(slot), "|", c.itemTitle, "|", c.requesterName, "|", c.opsBookingStatus || c.handoverStage)
    }
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
