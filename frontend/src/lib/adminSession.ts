// Own DB-backed admin session (see backend/server/routes/auth.ts) — not
// Firebase Auth. Firebase Email/Password sign-in is disabled on the
// project's console, so this is the primary login path. The backend's
// requireAdmin middleware still also accepts a Firebase ID token, so Google
// OAuth via Firebase can be layered on as a second sign-in option later.

const STORAGE_KEY = "reloved_admin_token"

export function getAdminToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setAdminToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token)
}

export function clearAdminToken(): void {
  localStorage.removeItem(STORAGE_KEY)
}
