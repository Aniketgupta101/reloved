/**
 * Mark curated inventory batches for F&F:
 *   Batch 1 = shirts/polos → Reloved (already claimed + delivered to NGO)
 *   Batch 2 = pants → Available (still on the Wall)
 *
 *   node scripts/apply-curated-batch-statuses.mjs
 */
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"

/** Batch 1 — main_tshirts_images (uploaded first). NGO claimed + delivered. */
const BATCH1_TITLE_NEEDLES = [
  "bluegrey striped boss polo",
  "red boss polo",
  "navy boss polo striped collar",
  "olive scotch",
  "sage giordano",
  "white giordano",
  "blauwrecords",
  "navy boss polo green tipping",
  "white boss polo contrast",
  "canali floral",
  "canali arrow",
  "brooks brothers houndstooth",
  "canali crosshatch",
  "canali geometric",
  "boss chambray polkadot",
  "hugo wavydot",
]

/** Batch 2 — main_pants_images. Keep Available. */
const BATCH2_TITLE_NEEDLES = [
  "black dress pants",
  "brooks brothers khaki",
  "boss charcoal brown",
  "armani jeans",
  "navy corduroy",
  "scotch & soda stuart",
  "scotch & soda mott",
  "brooks brothers soho",
  "scotch & soda thedrop",
  "the drop jeans",
]

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function matchesAny(title, needles) {
  const t = norm(title)
  return needles.some((n) => t.includes(norm(n)))
}

async function adminToken() {
  const login = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.json())
  if (!login.token) throw new Error(`Admin login failed: ${JSON.stringify(login)}`)
  return login.token
}

async function listItems(token) {
  const res = await fetch(`${API_BASE}/api/admin/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `List items failed (${res.status})`)
  return body.items || body || []
}

async function patchStatus(token, id, publicStatus) {
  const res = await fetch(`${API_BASE}/api/admin/items/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publicStatus }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Patch ${id} failed (${res.status})`)
  return body
}

async function main() {
  const token = await adminToken()
  console.log("Admin login OK")
  const items = await listItems(token)
  console.log(`Loaded ${items.length} admin items`)

  let batch1 = 0
  let batch2 = 0
  let skipped = 0

  for (const item of items) {
    const title = item.title || ""
    const id = item.id
    if (!id) continue

    if (matchesAny(title, BATCH1_TITLE_NEEDLES)) {
      if (item.publicStatus !== "reloved") {
        await patchStatus(token, id, "reloved")
        console.log(`BATCH1 → reloved: ${title}`)
      } else {
        console.log(`BATCH1 already reloved: ${title}`)
      }
      batch1++
      continue
    }

    if (matchesAny(title, BATCH2_TITLE_NEEDLES)) {
      if (item.publicStatus !== "available") {
        await patchStatus(token, id, "available")
        console.log(`BATCH2 → available: ${title}`)
      } else {
        console.log(`BATCH2 keep available: ${title}`)
      }
      batch2++
      continue
    }

    skipped++
  }

  console.log(`\nDone. Batch1(reloved)=${batch1} Batch2(available)=${batch2} other=${skipped}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
