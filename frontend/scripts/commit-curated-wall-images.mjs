/**
 * Commit curated wall items using images already hosted under
 * /images/wall-items/curated/ (after firebase hosting deploy).
 *
 * Skips shirt #14 and pants #05 (same as push-curated-wall-images.mjs).
 *
 *   node scripts/commit-curated-wall-images.mjs
 */
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const HOST =
  process.env.PUBLIC_APP_URL || "https://reloved-digital.web.app"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"

const SHIRTS = [
  "01_bluegrey_striped_boss_polo.jpg",
  "02_red_boss_polo.jpg",
  "03_navy_boss_polo_striped_collar.jpg",
  "04_olive_scotchsoda_polo.jpg",
  "05_sage_giordano_polo.jpg",
  "06_white_giordano_polo.jpg",
  "07_navy_blauwrecords_print_polo.jpg",
  "08_navy_boss_polo_green_tipping.jpg",
  "09_white_boss_polo_contrast_collar.jpg",
  "10_canali_floral_print_shirt.jpg",
  "11_canali_arrow_print_shirt.jpg",
  "12_brooksbrothers_houndstooth_shirt.jpg",
  "13_canali_crosshatch_shirt.jpg",
  // skip 14 tag-only
  "15_canali_geometric_stripe_shirt.jpg",
  "16_boss_chambray_polkadot_shirt.jpg",
  "17_hugo_wavydot_shirt.jpg",
]

const PANTS = [
  "01_black_dress_pants.jpg",
  "02_brooksbrothers_khaki_chino.jpg",
  "03_boss_charcoal_brown_dress_pants.jpg",
  "04_armani_jeans.jpg",
  // skip 05 duplicate of 06
  "06_navy_corduroy_pants.jpg",
  "07_scotchsoda_stuart_mustard_chino.jpg",
  "08_brooksbrothers_soho_greyolive_chino.jpg",
  "09_scotchsoda_thedrop_jeans.jpg",
  "10_scotchsoda_mott_blue_chino.jpg",
  "11_scotchsoda_mott_green_chino.jpg",
]

function titleFromFilename(name) {
  const base = name.replace(/\.[^.]+$/, "").replace(/^\d+_/, "")
  return base
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .replace(/\bBoss\b/g, "BOSS")
    .replace(/\bBrooksbrothers\b/g, "Brooks Brothers")
    .replace(/\bScotchsoda\b/g, "Scotch & Soda")
    .replace(/\bGiordano\b/g, "Giordano")
    .replace(/\bArmani\b/g, "Armani")
    .replace(/\bHugo\b/g, "HUGO")
    .replace(/\bCanali\b/g, "Canali")
    .replace(/\s+/g, " ")
    .trim()
}

function brandFromFilename(name) {
  const lower = name.toLowerCase()
  if (lower.includes("boss") || lower.includes("hugo")) return "BOSS / HUGO"
  if (lower.includes("canali")) return "Canali"
  if (lower.includes("brooksbrothers")) return "Brooks Brothers"
  if (lower.includes("scotchsoda")) return "Scotch & Soda"
  if (lower.includes("giordano")) return "Giordano"
  if (lower.includes("armani")) return "Armani"
  if (lower.includes("blauwrecords")) return "Blauw Records"
  return null
}

function itemFrom(file, kind) {
  const title = titleFromFilename(file)
  const url = `${HOST}/images/wall-items/curated/${file}`
  return {
    storagePath: url,
    title,
    category: kind === "pants" ? "Bottoms" : "Tops",
    gender: "men",
    description: `Men's preloved ${title}. Clean and ready to rehome on the Reloved Wall of Kindness.`,
    condition: "Good",
    brand: brandFromFilename(file),
    size: null,
    quantity: 1,
    locality: "Juhu",
  }
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function main() {
  const login = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.json())
  if (!login.token) throw new Error(`Login failed: ${JSON.stringify(login)}`)

  // sanity: first image reachable
  const probe = `${HOST}/images/wall-items/curated/${SHIRTS[0]}`
  const head = await fetch(probe)
  if (!head.ok) {
    throw new Error(`Hosted image not found (${head.status}): ${probe}. Deploy hosting first.`)
  }
  console.log("Hosting OK:", probe)

  const items = [
    ...SHIRTS.map((f) => itemFrom(f, "shirts")),
    ...PANTS.map((f) => itemFrom(f, "pants")),
  ]
  console.log(`Committing ${items.length} items...`)

  let created = 0
  for (const batch of chunk(items, 10)) {
    const res = await fetch(`${API_BASE}/api/admin/bulk-upload/commit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${login.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: batch }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Commit failed: ${JSON.stringify(body)}`)
    created += (body.items || []).length
    console.log(`Saved ${body.items?.length} (total ${created})`)
  }

  console.log(`Done. ${created} items on Wall: ${HOST}/drop`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
