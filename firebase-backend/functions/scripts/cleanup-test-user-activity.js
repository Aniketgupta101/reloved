/**
 * Dry-run / delete given+taken activity for known test phones (and optional name match).
 * Usage:
 *   node scripts/cleanup-test-user-activity.js           # dry-run
 *   node scripts/cleanup-test-user-activity.js --apply   # delete
 */
const fs = require("fs")
const path = require("path")
const https = require("https")

const APPLY = process.argv.includes("--apply")

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8"),
)
const access = cfg.tokens.access_token

const TEST_PHONES = new Set([
  "9876501234",
  "9876501235",
  "9876501236",
  "9876501241",
  "9876501242",
  "9004819557", // Pradeep Totem — client E2E / admin test screenshots
])

// Do not wipe personal founder accounts unless --include-aniket is passed.
const TEST_EMAILS = process.argv.includes("--include-aniket")
  ? new Set(["aniketgupta83003@gmail.com"])
  : new Set()

function request(method, fullPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = https.request(
      {
        hostname: "firestore.googleapis.com",
        path: fullPath,
        method,
        headers: {
          Authorization: "Bearer " + access,
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => {
          let parsed = null
          try {
            parsed = b ? JSON.parse(b) : null
          } catch {
            parsed = b
          }
          resolve({ status: res.statusCode, body: parsed })
        })
      },
    )
    req.on("error", reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function fieldVal(f) {
  if (!f) return null
  if (f.stringValue != null) return f.stringValue
  if (f.booleanValue != null) return f.booleanValue
  if (f.integerValue != null) return Number(f.integerValue)
  if (f.doubleValue != null) return Number(f.doubleValue)
  if (f.arrayValue?.values) return f.arrayValue.values.map(fieldVal)
  return null
}

function phone10(v) {
  const d = String(v || "").replace(/\D/g, "")
  return d.length >= 10 ? d.slice(-10) : d
}

function docId(name) {
  return String(name || "").split("/").pop()
}

async function listAll(collection) {
  const docs = []
  let pageToken = ""
  do {
    const url =
      `/v1/projects/reloved-digital/databases/(default)/documents/${collection}?pageSize=300` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "")
    const list = await request("GET", url)
    if (list.status !== 200) throw new Error(`${collection}: ${JSON.stringify(list.body).slice(0, 400)}`)
    docs.push(...(list.body.documents || []))
    pageToken = list.body.nextPageToken || ""
  } while (pageToken)
  return docs
}

function isTestName(name, username) {
  const s = `${name || ""} ${username || ""}`.toLowerCase()
  return (
    /\buat\b/.test(s) ||
    s.includes("pradeep totem") ||
    s.includes("totem") && s.includes("pradeep") ||
    s.includes("test user") ||
    s.includes("uat giver") ||
    s.includes("uat claimer")
  )
}

;(async () => {
  console.log(APPLY ? "MODE: APPLY (deleting)" : "MODE: dry-run (pass --apply to delete)")

  const profiles = await listAll("donorProfiles")
  const matchedProfiles = []
  const identityKeys = new Set()

  for (const doc of profiles) {
    const f = doc.fields || {}
    const name = fieldVal(f.name) || ""
    const username = fieldVal(f.username) || ""
    const target = fieldVal(f.target) || ""
    const email = (fieldVal(f.email) || (target.includes("@") ? target : "") || "").toLowerCase()
    const phone = phone10(fieldVal(f.phone) || (target.match(/^\d/) ? target : ""))
    const hit =
      TEST_PHONES.has(phone) ||
      TEST_EMAILS.has(email) ||
      TEST_EMAILS.has(target.toLowerCase()) ||
      isTestName(name, username)

    if (!hit) continue
    matchedProfiles.push({
      id: docId(doc.name),
      name: doc.name,
      displayName: name,
      username,
      phone,
      email,
      target,
    })
    if (target) identityKeys.add(target)
    if (email) identityKeys.add(email)
    if (phone) identityKeys.add(phone)
  }

  console.log(`Matched profiles: ${matchedProfiles.length}`)
  for (const p of matchedProfiles) {
    console.log(`  - ${p.displayName || "(no name)"} @${p.username || "?"} phone=${p.phone} email=${p.email}`)
  }

  const submissions = await listAll("donationSubmissions")
  const items = await listAll("items")
  const requests = await listAll("itemRequests")
  const wallHides = await listAll("wallHides").catch(() => [])
  const notifications = await listAll("userNotifications").catch(() => [])

  const subToDelete = []
  for (const doc of submissions) {
    const f = doc.fields || {}
    const phone = phone10(fieldVal(f.phone))
    const email = String(fieldVal(f.email) || "").toLowerCase()
    const donorTarget = String(fieldVal(f.donorTarget) || fieldVal(f.target) || "")
    const name = String(fieldVal(f.firstName) || "") + " " + String(fieldVal(f.lastName) || "")
    if (
      TEST_PHONES.has(phone) ||
      identityKeys.has(phone) ||
      identityKeys.has(email) ||
      identityKeys.has(donorTarget) ||
      isTestName(name, "")
    ) {
      subToDelete.push({
        name: doc.name,
        id: docId(doc.name),
        ref: fieldVal(f.reference),
        phone,
        titleHint: fieldVal(f.itemTitle) || fieldVal(f.reference),
      })
    }
  }

  const subIds = new Set(subToDelete.map((s) => s.id))

  const itemsToDelete = []
  for (const doc of items) {
    const f = doc.fields || {}
    const submissionId = fieldVal(f.submissionId)
    const title = fieldVal(f.title) || ""
    const slug = fieldVal(f.slug) || ""
    const donor = String(fieldVal(f.donorRecognition) || "").toLowerCase()
    const phone = phone10(fieldVal(f.donorPhone) || fieldVal(f.phone))
    if (
      (submissionId && subIds.has(submissionId)) ||
      TEST_PHONES.has(phone) ||
      identityKeys.has(phone) ||
      /uat/i.test(title + slug + donor) ||
      /pradeep/i.test(donor) ||
      /^(asas+|asdf+|testing|test item)/i.test(title.trim())
    ) {
      itemsToDelete.push({
        name: doc.name,
        id: docId(doc.name),
        title,
        slug,
        submissionId,
        publicVisibility: fieldVal(f.publicVisibility),
      })
    }
  }
  const itemIds = new Set(itemsToDelete.map((i) => i.id))

  const reqToDelete = []
  for (const doc of requests) {
    const f = doc.fields || {}
    const itemId = fieldVal(f.itemId)
    const requesterTarget = String(fieldVal(f.requesterTarget) || "")
    const requesterPhone = phone10(fieldVal(f.requesterPhone))
    const requesterName = fieldVal(f.requesterName) || ""
    if (
      (itemId && itemIds.has(itemId)) ||
      identityKeys.has(requesterTarget) ||
      TEST_PHONES.has(requesterPhone) ||
      identityKeys.has(requesterPhone) ||
      isTestName(requesterName, "")
    ) {
      reqToDelete.push({
        name: doc.name,
        id: docId(doc.name),
        itemId,
        itemTitle: fieldVal(f.itemTitle),
        status: fieldVal(f.status),
        requesterPhone,
      })
    }
  }

  const hidesToDelete = []
  for (const doc of wallHides || []) {
    const f = doc.fields || {}
    const itemId = fieldVal(f.itemId)
    const claimerPhone = phone10(fieldVal(f.claimerPhone))
    const claimerTarget = String(fieldVal(f.claimerTarget) || "")
    const keys = fieldVal(f.claimerKeys) || []
    const keyHit = Array.isArray(keys) && keys.some((k) => identityKeys.has(String(k)))
    if ((itemId && itemIds.has(itemId)) || TEST_PHONES.has(claimerPhone) || identityKeys.has(claimerTarget) || keyHit) {
      hidesToDelete.push({ name: doc.name, id: docId(doc.name), itemId })
    }
  }

  const notifToDelete = []
  for (const doc of notifications || []) {
    const f = doc.fields || {}
    const donorTarget = String(fieldVal(f.donorTarget) || "")
    if (identityKeys.has(donorTarget) || TEST_PHONES.has(phone10(donorTarget))) {
      notifToDelete.push({ name: doc.name, id: docId(doc.name) })
    }
  }

  const plan = {
    profiles: matchedProfiles.length,
    submissions: subToDelete.length,
    items: itemsToDelete.length,
    itemRequests: reqToDelete.length,
    wallHides: hidesToDelete.length,
    notifications: notifToDelete.length,
    sampleItems: itemsToDelete.slice(0, 15).map((i) => ({ title: i.title, slug: i.slug })),
    sampleClaims: reqToDelete.slice(0, 15).map((r) => ({ title: r.itemTitle, status: r.status })),
  }
  console.log(JSON.stringify(plan, null, 2))

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to delete.")
    return
  }

  const deleted = { items: 0, submissions: 0, itemRequests: 0, wallHides: 0, notifications: 0, profiles: 0 }

  async function del(list, key) {
    for (const row of list) {
      const res = await request("DELETE", "/v1/" + row.name)
      if (res.status === 200 || res.status === 204) deleted[key]++
      else console.warn("FAIL", key, row.id, res.status)
    }
  }

  await del(reqToDelete, "itemRequests")
  await del(hidesToDelete, "wallHides")
  await del(notifToDelete, "notifications")
  await del(itemsToDelete, "items")
  await del(subToDelete, "submissions")

  // Claims we removed may leave curated Wall items stuck on claimed/being_matched.
  const claimedItemIds = new Set(reqToDelete.map((r) => r.itemId).filter(Boolean))
  for (const itemId of claimedItemIds) {
    if (itemIds.has(itemId)) continue
    const patch = await request(
      "PATCH",
      `/v1/projects/reloved-digital/databases/(default)/documents/items/${encodeURIComponent(itemId)}?updateMask.fieldPaths=publicStatus&updateMask.fieldPaths=updatedAt`,
      {
        fields: {
          publicStatus: { stringValue: "available" },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      },
    )
    console.log("reset item status", itemId, patch.status)
  }

  // Keep profiles so Sheetal can still log in — only clear activity unless --profiles
  if (process.argv.includes("--profiles")) {
    await del(matchedProfiles, "profiles")
  }

  console.log("Deleted:", deleted)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
