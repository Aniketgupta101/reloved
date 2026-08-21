const STORAGE_KEY = "reloved_partner_token"

export function getPartnerToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setPartnerToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token)
}

export function clearPartnerToken(): void {
  localStorage.removeItem(STORAGE_KEY)
}
