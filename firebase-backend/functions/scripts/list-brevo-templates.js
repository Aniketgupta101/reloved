const fs = require("fs")
const path = "c:/Users/PC 3/Desktop/Reloved-main/Reloved-main/firebase-backend/functions/.env.reloved-digital"
for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue
  const i = line.indexOf("=")
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  let v = line.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  process.env[k] = v
}

;(async () => {
  const key = process.env.BREVO_API_KEY
  const res = await fetch("https://api.brevo.com/v3/smtp/templates?limit=50&sort=asc", {
    headers: { "api-key": key },
  })
  const body = await res.json()
  const rows = (body.templates || []).map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    active: t.isActive,
  }))
  const needed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 26, 27]
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
  console.log(
    JSON.stringify(
      {
        http: res.status,
        count: body.count,
        sender: process.env.BREVO_SENDER_EMAIL,
        needed: needed.map((id) => ({ id, ...(byId[id] || { missing: true }) })),
        allNames: rows.map((r) => `${r.id}:${r.name}`),
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
