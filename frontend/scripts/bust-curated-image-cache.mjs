/**
 * Bust cache on curated wall images after AI bg-removal redeploy.
 * Adds ?v=ai1 to curated image URLs via admin PATCH.
 */
const API_BASE =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"
const CACHE = "v=v3"

async function main() {
  const login = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.json())
  if (!login.token) throw new Error(JSON.stringify(login))

  const wall = await fetch(`${API_BASE}/api/items?status=wall`).then((r) => r.json())
  const curated = (wall.items || []).filter((it) =>
    String(it.images?.[0]?.storagePath || "").includes("/curated/"),
  )
  console.log(`Found ${curated.length} curated items`)

  let updated = 0
  for (const it of curated) {
    const img = it.images?.[0]
    if (!img?.storagePath) continue
    let path = String(img.storagePath).split("?")[0]
    const next = `${path}?${CACHE}`
    if (String(img.storagePath) === next) {
      console.log("skip", it.title)
      continue
    }
    const res = await fetch(`${API_BASE}/api/admin/items/${it.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${login.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        images: [{ ...img, storagePath: next }],
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error("fail", it.title, body)
      continue
    }
    updated++
    console.log("ok", it.title)
  }
  console.log(`Updated ${updated}/${curated.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
