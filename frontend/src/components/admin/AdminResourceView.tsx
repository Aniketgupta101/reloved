import type { ReactNode } from 'react'
import type { ReadMetadata } from '@shared/adminControlCenter'
import type { AdminResource } from '@/lib/adminResource'
import { RefreshCw } from 'lucide-react'
import { isLiveReadOnlyMode } from '@/lib/adminReadOnlyPolicy.mjs'

export const ADMIN_LIVE_READ_ONLY = isLiveReadOnlyMode(
  import.meta.env.VITE_ADMIN_DATA_MODE,
)

export function adminDate(value: string | null, timeOnly = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time not recorded'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    ...(timeOnly ? {} : { day: 'numeric', month: 'short' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
export function AdminPageHeader({
  title,
  description,
  children,
  refresh,
  refreshing,
  asOf,
}: {
  title: string
  description: string
  children?: ReactNode
  refresh: () => void
  refreshing: boolean
  asOf?: string
}) {
  return (
    <header className="admin-page-header">
      <div>
        <p className="admin-eyebrow">Reloved operations</p>
        <h1>{title}</h1>
        <p className="admin-subtitle">{description}</p>
      </div>
      <div className="admin-header-controls">
        <div className="admin-control-row">
          {children}
          <button
            type="button"
            className="admin-button"
            disabled={refreshing}
            onClick={refresh}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className="admin-updated">
          {asOf ? (
            <>
              Updated <time dateTime={asOf}>{adminDate(asOf)}</time> IST
            </>
          ) : (
            'Awaiting first snapshot'
          )}
        </p>
      </div>
    </header>
  )
}
export function ResourceNotice<T extends ReadMetadata>({
  resource,
}: {
  resource: AdminResource<T> & { refresh: () => void }
}) {
  if (resource.status === 'loading')
    return (
      <div className="admin-loading" role="status">
        Loading the latest operational snapshot…
      </div>
    )
  if (resource.status === 'error')
    return (
      <div className="admin-notice admin-notice-error" role="alert">
        <strong>Couldn’t load this view.</strong>
        <p>Data is unavailable. Retry to retrieve the latest records.</p>
        <button
          type="button"
          className="admin-button"
          onClick={resource.refresh}
          disabled={resource.refreshing}
        >
          Retry
        </button>
      </div>
    )
  if (resource.status === 'stale')
    return (
      <div className="admin-notice admin-notice-error" role="alert">
        <strong>Refresh failed · showing previous data</strong>
        <p>
          Last successful snapshot: {adminDate(resource.data!.asOf)} IST. These
          records may have changed.
        </p>
        <button
          type="button"
          className="admin-button"
          onClick={resource.refresh}
          disabled={resource.refreshing}
        >
          Retry
        </button>
      </div>
    )
  if (resource.status === 'partial')
    return (
      <div className="admin-data-caveat" role="status">
        <strong>Some details are unavailable</strong>
        <p>
          This view may omit older or linked information. Current items remain
          available; open Data details for technical context.
        </p>
      </div>
    )
  return null
}
export function SourceDetails({ data }: { data: ReadMetadata }) {
  return (
    <details className="admin-source-details">
      <summary>
        Data details{' '}
        <span
          className={`admin-status ${data.coverage === 'complete' ? 'is-sent' : 'is-skipped'}`}
        >
          {data.coverage === 'complete' ? 'Complete' : 'Check details'}
        </span>
      </summary>
      <p>{data.scope}</p>
      <ul>
        {data.sources.map((source) => (
          <li key={source.source}>
            <strong>{source.source}</strong> · {source.state} · {source.scanned}{' '}
            items checked · limit {source.limit}
            {source.reason && <p>{source.reason}</p>}
          </li>
        ))}
      </ul>
      <p>
        Snapshot: {adminDate(data.asOf)} IST. Known tester identities are
        excluded where the source supports it.
      </p>
    </details>
  )
}
