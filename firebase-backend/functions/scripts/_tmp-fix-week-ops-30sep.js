/**
 * Ops fixes 30 Sep:
 * 1) Mark 3 claims delivered (BOSS Black Polo, Black Sequin, Colorful Sling)
 * 2) Reschedule Adidas Track Pants → 2 Oct 2pm IST (keep existing Shadowfax AWB)
 * Then print this week's delivery list.
 *
 *   node scripts/_tmp-fix-week-ops-30sep.js
 */
const fs = require("fs")
const path = require("path")
const https = require("https")

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

const DELIVERED_IDS = [
  { id: "VDkajUHM7OOAzt7zQvgI", title: "BOSS Black Polo Shirt" },
  { id: "r6iPoUHLq6iT0O386ewZ", title: "Black Sequin Clutch Bag" },
  { id: "KWZ3VVQx8gwgXa2h1BD6", title: "Colorful Embroidered Sling Bag" },
]

const ADIDAS_ID = "LXyg0bBM3TW6L7axbP0v"
// 2 Oct 2026, 2:00 pm IST
const ADIDAS_SLOT_ISO = "2026-10-02T08:30:00.000Z"

function httpJson(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = body ? JSON.stringify(body) : null
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => {
          let p
          try {
            p = JSON.parse(b)
          } catch {
            p = b
          }
          resolve({ status: res.statusCode, body: p })
        })
      }
    )
    req.on("error", reject)
    if (data) req.write(data)
    req.end()
  })
}

function firestorePatch(access, docId, fields) {
  const updateMask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&")
  const body = JSON.stringify({ fields })
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "firestore.googleapis.com",
        path: `/v1/projects/reloved-digital/databases/(default)/documents/itemRequests/${docId}?${updateMask}`,
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => {
          let p
          try {
            p = JSON.parse(b)
          } catch {
            p = b
          }
          resolve({ status: res.statusCode, body: p })
        })
      }
    )
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

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

function mondayOfWeek(todayKey) {
  const [y, m, dd] = todayKey.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1, dd, 6, 30))
  const dayName = d.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "short" })
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dayNum = map[dayName]
  const offset = dayNum === 0 ? -6 : 1 - dayNum
  return addIstDays(todayKey, offset)
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

