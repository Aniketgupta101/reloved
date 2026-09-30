/**
 * Strip originals from specific wrongly-mapped attach-batch items → AI-only.
 *   node scripts/strip-attach-batch-ids.js
 */
const fs = require("fs")
const path = require("path")

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = val
  }
}

loadEnv(path.join(__dirname, "../.env.reloved-digital"))

const IDS = [
  "PoyV81nJy5aNZ2QiCwGx",
  "4Hjl5nnpbR9HC8Li0eK7",
  "KJcfJcMX3TRlH1s7CEre",
  "t2vfDpQe0Uv9NU8ZQz1T",
  "gJitUUH27Wt64yEC95eI",
  "TXcaUOk7mjjLofvKbv3N",
  "ccCjlhUVieHKhss9aI9y",
  "kagjDQsHq9vLiD0u9383",
  "Oi9wvFM0rFMKjHgpRBCD",
  "92sdOO2cUPJKTyFOIOdm",
  "DRKWg0nqG8qzK7ejrWx6",
  "3fcwanlmbeqJBBcYr2l3",
  "DPcqaQXVhGmfVBzCqlXG",
  "lo90olbuGwQrrl1LZOS8",
  "eyu6IDa7BNDBhP8v2Za9",
  "1WxRhkw7r89jYaOHUPl7",
  "dLeS4yIgyB80rbN4J548",
  "o0AYZDBVu3jmSZsg9pNN",
  "XvTa34rtnGtpg7ZZcdn0",
  "NfcSsCGm9oQAAt2gXtEe",
  "Qe8362YSdagiqOKXzjpM",
  "ns4idqkgrEGFpHkCcucD",
  "rxn7nIAxe2nkj6X1QL1z",
  "wfMGEeSQmGFOs6xAIUkM",
  "FErJog33azYI7uFs8se1",
  "DOBjbBZYgFTd9DTfLE9V",
  "uKIP6YrOqqgVCUXw7HQS",
]

async function main() {
  const api = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(
    /\/$/,
    "",
  )
  const login = await (
    await fetch(`${api}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      }),
    })
  ).json()
  if (!login.token) throw new Error("login failed")
  const auth = { Authorization: `Bearer ${login.token}`, "Content-Type": "application/json" }

  const list = await (
    await fetch(`${api}/api/admin/items`, { headers: { Authorization: auth.Authorization } })
  ).json()
  const byId = new Map((list.items || []).map((i) => [i.id, i]))

  let ok = 0
  let fail = 0
  for (const id of IDS) {
    const item = byId.get(id)
    if (!item) {
      console.log(`? missing ${id}`)
      fail++
      continue
    }
    const imgs = Array.isArray(item.images) ? item.images : []
    const modelled =
      imgs.find((img) => img && img.imageType === "modelled" && img.storagePath) ||
      imgs.find((img) => img && img.bgRemoved === true && img.storagePath) ||
      imgs[0]
    if (!modelled?.storagePath) {
      console.log(`? no AI ${id} ${item.title}`)
      fail++
      continue
    }
    const images = [
      {
        storagePath: modelled.storagePath,
        imageType: "modelled",
        sortOrder: 0,
        bgRemoved: true,
      },
    ]
    const patchRes = await fetch(`${api}/api/admin/items/${id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ images }),
    })
    if (!patchRes.ok) {
      fail++
      console.log(`FAIL ${id} ${patchRes.status}`)
      continue
    }
    ok++
    console.log(`stripped ${id} · ${item.title}`)
  }
  console.log({ ok, fail, total: IDS.length })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
