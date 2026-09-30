import { Link } from 'react-router-dom'
import { ArrowUpRight, Package } from 'lucide-react'
import type {
  AdminKpi,
  AttentionItem,
  ChannelAudit,
  DeliveryRow,
  CoverageState,
  AnalyticsSeries,
} from '@shared/adminControlCenter'
import { SafeImage } from '@/components/ui/SafeImage'
import { resolveImageUrl } from '@/lib/api'
import { ADMIN_LIVE_READ_ONLY, adminDate } from './AdminResourceView'

export function AttentionActions({ item }: { item: AttentionItem }) {
  const actions = attentionOperationalActions(item)
  return <div className="admin-attention-actions">{actions.map((action, index) => action.kind === 'mutation'
    ? <button key={`${action.label}-${index}`} className="admin-button" type="button" disabled title={ADMIN_LIVE_READ_ONLY ? 'Read-only review' : 'Open the record to confirm this action'}>{action.label}{ADMIN_LIVE_READ_ONLY ? ' · Read-only' : ''}</button>
    : <Link key={`${action.label}-${index}`} className={action.primary ? 'admin-action' : 'admin-button'} to={action.href}>{action.label}{action.primary && <ArrowUpRight size={14} aria-hidden="true" />}</Link>)}</div>
}

export function attentionOperationalActions(
  item: AttentionItem,
): NonNullable<AttentionItem['actions']> {
  const actions: NonNullable<AttentionItem['actions']> = item.actions?.length
    ? [...item.actions]
    : [{ ...item.nextAction, kind: 'view' as const, primary: true }]
  const baseHref = item.nextAction.href.split('#')[0]
  let target: URL
  try {
    target = new URL(baseHref, 'https://admin.reloved.local')
  } catch {
    return actions
  }
  if (!target.searchParams.get('claimId')) return actions

  const appendViewAction = (label: string, hash: string) => {
    const href = `${baseHref}${hash}`
    if (actions.some((action) => action.href === href)) return
    actions.push({ label, href, kind: 'view', primary: false })
  }
  if (
    target.pathname === '/admin/item-requests' ||
    target.pathname === '/admin/orders'
  ) {
    appendViewAction('Contact people', '#masked-calls')
  }
  if (target.pathname === '/admin/orders') {
    appendViewAction('Courier actions', '#courier-operations')
  }
  return actions
}

export function KpiCard({ kpi }: { kpi: AdminKpi }) {
  const unavailable = kpi.value === null || kpi.state !== 'complete'
  return (
    <article className="admin-kpi">
      <Link to={kpi.href} className="admin-kpi-link">
        <span>{kpi.label}</span>
        <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
      <p className={`admin-kpi-value ${unavailable ? 'is-unavailable' : ''}`}>
        {unavailable
          ? 'Unavailable'
          : `${kpi.value.toLocaleString('en-IN')}${kpi.id === 'acceptanceRate' ? '%' : ''}`}
      </p>
      <p className="admin-kpi-scope">
        {kpi.scope.startsWith('All time')
          ? 'All time'
          : kpi.id === 'matched' ||
              kpi.id === 'completed' ||
              kpi.id === 'acceptanceRate'
            ? 'Current state of claims in range'
            : 'Selected period'}
      </p>
      <details>
        <summary>Definition & source</summary>
        <p>{kpi.definition}</p>
        <p>Source: {kpi.source}</p>
        <p>Scope: {kpi.scope}</p>
        {kpi.reason && <p>{kpi.reason}</p>}
      </details>
    </article>
  )
}

