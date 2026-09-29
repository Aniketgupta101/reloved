import { Link } from 'react-router-dom'
import { ArrowUpRight, Package } from 'lucide-react'
import type {
  AdminKpi,
  AttentionItem,
  ChannelAudit,
  DeliveryRow,
  CoverageState,
} from '@shared/adminControlCenter'
import { SafeImage } from '@/components/ui/SafeImage'
import { resolveImageUrl } from '@/lib/api'
import { adminDate } from './AdminResourceView'

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
          <Link className="admin-action" to={row.nextAction.href}>
            {row.nextAction.label}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
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
                {item.category} · {item.entity.id} ·{' '}
                {item.dueAt
                  ? `Due ${adminDate(item.dueAt)}`
                  : adminDate(item.occurredAt)}{' '}
                IST
              </p>
            )}
          </div>
          <Link className="admin-action" to={item.nextAction.href}>
            {item.nextAction.label}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
