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

async function main() {
  const api = (process.env.PUBLIC_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api").replace(
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
  if (!login.token) throw new Error(JSON.stringify(login))
  const headers = { Authorization: `Bearer ${login.token}` }

  const pub = await (await fetch(`${api}/api/items/fred-perry-laurel-wreath-t-shirt-muo5ptjx`)).json()
  const item = pub.item
  console.log("public images", JSON.stringify(item?.images, null, 2))

  // Admin item detail if available
  for (const pathTry of [
    `/api/admin/items/${item.id}`,
    `/api/admin/donations?q=fred`,
  ]) {
    try {
      const r = await fetch(api + pathTry, { headers })
      console.log(pathTry, r.status)
      if (r.ok) {
        const j = await r.json()
        const d = j.item || j
        if (d?.donorOriginalPaths || d?.images || d?.missingOriginalImage) {
          console.log(
            "admin fields",
            JSON.stringify(
              {
                donorOriginalPaths: d.donorOriginalPaths,
                originalSource: d.originalSource,
                missingOriginalImage: d.missingOriginalImage,
                images: d.images,
                submissionId: d.submissionId,
              },
              null,
              2,
            ),
          )
        }
      }
    } catch (e) {
      console.log(pathTry, e.message)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
