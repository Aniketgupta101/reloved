/**
 * End-to-end call masking dry-run against live Reloved admin API + Edesy.
 *
 * Usage:
 *   node frontend/scripts/test-call-masking-e2e.mjs           # status + eligibility only
 *   node frontend/scripts/test-call-masking-e2e.mjs --live    # also initiate a real masked call
 *
 * --live will RING phones. Uses RELOVED_OPS_PRIMARY_PHONE as Party A and
 * a second number from --to=XXXXXXXXXX, or first eligible claimer on an approved claim.
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..", "..")
const ENV_PATH = path.join(ROOT, "firebase-backend", "functions", ".env.reloved-digital")
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"

const LIVE = process.argv.includes("--live")
const toArg = process.argv.find((a) => a.startsWith("--to="))?.slice(5)

function parseEnv(raw) {
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue
    const i = line.indexOf("=")
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

function last4(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-4) || "????"
}

function digits10(phone) {
  const d = String(phone || "").replace(/\D/g, "")
  if (d.length === 10) return d
  if (d.length >= 12 && d.startsWith("91")) return d.slice(-10)
  return d.length > 10 ? d.slice(-10) : d
}

async function main() {
  const env = parseEnv(await readFile(ENV_PATH, "utf8"))
  const adminEmail = env.ADMIN_EMAIL || "admin@reloved.digital"
  const adminPassword = env.ADMIN_PASSWORD
  if (!adminPassword) throw new Error("ADMIN_PASSWORD missing in env")

  console.log("\n=== CALL MASKING E2E ===")
  console.log("API:", API_BASE)
  console.log("Mode:", LIVE ? "LIVE (will ring phones)" : "DRY (status + eligibility only)")

  // 1) Admin login
  const login = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  }).then((r) => r.json())
  if (!login.token) throw new Error(`Admin login failed: ${JSON.stringify(login)}`)
  const auth = { Authorization: `Bearer ${login.token}`, "Content-Type": "application/json" }
  console.log("✓ Admin login OK")

  // 2) Masking status from live functions (uses deployed env)
  const status = await fetch(`${API_BASE}/api/admin/calls/masking-status`, { headers: auth }).then(
    (r) => r.json()
  )
  console.log("✓ Masking status:", JSON.stringify(status, null, 2))
  if (!status.configured || !status.enabled) {
    throw new Error("Call masking is NOT configured/enabled on live functions")
  }

  // 3) Local env sanity (what we expect Firebase to have)
  console.log("✓ Local env: CALL_MASKING_ENABLED=", env.CALL_MASKING_ENABLED)
  console.log("✓ Local env: EDESY key present=", Boolean(env.EDESY_API_KEY?.startsWith("vp_")))
  console.log("✓ Local env: masked DID hint=***" + last4(env.EDESY_MASKED_NUMBER_HINT))
  console.log("✓ Local env: ops primary=***" + last4(env.RELOVED_OPS_PRIMARY_PHONE || env.BORZO_OPS_PHONE))

  // 4) Find eligible claims for bridge modes
  const list = await fetch(`${API_BASE}/api/admin/item-requests?status=approved`, { headers: auth }).then(
    (r) => r.json()
  )
  const requests = list.requests || list || []
  const eligible = []
  for (const r of requests) {
    const claimer = digits10(r.requesterPhone)
    const courier = digits10(r.borzoCourier?.phone)
    const modes = []
    if (claimer && courier) modes.push("courier_to_claimer")
    if (claimer) modes.push("claimer_to_giver") // giver may still be missing
    if (courier) modes.push("courier_to_giver")
    if (modes.length) {
      eligible.push({
        id: r.id,
        title: r.item?.title || r.itemTitle,
        claimerLast4: last4(claimer),
        courierLast4: last4(courier),
        hasCourier: Boolean(courier),
        hasClaimer: Boolean(claimer),
        modes,
      })
    }
  }
  console.log(`✓ Approved claims scanned: ${requests.length}`)
  console.log(`✓ Bridge-eligible claims: ${eligible.length}`)
  for (const e of eligible.slice(0, 5)) {
    console.log(
      `  - ${e.id.slice(0, 8)}… "${e.title}" claimer ***${e.claimerLast4} courier ***${e.courierLast4} modes=${e.modes.join(",")}`
    )
  }

  // 5) Direct Edesy API ping (initiate only if --live)
  const ops = digits10(env.RELOVED_OPS_PRIMARY_PHONE || env.BORZO_OPS_PHONE)
  let partyB = digits10(toArg || "")
  let subject = null
  let mode = null

  if (!partyB) {
    // Prefer a claim with courier+claimer for courier_to_claimer
    const withBoth = eligible.find((e) => e.hasCourier && e.hasClaimer)
    if (withBoth) {
      subject = withBoth
      mode = "courier_to_claimer"
    } else if (eligible[0]) {
      subject = eligible[0]
      mode = subject.modes.includes("claimer_to_giver") ? "claimer_to_giver" : subject.modes[0]
    }
  }

  if (!LIVE) {
    console.log("\nDRY RUN COMPLETE — config is live and ready.")
    console.log("To initiate a real masked call that rings phones:")
    console.log("  node frontend/scripts/test-call-masking-e2e.mjs --live")
    console.log("  node frontend/scripts/test-call-masking-e2e.mjs --live --to=98XXXXXXXX")
    if (subject) {
      console.log(`Would use claim ${subject.id} mode=${mode}`)
    }
    return
  }

  // LIVE path
  if (partyB && ops) {
    // Direct Edesy bridge: ops → custom --to number (controlled dry-run)
    if (ops === partyB) throw new Error("Party A and Party B cannot be the same number")
    console.log(`\n→ Direct Edesy initiate: ops ***${last4(ops)} → ***${last4(partyB)}`)
    const base = (env.EDESY_API_BASE || "https://voice-api.edesy.in/v1").replace(/\/$/, "")
    const res = await fetch(`${base}/masking/calls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EDESY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ party_a: ops, party_b: partyB, max_duration_sec: 60 }),
    })
    const text = await res.text()
    let json = {}
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Edesy non-JSON (${res.status}): ${text.slice(0, 300)}`)
    }
    if (!res.ok) {
      throw new Error(`Edesy ${res.status}: ${JSON.stringify(json).slice(0, 400)}`)
    }
    const data = json.data || json
    console.log("✓ EDESY CALL INITIATED")
    console.log("  call_sid:", data.call_sid || data.callSid)
    console.log("  status:", data.status)
    console.log("  masked_number:", data.masked_number || env.EDESY_MASKED_NUMBER_HINT || null)
    console.log("\nBoth phones should ring shortly. Caller ID should show the Reloved masked DID.")
    return
  }

  if (!subject) {
    throw new Error(
      "No eligible claim with phones, and no --to= number. Pass --to=98XXXXXXXX for a controlled dry-run."
    )
  }

  console.log(`\n→ Admin mask API: claim ${subject.id} mode=${mode}`)
  const maskRes = await fetch(`${API_BASE}/api/admin/calls/mask`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      subjectType: "claim",
      subjectId: subject.id,
      mode,
    }),
  })
  const maskJson = await maskRes.json()
  if (!maskRes.ok) {
    throw new Error(`Admin mask failed (${maskRes.status}): ${JSON.stringify(maskJson)}`)
  }
  console.log("✓ MASKED CALL STARTED VIA ADMIN API")
  console.log(JSON.stringify(maskJson, null, 2))
  console.log("\nFirst party rings first; second is bridged after answer. Ops is not dialed.")
}

main().catch((err) => {
  console.error("\n✗ CALL MASKING E2E FAILED:", err.message || err)
  process.exit(1)
})
