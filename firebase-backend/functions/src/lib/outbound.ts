/** Deadlines for vendor HTTP calls. A hung vendor must not sit until the process timeout. */

export const outboundTimeout = {
  emailMs: 8_000,
  smsMs: 8_000,
  shortIoMs: 5_000,
  courierMs: 20_000,
  removeBgMs: 30_000,
  imageFetchMs: 15_000,
  relayMs: 60_000,
} as const

export function withTimeout(ms: number, init?: RequestInit): RequestInit {
  return { ...init, signal: AbortSignal.timeout(ms) }
}
