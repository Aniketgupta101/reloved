/**
 * List all deliveries scheduled this IST week (Mon–Sun).
 *   node scripts/_tmp-list-week-deliveries.js
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
  return new Date(v).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function mondayOfWeek(todayKey) {
  const [y, m, dd] = todayKey.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1, dd, 6, 30))
  const dayName = d.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "short" })
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dayNum = map[dayName]
  const offset = dayNum === 0 ? -6 : 1 - dayNum
  return addIstDays(todayKey, offset)
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
  const monday = mondayOfWeek(today)
  const weekKeys = []
  for (let i = 0; i < 7; i++) weekKeys.push(addIstDays(monday, i))
  const keySet = new Set(weekKeys)

  console.log("Today IST:", today)
  console.log("Week (Mon–Sun IST):", weekKeys[0], "→", weekKeys[6])
  console.log("")

  const all = (ord.orders || []).filter((o) => {
    const slot = o.agreedSlotAt || o.proposedSlotAt
    return keySet.has(istDayKey(slot))
  })

  all.sort((a, b) =>
    String(a.agreedSlotAt || a.proposedSlotAt || "").localeCompare(
      String(b.agreedSlotAt || b.proposedSlotAt || "")
    )
  )

  const isDone = (o) => {
    const ops = String(o.opsBookingStatus || "")
    const stage = String(o.handoverStage || "")
    return stage === "received" || ops === "delivered"
  }
  const open = all.filter((o) => !isDone(o))
  const done = all.filter(isDone)

  console.log(`=== THIS WEEK TOTAL: ${all.length} (open: ${open.length}, done: ${done.length}) ===`)
  console.log("")

  let lastDay = ""
  for (const o of all) {
    const slot = o.agreedSlotAt || o.proposedSlotAt
    const day = istDayKey(slot)
    if (day !== lastDay) {
      lastDay = day
      const label = new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
      const dayCount = all.filter((x) => istDayKey(x.agreedSlotAt || x.proposedSlotAt) === day).length
      console.log(`--- ${label} (${dayCount}) ---`)
    }
    const status = isDone(o) ? "DONE" : o.opsBookingStatus || o.handoverStage || "?"
    console.log(
      " ",
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
      status,
      "| id:",
      o.id
    )
  }

  if (!all.length) console.log("(none)")

  // Also write a clean markdown file on Desktop for sharing
  const lines = [
    `# Reloved deliveries — week of ${weekKeys[0]} → ${weekKeys[6]} (IST)`,
    "",
    `Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
    `Total: **${all.length}** (open ${open.length}, done ${done.length})`,
    "",
  ]
  lastDay = ""
  for (const o of all) {
    const slot = o.agreedSlotAt || o.proposedSlotAt
    const day = istDayKey(slot)
    if (day !== lastDay) {
      lastDay = day
      const label = new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "long",
        day: "numeric",
        month: "short",
      })
      lines.push(`## ${label}`)
      lines.push("")
    }
    const status = isDone(o) ? "DONE" : o.opsBookingStatus || o.handoverStage || "?"
    lines.push(
      `- **${formatSlot(slot)}** — ${o.itemTitle} · ${o.giverName || "?"} → ${o.requesterName || "?"} · ${o.pickupLocality || "—"} · \`${status}\``
    )
  }
  if (!all.length) lines.push("_No deliveries this week._")

  const outDir = path.join(process.env.USERPROFILE || ".", "Desktop", "Reloved-week-deliveries")
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `deliveries-${weekKeys[0]}-to-${weekKeys[6]}.md`)
  fs.writeFileSync(outFile, lines.join("\n") + "\n", "utf8")
  console.log("")
  console.log("Wrote:", outFile)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
