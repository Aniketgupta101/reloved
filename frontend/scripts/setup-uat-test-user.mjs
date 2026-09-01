/**
 * Ensures the UAT test donor account exists and is onboarded.
 * Run: npm run setup:uat-user
 */
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSION_FILE = path.join(__dirname, "..", "recordings", ".uat-session.json")
const API = process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"

export const UAT_TEST_USER = {
  phone: "9876501235",
  name: "UAT Test User",
  username: "uat_reviewer",
  displayPhone: "+91 9876501235",
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
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

async function loginWithOtp() {
  const { phone } = UAT_TEST_USER
  const { devCode } = await api("/api/otp/request", {
    method: "POST",
    body: JSON.stringify({ channel: "sms", target: phone }),
  })
  if (!devCode) {
    throw new Error("No devCode returned — SMS OTP must be in dev/fallback mode for UAT login.")
  }
  await api("/api/otp/verify", {
    method: "POST",
    body: JSON.stringify({ channel: "sms", target: phone, code: devCode }),
  })
  const { token } = await api("/api/donor/session", {
    method: "POST",
    body: JSON.stringify({ channel: "sms", target: phone }),
  })
  return { token, devCode }
}

async function ensureProfile(token) {
  const { profile } = await api("/api/donor/profile", {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (profile?.onboardedAt) return profile

  const { profile: created } = await api("/api/donor/profile", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: UAT_TEST_USER.name,
      username: UAT_TEST_USER.username,
      gender: "women",
      phone: UAT_TEST_USER.phone,
      address: "Bandra West, Mumbai",
      addressLabel: "home",
      pincode: "400050",
    }),
  })
  return created
}

/** One OTP per recording run; reuses cached session within 25 minutes. */
export async function getUatSession({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    try {
      const cached = JSON.parse(await readFile(SESSION_FILE, "utf8"))
      if (cached.token && cached.devCode && cached.createdAt > Date.now() - 25 * 60 * 1000) {
        return cached
      }
    } catch {
      // no cache
    }
  }

  const { token, devCode } = await loginWithOtp()
  await ensureProfile(token)
  const session = { token, devCode, createdAt: Date.now() }
  await writeFile(SESSION_FILE, JSON.stringify(session, null, 2))
  return session
}

export async function ensureUatTestUser() {
  return getUatSession({ forceRefresh: true })
}

const isMain = process.argv[1]?.replace(/\\/g, "/").includes("setup-uat-test-user.mjs")
if (isMain) {
  getUatSession({ forceRefresh: true })
    .then(({ devCode }) => {
      console.log("UAT test user ready")
      console.log(`Phone: ${UAT_TEST_USER.displayPhone}`)
      console.log(`Username: @${UAT_TEST_USER.username}`)
      console.log(`OTP (this run): ${devCode}`)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