export function ActivityTrend({ series }: { series: AnalyticsSeries[] }) {
  const rows = series.filter((row) => row.points.some((point) => point.value !== null))
  if (!rows.length) return null
  const width = 760
  const height = 190
  const inset = { top: 18, right: 16, bottom: 30, left: 38 }
  const count = Math.max(1, ...rows.map((row) => row.points.length))
  const maximum = Math.max(1, ...rows.flatMap((row) => row.points.map((point) => point.value || 0)))
  const x = (index: number) => inset.left + (index / Math.max(1, count - 1)) * (width - inset.left - inset.right)
  const y = (value: number) => inset.top + (height - inset.top - inset.bottom) * (1 - value / maximum)
  const colors = { ink: '#242321', pink: '#a91465', green: '#77a92f', amber: '#b27610', blue: '#3f6c82' }
  return (
    <section className="admin-panel admin-activity-trend" aria-labelledby="overview-activity-title">
      <div className="admin-panel-header">
        <div><p className="admin-eyebrow">Selected period</p><h2 id="overview-activity-title">Give and claim submit events over time</h2></div>
        <Link to="/admin/analytics" className="admin-text-link">Open analytics →</Link>
      </div>
      <div className="admin-trend-legend" aria-hidden="true">{rows.map((row) => <span key={row.id}><i style={{ background: colors[row.color] }} />{row.label}</span>)}</div>
      <div className="admin-trend-scroll" role="region" aria-label="Give and claim submit event daily trend" tabIndex={0}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={rows.map((row) => `${row.label}: ${row.points.map((point) => point.value ?? 'unavailable').join(', ')}`).join('. ')}>
          {[0, .5, 1].map((ratio) => <g key={ratio}><line x1={inset.left} y1={inset.top + ratio * (height - inset.top - inset.bottom)} x2={width - inset.right} y2={inset.top + ratio * (height - inset.top - inset.bottom)} /><text x={inset.left - 8} y={inset.top + ratio * (height - inset.top - inset.bottom) + 4} textAnchor="end">{Math.round(maximum * (1 - ratio))}</text></g>)}
          {rows.map((row) => <g key={row.id}>
            {row.points.slice(1).map((point, index) => {
              const previous = row.points[index]
              if (previous.value === null || point.value === null) return null
              return <line key={`${row.id}-line-${index}`} x1={x(index)} y1={y(previous.value)} x2={x(index + 1)} y2={y(point.value)} style={{ stroke: colors[row.color], strokeWidth: 3, strokeLinecap: 'round' }} />
            })}
            {row.points.map((point, index) => point.value === null ? null : <circle key={`${row.id}-${index}`} cx={x(index)} cy={y(point.value)} r="3" fill={colors[row.color]} />)}
          </g>)}
        </svg>
      </div>
    </section>
  )
}
export function ChannelStatus({
  channel,
  audit,
}: {
  channel: 'email' | 'sms'
  audit: ChannelAudit
}) {
  const latest = audit.latest
  const knownAttempts =
    audit.attempts.length > 0 ||
    Object.values(audit.counts || {}).some((n) => n > 0)
  const label =
    latest?.status ||
    (audit.state !== 'complete'
      ? 'Coverage incomplete'
      : knownAttempts
        ? 'Latest time unknown'
        : 'No attempt recorded')
  return (
    <div className="admin-channel">
      <span className={`admin-status is-${latest?.status || 'neutral'}`}>
        {channel === 'sms' ? 'SMS' : 'Email'} · {label}
      </span>
      {latest?.at && (
        <span className="admin-channel-time">{adminDate(latest.at)}</span>
      )}
      {audit.state !== 'complete' && latest && (
        <span className="admin-channel-time">Partial audit coverage</span>
      )}
    </div>
  )
}
function firstImage(images: unknown[]): string {
  for (const image of images) {
    if (typeof image === 'string') return resolveImageUrl(image)
    if (image && typeof image === 'object') {
      const row = image as Record<string, unknown>
      for (const key of ['storagePath', 'storage_path', 'url'])
        if (typeof row[key] === 'string') return resolveImageUrl(row[key])
    }
  }
  return ''
}
const logisticsLabels: Record<string, string> = {
  porter_arranged: 'Reloved courier',
  reloved_courier: 'Reloved courier',
  giver_sends: 'Giver sends',
  receiver_collects: 'Claimer collects',
}
const statusLabels: Record<string, string> = {
  delivered: 'Delivered',
  received: 'Received',
  booked: 'Booked',
  out_for_delivery: 'Out for delivery',
  ready_to_book: 'Ready to book',
  in_process: 'In process',
  awaiting_address: 'Awaiting address',
  awaiting_schedule: 'Awaiting schedule',
  schedule_proposed: 'Time proposed',
}
export function DeliveryList({
  rows,
  coverage,
  emptyText,
  compact = false,
}: {
  rows: DeliveryRow[]
  coverage: CoverageState
  emptyText: string
  compact?: boolean
}) {
  if (!rows.length)
    return (
      <p className="admin-empty">
        {coverage === 'complete'
          ? emptyText
          : 'No records in the available snapshot. Full delivery coverage is unavailable.'}
      </p>
    )
  return (
    <ul className={`admin-delivery-list ${compact ? 'is-compact' : ''}`}>
      {rows.map((row) => (
        <li key={row.id} className="admin-delivery-row">
          <div className="admin-delivery-item">
            <div className="admin-item-photo">
              {firstImage(row.itemImages) ? (
                <SafeImage
                  src={firstImage(row.itemImages)}
                  alt={row.itemTitle || 'Item photo'}
                  showSkeleton={false}
                />
              ) : (
                <Package size={24} aria-label="Item photo unavailable" />
              )}
            </div>
            <div>
              <h3>{row.itemTitle || 'Untitled item'}</h3>
              <p className="admin-delivery-time">
                {adminDate(row.agreedSlotAt || row.proposedSlotAt, !compact)}
                {row.agreedSlotAt
                  ? ' · agreed'
                  : row.proposedSlotAt
                    ? ' · proposed'
                    : ''}
              </p>
              <span className="admin-status is-neutral">
                {row.status
                  ? statusLabels[row.status] || row.status.replaceAll('_', ' ')
                  : 'Status unavailable'}
              </span>
            </div>
          </div>
          {!compact && (
            <>
              <div className="admin-delivery-people">
                <div>
                  <span className="admin-field-label">Giver</span>
                  <strong>{row.giverName || 'Name not recorded'}</strong>
                  <p>
                    {row.pickupAddress ||
                      row.pickupLocality ||
                      'Pickup not recorded'}
                  </p>
                </div>
                <div>
                  <span className="admin-field-label">Claimer</span>
                  <strong>{row.requesterName || 'Name not recorded'}</strong>
                  <p>{row.requesterAddress || 'Destination not recorded'}</p>
                </div>
              </div>
              <div className="admin-delivery-logistics">
                <p>
                  {row.logistics
                    ? logisticsLabels[row.logistics] ||
                      row.logistics.replaceAll('_', ' ')
                    : 'Logistics not recorded'}
                </p>
                <ChannelStatus
                  channel="email"
                  audit={row.notifications.email}
                />
                <ChannelStatus channel="sms" audit={row.notifications.sms} />
              </div>
            </>
          )}
          <div className="admin-attention-actions">
            <Link className="admin-action" to={row.nextAction.href}>{row.nextAction.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>
            <Link className="admin-button" to={`${row.nextAction.href}#masked-calls`}>Contact people</Link>
            <Link className="admin-button" to={`${row.nextAction.href}#courier-operations`}>Courier actions</Link>
          </div>
        </li>
      ))}
    </ul>
  )
}
export function AttentionList({
  items,
  emptyText,
  coverage,
  compact = false,
}: {
  items: AttentionItem[]
  emptyText: string
  coverage: CoverageState
  compact?: boolean
}) {
  if (!items.length)
    return (
      <p className="admin-empty">
        {coverage === 'complete'
          ? emptyText
          : 'No matching records in this scan. Coverage is incomplete.'}
      </p>
    )
  return (
    <ul className={`admin-attention-list ${compact ? 'is-compact' : ''}`}>
      {items.map((item) => (
        <li key={item.id} className="admin-attention-row">
          <span className={`admin-status is-${item.severity}`}>
            {item.severity === 'critical'
              ? 'Urgent'
              : item.severity === 'warning'
                ? 'Needs review'
                : 'Info'}
          </span>
          <div className="admin-attention-copy">
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            {!compact && (
              <p className="admin-row-meta">
                {item.entityLabel || 'Related record'} ·{' '}
                {item.dueAt
                  ? `Due ${adminDate(item.dueAt)}`
                  : adminDate(item.occurredAt)}{' '}
                IST
              </p>
            )}
          </div>
          <AttentionActions item={item} />
        </li>
      ))}
    </ul>
  )
}
