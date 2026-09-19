const STORAGE_KEY = "reloved_donor_token"
const PREFS_KEY = "reloved_donor_prefs"
const LOGIN_CHANNEL_KEY = "reloved_login_channel"
const LOGIN_TARGET_KEY = "reloved_login_target"

export type DonorPrefs = {
  username?: string | null
  gender?: string | null
}

export type DonorLoginChannel = "email" | "sms" | "google"

export function getDonorToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setDonorToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token)
}

export function clearDonorToken(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(PREFS_KEY)
  sessionStorage.removeItem(LOGIN_CHANNEL_KEY)
  sessionStorage.removeItem(LOGIN_TARGET_KEY)
}

export function getDonorPrefs(): DonorPrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? (JSON.parse(raw) as DonorPrefs) : null
  } catch {
    return null
  }
}

export function setDonorPrefs(prefs: DonorPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

/** Remember how the user just signed in so onboarding can ask for the other contact. */
export function setDonorLoginContext(channel: DonorLoginChannel, target?: string | null): void {
  sessionStorage.setItem(LOGIN_CHANNEL_KEY, channel)
  if (target) sessionStorage.setItem(LOGIN_TARGET_KEY, target)
  else sessionStorage.removeItem(LOGIN_TARGET_KEY)
}

export function getDonorLoginChannel(): DonorLoginChannel | null {
  const v = sessionStorage.getItem(LOGIN_CHANNEL_KEY)
  if (v === "email" || v === "sms" || v === "google") return v
  return null
}

export function getDonorLoginTarget(): string | null {
  return sessionStorage.getItem(LOGIN_TARGET_KEY)
}

/** Decode JWT `sub` without verifying — used only to infer phone vs email session for UI. */
export function getDonorSessionUid(): string | null {
  const token = getDonorToken()
  if (!token) return null
  try {
    const part = token.split(".")[1]
    if (!part) return null
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    const json = JSON.parse(atob(padded)) as { sub?: string }
    return typeof json.sub === "string" ? json.sub : null
  } catch {
    return null
  }
}

/** true = email/Google login path; false = phone login path. */
export function isEmailLoginSession(): boolean {
  const channel = getDonorLoginChannel()
  if (channel === "sms") return false
  if (channel === "email" || channel === "google") return true
  const uid = getDonorSessionUid() || ""
  return uid.includes("@")
}