;(async () => {
  const api = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(/\/$/, "")
  const login = await httpJson("POST", `${api}/api/auth/login`, {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  })
  if (!login.body?.token) {
    console.error("login failed", login.status, login.body)
    process.exit(1)
  }
  const auth = { Authorization: `Bearer ${login.body.token}` }

  console.log("=== Mark 3 as delivered ===")
  for (const row of DELIVERED_IDS) {
    const patch = await httpJson(
      "PATCH",
      `${api}/api/admin/orders/${row.id}`,
      { opsStatus: "delivered", opsNote: "Ops: confirmed already delivered (manual)" },
      auth
    )
    const notified = patch.body?.notified
    const ops = patch.body?.order?.opsBookingStatus
    const stage = patch.body?.order?.handoverStage || patch.body?.order?.deliveryStatus
    console.log(
      patch.status,
      row.title,
      "| ops:",
      ops,
      "| delivery:",
      stage,
      "| notified:",
      notified,
      "| id:",
      row.id
    )
    if (patch.status >= 400) console.log("  err:", JSON.stringify(patch.body).slice(0, 400))
  }

  console.log("")
  console.log("=== Reschedule Adidas Track Pants → 2 Oct 2pm IST (keep Shadowfax) ===")
  const cfg = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8")
  )
  const access = cfg.tokens.access_token

  // Peek current Adidas fields via admin orders list
  const beforeOrd = await httpJson("GET", `${api}/api/admin/orders`, null, auth)
  const adidasBefore = (beforeOrd.body?.orders || []).find((o) => o.id === ADIDAS_ID)
  console.log("before:", {
    title: adidasBefore?.itemTitle,
    slot: formatSlot(adidasBefore?.agreedSlotAt || adidasBefore?.proposedSlotAt),
    awb: adidasBefore?.shadowfaxAwb,
    ops: adidasBefore?.opsBookingStatus,
    sfStatus: adidasBefore?.shadowfaxStatus,
  })

  const fsPatch = await firestorePatch(access, ADIDAS_ID, {
    agreedSlotAt: { stringValue: ADIDAS_SLOT_ISO },
    proposedSlotAt: { stringValue: ADIDAS_SLOT_ISO },
    opsBookingStatus: { stringValue: "booked" },
    handoverStage: { stringValue: "awaiting_handover" },
    opsNote: {
      stringValue: `Rescheduled to 2 Oct 2026 2:00pm IST; Shadowfax AWB ${adidasBefore?.shadowfaxAwb || "SF40777730564"}`,
    },
    updatedAt: { timestampValue: new Date().toISOString() },
  })
  console.log("firestore patch:", fsPatch.status)
  if (fsPatch.status >= 400) {
    console.error(JSON.stringify(fsPatch.body).slice(0, 500))
    process.exit(1)
  }

  const afterOrd = await httpJson("GET", `${api}/api/admin/orders`, null, auth)
  const adidasAfter = (afterOrd.body?.orders || []).find((o) => o.id === ADIDAS_ID)
  console.log("after:", {
    title: adidasAfter?.itemTitle,
    slot: formatSlot(adidasAfter?.agreedSlotAt || adidasAfter?.proposedSlotAt),
    awb: adidasAfter?.shadowfaxAwb,
    ops: adidasAfter?.opsBookingStatus,
  })

  console.log("")
  console.log("=== THIS WEEK LIST ===")
  const ov = await httpJson("GET", `${api}/api/admin/overview`, null, auth)
  const today = ov.body?.todayIst || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  const monday = mondayOfWeek(today)
  const weekKeys = []
  for (let i = 0; i < 7; i++) weekKeys.push(addIstDays(monday, i))
  const keySet = new Set(weekKeys)

  const all = (afterOrd.body?.orders || []).filter((o) => {
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
    const del = String(o.deliveryStatus || "")
    return stage === "received" || stage === "handed_over" || ops === "delivered" || del === "delivered"
  }

  const open = all.filter((o) => !isDone(o))
  const done = all.filter(isDone)

  console.log(`Week ${weekKeys[0]} → ${weekKeys[6]} IST`)
  console.log(`Total: ${all.length} (open: ${open.length}, done: ${done.length})`)
  console.log("")

  const md = [
    `# Reloved deliveries — week of ${weekKeys[0]} → ${weekKeys[6]} (IST)`,
    "",
    `Updated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
    `Total: **${all.length}** (open ${open.length}, done ${done.length})`,
    "",
    "Ops notes:",
    "- Marked delivered: BOSS Black Polo, Black Sequin Clutch, Colorful Embroidered Sling",
    "- Adidas Track Pants rescheduled to **2 Oct 2026, 2:00 pm IST** (Shadowfax)",
    "",
  ]

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
      md.push(`## ${label}`, "")
    }
    const status = isDone(o)
      ? "DONE"
      : o.opsBookingStatus || o.handoverStage || o.deliveryStatus || "?"
    const awb = o.shadowfaxAwb ? ` · SF ${o.shadowfaxAwb}` : ""
    const line = `  ${formatSlot(slot)} | ${o.itemTitle} | giver: ${o.giverName || "?"} | claimer: ${o.requesterName || "?"} | area: ${o.pickupLocality || "—"} | ${status}${awb} | id: ${o.id}`
    console.log(line)
    md.push(
      `- **${formatSlot(slot)}** — ${o.itemTitle} · ${o.giverName || "?"} → ${o.requesterName || "?"} · ${o.pickupLocality || "—"} · \`${status}\`${awb}`
    )
  }

  const outDir = path.join(process.env.USERPROFILE || ".", "Desktop", "Reloved-week-deliveries")
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `deliveries-${weekKeys[0]}-to-${weekKeys[6]}.md`)
  fs.writeFileSync(outFile, md.join("\n") + "\n", "utf8")
  console.log("")
  console.log("Wrote:", outFile)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
