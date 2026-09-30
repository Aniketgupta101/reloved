export interface AdminRequestDiagnostic {
  id: number
  route: string
  method: string
  status: number | null
  durationMs: number
  at: string
  error: string | null
}

export interface AdminRuntimeDiagnostic {
  id: number
  kind: 'error' | 'unhandledrejection'
  message: string
  at: string
}

type Snapshot = {
  requests: AdminRequestDiagnostic[]
  runtimeErrors: AdminRuntimeDiagnostic[]
}

const requests: AdminRequestDiagnostic[] = []
const runtimeErrors: AdminRuntimeDiagnostic[] = []
const listeners = new Set<() => void>()
let sequence = 0
let runtimeSubscribers = 0
let stopRuntimeCapture: (() => void) | null = null

function runtimeSummary(value: string) {
  if (/chunk|dynamically imported module/i.test(value)) return 'A code bundle failed to load.'
  if (/fetch|network|connection/i.test(value)) return 'A browser network operation failed.'
  if (/resizeobserver/i.test(value)) return 'A browser layout observer reported an error.'
  return 'An uncaught browser error occurred.'
}

export function diagnosticRoute(path: string) {
  const url = new URL(path, 'https://admin.reloved.local')
  const segments = url.pathname.split('/').filter(Boolean)
  const entityIndex = segments.findIndex((segment) => [
    'drops',
    'wall',
    'claims',
    'deliveries',
    'orders',
    'submissions',
    'items',
    'item-requests',
    'contact-messages',
    'support-chats',
    'peer-chats',
  ].includes(segment))
  if (entityIndex >= 0 && segments[entityIndex + 1]) segments[entityIndex + 1] = ':id'
  const queryKeys = [...url.searchParams.keys()].sort()
  return `/${segments.join('/')}${queryKeys.length ? `?${queryKeys.join('&')}` : ''}`
}

function publish() {
  for (const listener of listeners) listener()
}

export function recordAdminRequest(entry: Omit<AdminRequestDiagnostic, 'id' | 'at' | 'route'> & { path: string }) {
  requests.unshift({
    id: ++sequence,
    route: diagnosticRoute(entry.path),
    method: entry.method,
    status: entry.status,
    durationMs: Math.round(entry.durationMs),
    at: new Date().toISOString(),
    error: entry.error
      ? entry.status == null
        ? 'Network or local request failure.'
        : `Request failed with HTTP ${entry.status}.`
      : null,
  })
  requests.splice(30)
  publish()
}

function recordRuntimeError(kind: AdminRuntimeDiagnostic['kind'], message: string) {
  runtimeErrors.unshift({ id: ++sequence, kind, message: runtimeSummary(message || ''), at: new Date().toISOString() })
  runtimeErrors.splice(20)
  publish()
}

export function getAdminDiagnostics(): Snapshot {
  return { requests: [...requests], runtimeErrors: [...runtimeErrors] }
}

export function subscribeAdminDiagnostics(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function startAdminRuntimeDiagnostics() {
  runtimeSubscribers += 1
  if (typeof window !== 'undefined' && !stopRuntimeCapture) {
    const onError = (event: ErrorEvent) => recordRuntimeError('error', event.message)
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      recordRuntimeError('unhandledrejection', reason instanceof Error ? reason.message : String(reason || ''))
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    stopRuntimeCapture = () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }
  return () => {
    runtimeSubscribers = Math.max(0, runtimeSubscribers - 1)
    if (runtimeSubscribers === 0 && stopRuntimeCapture) {
      stopRuntimeCapture()
      stopRuntimeCapture = null
    }
  }
}
