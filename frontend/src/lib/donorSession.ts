const STORAGE_KEY = "reloved_donor_token"
const PREFS_KEY = "reloved_donor_prefs"
const LOGIN_CHANNEL_KEY = "reloved_login_channel"
const LOGIN_TARGET_KEY = "reloved_login_target"
const AUTH_BROADCAST = "reloved-donor-auth"

export type DonorPrefs = {
  username?: string | null
  gender?: string | null
}

export type DonorLoginChannel = "email" | "sms" | "google"

function authChannel(): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel === "undefined") return null
    return new BroadcastChannel(AUTH_BROADCAST)
  } catch {
    return null
  }
}

/** Notify other open Reloved tabs that auth changed (login / logout). */
function broadcastAuth(type: "login" | "logout"): void {
  try {
    authChannel()?.postMessage({ type, at: Date.now() })
  } catch {
    /* ignore */
  }
  try {
    // storage event fallback for older browsers / same-origin tabs
    localStorage.setItem("reloved_donor_auth_ping", `${type}:${Date.now()}`)
  } catch {
    /* ignore */
  }
}

export function getDonorToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setDonorToken(token: string, opts?: { silent?: boolean }): void {
  const had = Boolean(localStorage.getItem(STORAGE_KEY))
  localStorage.setItem(STORAGE_KEY, token)
  if (!opts?.silent && !had) broadcastAuth("login")
}

export function clearDonorToken(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(PREFS_KEY)
  sessionStorage.removeItem(LOGIN_CHANNEL_KEY)
  sessionStorage.removeItem(LOGIN_TARGET_KEY)
  broadcastAuth("logout")
}

/**
 * Subscribe to cross-tab login/logout. Returns an unsubscribe fn.
 * Call onLogout when another tab signs out so this tab clears UI state.
 */
export function subscribeDonorAuth(handlers: {
  onLogout?: () => void
  onLogin?: () => void
}): () => void {
  const onMessage = (type: string) => {
    if (type === "logout") handlers.onLogout?.()
    if (type === "login") handlers.onLogin?.()
  }

  let bc: BroadcastChannel | null = null
  try {
    bc = authChannel()
    bc?.addEventListener("message", (ev: MessageEvent) => {
      const type = (ev.data as { type?: string } | null)?.type
      if (type) onMessage(type)
    })
  } catch {
    bc = null
  }

  const onStorage = (ev: StorageEvent) => {
    if (ev.key === STORAGE_KEY && ev.newValue == null) {
      handlers.onLogout?.()
      return
    }
    if (ev.key === "reloved_donor_auth_ping" && ev.newValue) {
      const type = ev.newValue.split(":")[0]
      if (type) onMessage(type)
    }
  }
  window.addEventListener("storage", onStorage)

  return () => {
    window.removeEventListener("storage", onStorage)
    try {
      bc?.close()
    } catch {
      /* ignore */
    }
  }
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

/** Only allow same-origin relative paths (blocks open redirects). */
export function safeDonorRedirect(raw: string | null | undefined, fallback = "/drop"): string {
  const value = String(raw || "").trim()
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return fallback
  return value
}
