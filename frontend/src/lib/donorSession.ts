const STORAGE_KEY = "reloved_donor_token"

export function getDonorToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setDonorToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token)
}

export function clearDonorToken(): void {
  localStorage.removeItem(STORAGE_KEY)
}
