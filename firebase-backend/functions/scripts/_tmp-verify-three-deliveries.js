/**
 * Verify three upcoming proposed deliveries.
 *   node scripts/_tmp-verify-three-deliveries.js
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

function formatSlot(v) {
  if (!v) return null
  const d = new Date(v)
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

const WANTED = [
  "Adidas Track Pants",
  "Canali Men's Patterned Long-Sleeve Shirt",
  "BOSS Red Polo Shirt",
]

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
  const headers = { Authorization: `Bearer ${lj.token}` }

  const [ovRes, ordRes, reqRes] = await Promise.all([
    fetch(`${api}/api/admin/overview`, { headers }),
    fetch(`${api}/api/admin/orders`, { headers }),
    fetch(`${api}/api/admin/item-requests`, { headers }),
  ])
  const ov = await ovRes.json()
  const ord = await ordRes.json()
  const req = await reqRes.json()

  const pools = [
    ...(ord.orders || []),
    ...(ov.matched || []),
    ...(ov.todayDeliveries || []),
    ...(req.requests || req.itemRequests || []),
  ]

  const byTitle = {}
  for (const row of pools) {
    const title = String(row.itemTitle || "")
    if (!WANTED.some((w) => title.includes(w.replace(" (Regular Fit)", "")) || title.includes(w))) continue
    byTitle[row.id] = { ...byTitle[row.id], ...row }
  }

  // Prefer orders board rows when present
  for (const o of ord.orders || []) {
    const title = String(o.itemTitle || "")
    if (WANTED.some((w) => title.includes(w.replace(" (Regular Fit)", "")))) {
      byTitle[o.id] = { ...byTitle[o.id], ...o, _source: "orders" }
    }
  }

  console.log(JSON.stringify(Object.values(byTitle).map((r) => ({
    id: r.id,
    itemTitle: r.itemTitle,
    status: r.status,
    handoverStage: r.handoverStage,
    opsBookingStatus: r.opsBookingStatus,
    giverName: r.giverName,
    donorName: r.donorName,
    dropperName: r.dropperName,
    requesterName: r.requesterName,
    pickupLocality: r.pickupLocality,
    dropLocality: r.dropLocality || r.requesterLocality || r.claimerLocality,
    requesterAddress: r.requesterAddress,
    agreedSlotAt: r.agreedSlotAt,
    proposedSlotAt: r.proposedSlotAt,
    slotLabel: formatSlot(r.agreedSlotAt || r.proposedSlotAt),
    proposedOnly: !r.agreedSlotAt && !!r.proposedSlotAt,
    source: r._source || "mixed",
  })), null, 2))

  // Also dump keys from one matched card for field discovery
  const sample = (ov.matched || []).find((c) =>
    String(c.itemTitle || "").includes("Adidas") || String(c.itemTitle || "").includes("Canali") || String(c.itemTitle || "").includes("BOSS Red")
  )
  if (sample) {
    console.log("\nSample matched card keys:", Object.keys(sample).sort().join(", "))
    console.log("Sample matched card:", JSON.stringify(sample, null, 2))
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
