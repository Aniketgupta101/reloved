const fs = require("fs")
const path = require("path")
const https = require("https")

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8")
)
const access = cfg.tokens.access_token

function request(method, fullPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "firestore.googleapis.com",
        path: fullPath,
        method,
        headers: { Authorization: "Bearer " + access },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => {
          let body = null
          try {
            body = b ? JSON.parse(b) : null
          } catch {
            body = b
          }
          resolve({ status: res.statusCode, body })
        })
      }
    )
    req.on("error", reject)
    req.end()
  })
}

function fieldVal(f) {
  if (!f) return null
  return f.stringValue ?? null
}

;(async () => {
  const list = await request(
    "GET",
    "/v1/projects/reloved-digital/databases/(default)/documents/donorProfiles?pageSize=300"
  )
  if (list.status !== 200) throw new Error(JSON.stringify(list.body).slice(0, 500))

  const removeEmails = new Set(["aniketgupta83003@gmail.com"])
  const removePhones = new Set(["9876501234", "9876501235", "9876501236", "9876501241", "9876501242"])
  const deleted = []
  const kept = []

  for (const doc of list.body.documents || []) {
    const f = doc.fields || {}
    const target = fieldVal(f.target) || ""
    const email = (fieldVal(f.email) || (target.includes("@") ? target : "") || "").toLowerCase()
    const phone = String(fieldVal(f.phone) || "")
      .replace(/\D/g, "")
      .slice(-10)
    const name = fieldVal(f.name) || ""
    const username = fieldVal(f.username) || ""
    const isUat = removePhones.has(phone) || /uat/i.test(name + username)
    const isAniket = removeEmails.has(email) || target.toLowerCase() === "aniketgupta83003@gmail.com"

    if (isUat || isAniket) {
      const del = await request("DELETE", "/v1/" + doc.name)
      deleted.push({ email, phone, username, name, status: del.status })
    } else {
      kept.push({ email, phone, username, name, target })
    }
  }

  console.log(JSON.stringify({ deleted, kept }, null, 2))
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
