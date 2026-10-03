export const LIVE_READ_ONLY_ERROR = 'Live review is read-only.'

export const ADMIN_DATA_MODE_LABELS = Object.freeze({
  fixture: 'LOCAL FIXTURE DATA',
  'live-readonly': 'PRODUCTION · READ ONLY',
})

export function normalizeAdminDataMode(value) {
  return value === 'live-readonly' ? 'live-readonly' : 'fixture'
}

export function isLiveReadOnlyMode(value) {
  return normalizeAdminDataMode(value) === 'live-readonly'
}

export function assertAdminRequestAllowed(method, mode) {
  if (!isLiveReadOnlyMode(mode)) return
  const normalizedMethod = String(method || 'GET').toUpperCase()
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    throw new Error(LIVE_READ_ONLY_ERROR)
  }
}
