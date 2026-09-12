/**
 * Reset UAT claim quota + free Wall items stuck from test recordings.
 *
 *   npm run refresh:uat-claims
 */
import { unlink } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { UAT_TEST_USER, getUatSession } from "./setup-uat-test-user.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSION_FILE = path.join(__dirname, "..", "recordings", ".uat-session.json")
const API = process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const SEED_SECRET = process.env.SEED_SECRET || "reloved-dev-seed"

async function api(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`)
  }
  return body
}

export async function refreshUatClaimAccount({ phone = UAT_TEST_USER.phone } = {}) {
  const reset = await api("/api/dev/seed/reset-uat-claims", {
    method: "POST",
    headers: { "x-seed-secret": SEED_SECRET },
    body: JSON.stringify({ phone }),
  })
  console.log(`Deleted ${reset.deleted} claim request(s), reset ${reset.itemsReset} wall item(s)`)

  const wall = await api("/api/dev/seed/wall", {
    method: "POST",
    headers: { "x-seed-secret": SEED_SECRET },
    body: "{}",
  })
  console.log(`Wall seed ok (${wall.total} items, ${wall.updated?.length || 0} updated)`)

  const session = await getUatSession({ forceRefresh: false })
  const mine = await api("/api/donor/item-requests", {
    headers: { Authorization: `Bearer ${session.token}` },
  })
  console.log(`UAT monthlyUsed: ${mine.monthlyUsed}/${mine.monthlyLimit}`)
  return { reset, monthlyUsed: mine.monthlyUsed, monthlyLimit: mine.monthlyLimit }
}

const isMain = process.argv[1]?.replace(/\\/g, "/").includes("refresh-uat-claim-account.mjs")
if (isMain) {
  refreshUatClaimAccount()
    .then((r) => {
      if (r.monthlyUsed >= r.monthlyLimit) {
        console.warn("Still at monthly limit — check reset endpoint is deployed.")
        process.exit(1)
      }
      console.log("UAT claim account ready for recording.")
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
