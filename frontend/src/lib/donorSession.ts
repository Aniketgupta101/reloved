const STORAGE_KEY = "reloved_donor_token"
const PREFS_KEY = "reloved_donor_prefs"

export type DonorPrefs = {
  username?: string | null
  gender?: string | null
}

export function getDonorToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setDonorToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token)
}

export function clearDonorToken(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(PREFS_KEY)
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
