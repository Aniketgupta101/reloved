import type {
  AdminPostHogSnapshot,
  AnalyticsComparisonRow,
  AnalyticsDataState,
  AnalyticsDeviceSnapshot,
  AnalyticsFunnel,
  AnalyticsHealthIssue,
  AnalyticsIntegrationStatus,
  AnalyticsMetric,
  AnalyticsRankedRow,
  AnalyticsSeries,
  AnalyticsSnapshot,
} from '@shared/adminControlCenter'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useAdminResource } from '@/lib/adminResource'
import { AdminPageHeader, ResourceNotice, adminDate } from './AdminResourceView'
import './admin-analytics.css'

export const analyticsViews = [
  'overview',
  'acquisition',
  'behavior',
  'drop-funnel',
  'claim-funnel',
  'device-geo',
  'fulfillment',
  'product',
  'search',
  'performance',
  'data-health',
] as const

export type AnalyticsView = (typeof analyticsViews)[number]

const viewLabels: Record<AnalyticsView, string> = {
  overview: 'Overview',
  acquisition: 'Acquisition',
  behavior: 'Behavior',
  'drop-funnel': 'Drop funnel',
  'claim-funnel': 'Claim funnel',
  'device-geo': 'Device & geo',
  fulfillment: 'Fulfillment',
  product: 'Product',
  search: 'Search',
  performance: 'Performance',
  'data-health': 'Data health',
}

export type AnalyticsRange = '24h' | '7d' | '30d'

export function operationalAnalyticsRange(range: AnalyticsRange): '7d' | '30d' {
  return range === '30d' ? '30d' : '7d'
}

function formatMetric(metric: AnalyticsMetric) {
  if (metric.value === null) return null
  const value = metric.value
  switch (metric.format) {
    case 'percent':
      return `${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`
    case 'duration':
      return value < 24
        ? `${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}h`
        : `${(value / 24).toLocaleString('en-IN', { maximumFractionDigits: 1 })}d`
    case 'milliseconds':
      return value >= 1000
        ? `${(value / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })}s`
        : `${Math.round(value)}ms`
    case 'score':
      return `${Math.round(value)}/100`
    case 'bytes':
      return value >= 1_000_000
        ? `${(value / 1_000_000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} MB`
        : `${Math.round(value / 1000).toLocaleString('en-IN')} KB`
    case 'position':
      return value.toLocaleString('en-IN', { maximumFractionDigits: 1 })
    default:
      return value.toLocaleString('en-IN', { maximumFractionDigits: 1 })
  }
}

function stateLabel(state: AnalyticsDataState | undefined) {
  if (!state) return 'Unavailable'
  if (state === 'not_configured') return 'Not configured'
  if (state === 'insufficient_data') return 'Not enough data'
  return state[0].toUpperCase() + state.slice(1)
}

export function AnalyticsMetricCard({ metric, compact = false }: { metric: AnalyticsMetric; compact?: boolean }) {
  const value = formatMetric(metric)
  const change = metric.changePercent ?? null
  const state = metric.state || (metric.value === null ? 'unavailable' : 'ready')
  return (
    <article
      className={`analytics-metric ${compact ? 'is-compact' : ''} ${value === null ? 'is-unavailable' : ''}`}
    >
      <div className="analytics-metric-heading">
        <h3>{metric.label}</h3>
        {state !== 'ready' && (
          <span className={`analytics-state is-${state}`}>{stateLabel(state)}</span>
        )}
      </div>
      {value === null ? (
        <p className="analytics-metric-message">
          {metric.message || 'Not enough reliable data yet.'}
        </p>
      ) : (
        <div className="analytics-metric-value-row">
          <strong>{value}</strong>
          {change !== null && (
            <span className={change > 0 ? 'is-positive' : change < 0 ? 'is-negative' : ''}>
              {change > 0 ? '+' : ''}
              {change.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%
              <span className="sr-only"> compared with the previous period</span>
            </span>
          )}
        </div>
      )}
      {!compact && <p className="analytics-metric-definition">{metric.definition}</p>}
    </article>
  )
}

function MetricGrid({ metrics, compact = false }: { metrics: AnalyticsMetric[]; compact?: boolean }) {
  if (!metrics.length) return <CompactEmpty message="No reliable metrics are available for this period." />
  return (
    <div className={`analytics-metric-grid ${compact ? 'is-compact' : ''}`}>
      {metrics.map((metric) => (
        <AnalyticsMetricCard key={metric.id} metric={metric} compact={compact} />
      ))}
    </div>
  )
}

function formatAxisDate(value: string) {
  if (!Number.isFinite(Date.parse(value))) return value
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

function TimeSeriesChart({
  title,
  description,
  series,
}: {
  title: string
  description: string
  series: AnalyticsSeries[]
}) {
  const allPoints = series.flatMap((row) => row.points.filter((point) => point.value !== null))
  if (!series.length || !allPoints.length) {
    return (
      <ChartCard title={title} description={description}>
        <CompactEmpty message="No reliable trend data is available for this period." />
      </ChartCard>
    )
  }
  const width = 720
  const height = 238
  const inset = { top: 18, right: 16, bottom: 34, left: 42 }
  const plotWidth = width - inset.left - inset.right
  const plotHeight = height - inset.top - inset.bottom
  const pointCount = Math.max(...series.map((row) => row.points.length), 1)
  const maximum = Math.max(1, ...allPoints.map((point) => point.value || 0))
  const x = (index: number) => inset.left + (index / Math.max(1, pointCount - 1)) * plotWidth
  const y = (value: number) => inset.top + plotHeight - (value / maximum) * plotHeight
  const colors: Record<AnalyticsSeries['color'], string> = {
    ink: '#242321',
    pink: '#a91465',
    green: '#77a92f',
    amber: '#b27610',
    blue: '#3f6c82',
  }
  const labels = series[0]?.points || []
  const labelIndexes = [...new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])].filter(
    (index) => index >= 0,
  )
  return (
    <ChartCard title={title} description={description}>
      <div className="analytics-chart-legend" aria-hidden="true">
        {series.map((row) => (
          <span key={row.id}>
            <i style={{ background: colors[row.color] }} />
            {row.label}
          </span>
        ))}
      </div>
      <div className="analytics-chart-scroll" role="region" aria-label={`${title} chart, scroll horizontally`} tabIndex={0}>
        <svg
          className="analytics-line-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${title}. ${series.map((row) => `${row.label}: ${row.points.map((point) => point.value ?? 'unavailable').join(', ')}`).join('. ')}`}
        >
          {[0, 0.5, 1].map((ratio) => {
            const lineY = inset.top + plotHeight * ratio
            const labelValue = Math.round(maximum * (1 - ratio))
            return (
              <g key={ratio}>
                <line x1={inset.left} y1={lineY} x2={width - inset.right} y2={lineY} />
                <text x={inset.left - 9} y={lineY + 4} textAnchor="end">
                  {labelValue.toLocaleString('en-IN')}
                </text>
              </g>
            )
          })}
          {series.map((row) => {
            const segments: Array<Array<{ index: number; value: number }>> = []
            let current: Array<{ index: number; value: number }> = []
            row.points.forEach((point, index) => {
              if (point.value === null) {
                if (current.length) segments.push(current)
                current = []
              } else current.push({ index, value: point.value })
            })
            if (current.length) segments.push(current)
            return (
              <g key={row.id} className="analytics-series">
                {segments.map((segment, index) => (
                  <polyline
                    key={`${row.id}-${index}`}
                    points={segment.map((point) => `${x(point.index)},${y(point.value)}`).join(' ')}
                    stroke={colors[row.color]}
                  />
                ))}
                {row.points.map((point, index) =>
                  point.value === null ? null : (
                    <circle key={`${point.at}-${index}`} cx={x(index)} cy={y(point.value)} r="3" fill={colors[row.color]} />
                  ),
                )}
              </g>
            )
          })}
          {labelIndexes.map((index) => (
            <text key={index} x={x(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}>
              {formatAxisDate(labels[index]?.at || '')}
            </text>
          ))}
        </svg>
      </div>
      <details className="analytics-daily-values">
        <summary>Daily values</summary>
        <div className="analytics-chart-scroll" role="region" aria-label={`${title} daily values`} tabIndex={0}>
          <table><caption>Daily counts · Asia/Kolkata</caption><thead><tr><th scope="col">Day</th>{series.map(row => <th scope="col" key={row.id}>{row.label}</th>)}</tr></thead>
            <tbody>{labels.map((point, index) => <tr key={point.at}><th scope="row">{formatAxisDate(point.at)}</th>{series.map(row => <td key={row.id}>{row.points[index]?.value ?? 'Unavailable'}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </ChartCard>
  )
}

function ChartCard({
  title,
  description,
  children,
  className = '',
}: {
  title: string
  description: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <article className={`analytics-card ${className}`}>
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </article>
  )
}

function RankedList({
  title,
  description,
  rows,
  valueLabel = 'events',
}: {
  title: string
  description: string
  rows: AnalyticsRankedRow[]
  valueLabel?: string
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <ChartCard title={title} description={description}>
      {!rows.length ? (
        <CompactEmpty message="No reliable ranking is available for this period." />
      ) : (
        <ol className="analytics-ranked-list">
          {rows.map((row, index) => (
            <li key={row.id}>
              <span className="analytics-rank">{index + 1}</span>
              <div>
                <div className="analytics-ranked-heading">
                  <strong>{row.label}</strong>
                  <span>
                    {row.value.toLocaleString('en-IN')} {valueLabel}
                    {row.secondaryValue !== null && row.secondaryLabel
                      ? ` · ${row.secondaryValue.toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${row.secondaryLabel}`
                      : ''}
                  </span>
                </div>
                <div className="analytics-bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  )
}

function FunnelChart({ funnel }: { funnel: AnalyticsFunnel }) {
  const available = funnel.steps.filter((step) => step.value !== null)
  const maximum = Math.max(1, ...available.map((step) => step.value || 0))
  return (
    <ChartCard
      title={funnel.label}
      description={funnel.message || 'Absolute recorded counts; cohort conversion is unavailable.'}
    >
      {!available.length ? (
        <CompactEmpty message={funnel.message || 'Not enough reliable data yet.'} />
      ) : (
        <ol className="analytics-funnel">
          {funnel.steps.map((step, index) => (
            <li key={step.id} className={step.value === null ? 'is-unavailable' : ''}>
              <div className="analytics-funnel-heading">
                <span>
                  <i>{index + 1}</i>
                  <strong>{step.label}</strong>
                </span>
                <strong>{step.value === null ? '—' : step.value.toLocaleString('en-IN')}</strong>
              </div>
              <div className="analytics-funnel-track" aria-hidden="true">
                {step.value !== null && (
                  <i style={{ width: `${Math.max(3, (step.value / maximum) * 100)}%` }} />
                )}
              </div>
              <p>
                {step.message || (step.value === null ? 'This step is not reliably measured yet.' : 'Recorded count; not a cohort conversion')}
              </p>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  )
}

function ComparisonChart({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: AnalyticsComparisonRow[]
}) {
  const maximum = Math.max(1, ...rows.flatMap((row) => [row.supply, row.demand]))
  return (
    <ChartCard title={title} description={description}>
      <div className="analytics-chart-legend" aria-hidden="true">
        <span><i className="is-pink" />Supply</span>
        <span><i className="is-green" />Demand</span>
      </div>
      {!rows.length ? (
        <CompactEmpty message="No reliable comparison is available yet." />
      ) : (
        <div className="analytics-comparison">
          {rows.map((row) => (
            <div key={row.id}>
              <div className="analytics-ranked-heading">
                <strong>{row.label}</strong>
                <span>{row.supply.toLocaleString('en-IN')} / {row.demand.toLocaleString('en-IN')}</span>
              </div>
              <div className="analytics-comparison-bars" aria-label={`${row.label}: ${row.supply} supply and ${row.demand} demand`}>
                <i className="is-pink" style={{ width: `${Math.max(row.supply ? 2 : 0, (row.supply / maximum) * 100)}%` }} />
                <i className="is-green" style={{ width: `${Math.max(row.demand ? 2 : 0, (row.demand / maximum) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  )
}

function Availability({ state, message }: { state: AnalyticsDataState; message: string | null }) {
  if (state === 'ready') return null
  return (
    <div className={`analytics-availability is-${state}`} role="status">
      <strong>{stateLabel(state)}</strong>
      <p>{message || (state === 'not_configured' ? 'This data source has not been connected.' : 'Reliable data is unavailable for this view.')}</p>
    </div>
  )
}

function CompactEmpty({ message }: { message: string }) {
  return <p className="analytics-empty">{message}</p>
}

function SectionIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <header className="analytics-section-intro">
      <p className="admin-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{copy}</p>
    </header>
  )
}

type PostHogResource = {
  data: AdminPostHogSnapshot | null
  status: 'loading' | 'ready' | 'stale' | 'error'
  refreshing: boolean
  refresh: () => Promise<void>
}

function usePostHogResource(range: AnalyticsRange): PostHogResource {
  const [data, setData] = useState<AdminPostHogSnapshot | null>(null)
  const [status, setStatus] = useState<PostHogResource['status']>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const generation = useRef(0)
  const path = `/api/admin/control-center/analytics/posthog?range=${range}`
  const refresh = useCallback(async () => {
    const request = ++generation.current
    setRefreshing(true)
    try {
      const next = await api.admin.get<AdminPostHogSnapshot>(path)
      if (request !== generation.current) return
      setData(next)
      setStatus('ready')
    } catch {
      if (request !== generation.current) return
      setStatus(data ? 'stale' : 'error')
    } finally {
      if (request === generation.current) setRefreshing(false)
    }
  }, [data, path])
  useEffect(() => {
    setData(null)
    setStatus('loading')
    void refresh()
    return () => { generation.current += 1 }
  }, [path]) // refresh intentionally changes when prior data changes; the query path owns loading.
  return { data, status, refreshing, refresh }
}

function postHogMetric(id: string, label: string, value: number | null, definition: string): AnalyticsMetric {
  return {
    id,
    label,
    value,
    state: value === null ? 'insufficient_data' : 'ready',
    format: 'number',
    previousValue: null,
    changePercent: null,
    source: 'PostHog',
    definition,
    message: value === null ? 'No reliable PostHog aggregate is available for this period.' : null,
  }
}

function postHogEvent(data: AdminPostHogSnapshot, id: string) {
  return data.overview.events.find((event) => event.id === id) || null
}

function postHogTraffic(data: AdminPostHogSnapshot): AnalyticsSeries[] {
  return [
    { id: 'pageViews', label: 'Page views', color: 'pink', points: data.traffic.map((point) => ({ at: point.at, value: point.pageViews })) },
    { id: 'visitors', label: 'Visitors', color: 'green', points: data.traffic.map((point) => ({ at: point.at, value: point.visitors })) },
    { id: 'sessions', label: 'Sessions', color: 'ink', points: data.traffic.map((point) => ({ at: point.at, value: point.sessions })) },
  ]
}

function postHogRanked(rows: AdminPostHogSnapshot['topPages']): AnalyticsRankedRow[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    value: row.events,
    secondaryValue: row.users,
    secondaryLabel: 'visitors',
  }))
}

export function PostHogSourceState({ data, loading = false }: { data: AdminPostHogSnapshot | null; loading?: boolean }) {
  if (loading && !data) {
    return <div className="analytics-source-state" role="status"><strong>PostHog is loading</strong><p>Operational data remains available while product behavior loads.</p></div>
  }
  if (!data) {
    return <div className="analytics-source-state is-unavailable" role="status"><strong>PostHog unavailable</strong><p>The behavior read could not be completed.</p></div>
  }
  if (data.status === 'connected') {
    return <div className="analytics-source-state is-connected" role="status"><strong>PostHog connected</strong><p>Aggregate behavior through {adminDate(data.checkedAt)} IST{data.cached ? ' · cached' : ''}.</p></div>
  }
  return (
    <div className={`analytics-source-state is-${data.status}`} role="status">
      <strong>{data.status === 'misconfigured' ? 'PostHog not configured' : `PostHog ${data.status.replace('-', ' ')}`}</strong>
      <p>{data.message || 'PostHog aggregates are unavailable.'}</p>
      {data.status === 'misconfigured' && (
        <p className="analytics-environment-names">Server configuration needed: {data.requiredEnvironment.join(' · ')}</p>
      )}
    </div>
  )
}

export function AnalyticsNavigation({ view, onView }: { view: AnalyticsView; onView: (value: AnalyticsView) => void }) {
  return (
    <nav className="analytics-nav" aria-label="Analytics sections">
      {analyticsViews.map((item) => (
        <button key={item} type="button" aria-pressed={view === item} onClick={() => onView(item)}>{viewLabels[item]}</button>
      ))}
    </nav>
  )
}

function PostHogOverview({ data }: { data: AdminPostHogSnapshot }) {
  const dropStarted = postHogEvent(data, 'donation_started')
  const claimStarted = postHogEvent(data, 'claim_started')
  const metrics = [
    postHogMetric('visitors', 'Unique visitors', data.overview.uniqueVisitors, 'Unique PostHog identities with a page view in the selected period.'),
    postHogMetric('sessions', 'Sessions', data.overview.sessions, 'Distinct captured sessions in the selected period.'),
    postHogMetric('pageViews', 'Page views', data.overview.pageViews, 'Captured page views in the selected period.'),
    postHogMetric('dropStarts', 'Give starts', dropStarted?.users ?? null, 'Unique people who triggered donation_started in the selected period.'),
    postHogMetric('claimStarts', 'Claim starts', claimStarted?.users ?? null, 'Unique people who triggered claim_started in the selected period.'),
  ]
  return (
    <div className="analytics-posthog-block">
      <div className="analytics-source-heading"><div><span>PostHog</span><h3>Website and product behavior</h3></div><p>Selected period · aggregate events</p></div>
      <MetricGrid metrics={metrics} />
      <TimeSeriesChart title="Traffic over time" description="Actual PostHog page views, visitors and sessions for the selected period." series={postHogTraffic(data)} />
      <RankedList title="Top pages" description="Sanitized page paths returned by the backend aggregate query." rows={postHogRanked(data.topPages)} valueLabel="views" />
    </div>
  )
}

export function PostHogBehaviorSection({ data }: { data: AdminPostHogSnapshot }) {
  const events: AnalyticsRankedRow[] = data.overview.events
    .filter((event) => event.id !== '$pageview')
    .map((event) => ({ id: event.id, label: event.label, value: event.events, secondaryValue: event.users, secondaryLabel: 'people' }))
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Product behavior" title="Behavior" copy="Actual aggregate events captured by PostHog. Individual people and raw event properties are never returned to the browser." />
      <PostHogSourceState data={data} />
      <div className="analytics-two-column">
        <RankedList title="Top product events" description="Allowlisted Reloved interactions in the selected period." rows={events} valueLabel="events" />
        <RankedList title="Top pages" description="Sanitized paths with aggregate views and visitors." rows={postHogRanked(data.topPages)} valueLabel="views" />
      </div>
    </div>
  )
}

function behavioralFunnel(data: AdminPostHogSnapshot, kind: 'drop' | 'claim'): AnalyticsFunnel {
  const definitions = kind === 'drop'
    ? [
        ['donation_started', 'Drop started'],
        ['donation_step_viewed', 'Give step viewed'],
        ['donation_submitted', 'Drop submitted'],
        ['donation_completed', 'Drop completed'],
      ]
    : [
        ['item_viewed', 'Item viewed'],
        ['claim_started', 'Claim started'],
        ['claim_submitted', 'Claim submitted'],
      ]
  return {
    id: kind,
    label: `${kind === 'drop' ? 'Drop' : 'Claim'} behavior`,
    state: 'partial',
    message: 'Event volumes use the same selected period. They are not asserted as cohort conversion because the aggregate read does not expose person-level paths.',
    steps: definitions.map(([id, label]) => {
      const event = postHogEvent(data, id)
      return {
        id,
        label,
        value: event?.users ?? null,
        rateFromPrevious: null,
        state: event ? 'ready' : 'insufficient_data',
        message: event ? 'Unique people recorded in this selected period.' : 'This event was not present in the returned aggregate.',
      }
    }),
  }
}

export function PostHogFunnelSection({ kind, data }: { kind: 'drop' | 'claim'; data: AdminPostHogSnapshot }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Behavioral journey" title={`${kind === 'drop' ? 'Drop' : 'Claim'} funnel`} copy="PostHog stages below share the same selected period and source. Operational outcomes remain a separate Firestore view." />
      <PostHogSourceState data={data} />
      <FunnelChart funnel={behavioralFunnel(data, kind)} />
    </div>
  )
}

function dimensionRows(rows: AdminPostHogSnapshot['dimensions']['device']): AnalyticsRankedRow[] {
  return rows.map((row) => ({ id: row.label, label: row.label, value: row.events, secondaryValue: row.users, secondaryLabel: 'people' }))
}

export function PostHogDeviceGeoSection({ data }: { data: AdminPostHogSnapshot }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Audience context" title="Device & geo" copy="Coarse aggregate properties recorded by PostHog. Exact location and individual identities are excluded." />
      <PostHogSourceState data={data} />
      <div className="analytics-three-column">
        <RankedList title="Device" description="Captured device classes." rows={dimensionRows(data.dimensions.device)} />
        <RankedList title="Browser" description="Captured browsers." rows={dimensionRows(data.dimensions.browser)} />
        <RankedList title="Operating system" description="Captured operating systems." rows={dimensionRows(data.dimensions.os)} />
        <RankedList title="Country" description="PostHog coarse country enrichment." rows={dimensionRows(data.dimensions.country)} />
        <RankedList title="City" description="PostHog coarse city enrichment where available." rows={dimensionRows(data.dimensions.city)} />
      </div>
    </div>
  )
}

function AcquisitionSection({ data }: { data: AdminPostHogSnapshot }) {
  const allowed = new Set(['referrer', 'utm_source', 'utm_medium', 'utm_campaign'])
  const captured = [...new Set(data.schema.flatMap((event) => event.properties).filter((property) => allowed.has(property)))]
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Discovery" title="Acquisition" copy="Traffic sources and campaign attribution from actual PostHog properties." />
      <PostHogSourceState data={data} />
      <ChartCard title="Source coverage" description="Availability is based on populated allowlisted property metadata; values are not exposed by the current aggregate contract.">
        {captured.length ? (
          <><p>Captured fields: {captured.join(', ')}.</p><CompactEmpty message="Source and campaign aggregates are not included in the current read response yet." /></>
        ) : <CompactEmpty message="No populated referrer or UTM properties were returned for this period." />}
      </ChartCard>
    </div>
  )
}

function FulfillmentSection({ data }: { data: AnalyticsSnapshot }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Operational outcomes" title="Fulfillment" copy="Current Firestore lifecycle and speed evidence. This operational scope remains separate from PostHog behavior." />
      <MetricGrid metrics={data.sections.product.metrics} />
      <div className="analytics-two-column">
        <FunnelChart funnel={data.sections.funnels.claim} />
        <RankedList title="Claim pipeline" description="Current operational claim states from Firestore." rows={data.sections.product.claimPipeline || []} valueLabel="claims" />
      </div>
    </div>
  )
}

function OperationalFunnelBlock({ funnel, range }: { funnel: AnalyticsFunnel; range: '7d' | '30d' }) {
  return (
    <div className="analytics-operational-validation">
      <div className="analytics-source-heading"><div><span>Firestore</span><h3>Operational validation</h3></div><p>{range === '7d' ? '7 calendar days and current states' : '30 calendar days and current states'}</p></div>
      <FunnelChart funnel={funnel} />
    </div>
  )
}

function OverviewSection({ data }: { data: AnalyticsSnapshot['sections']['overview'] }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Executive view" title="How Reloved is performing" copy="Daily activity covers the selected Asia/Kolkata calendar days through the snapshot. Each metric labels its selected-period or current lifetime scope." />
      <Availability state={data.state} message={data.message} />
      <div className="analytics-source-heading"><div><span>Firestore</span><h3>Operational outcomes</h3></div><p>Operational scope shown on each metric</p></div>
      <MetricGrid metrics={data.metrics} />
      <MetricGrid metrics={data.conversion} />
      <TimeSeriesChart title="Drops vs claims" description="Persisted Drops, Claims and Accounts by Asia/Kolkata calendar day. Today is partial; incomplete sources leave gaps." series={data.activity} />
    </div>
  )
}

function PostHogUnavailableView({ title, data, loading }: { title: string; data: AdminPostHogSnapshot | null; loading: boolean }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="PostHog" title={title} copy="This view depends on the independent backend-only PostHog aggregate read." />
      <PostHogSourceState data={data} loading={loading} />
    </div>
  )
}

function TrafficSection({ data }: { data: AnalyticsSnapshot['sections']['traffic'] }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Audience" title="Traffic" copy="Who visited, where they came from, and what they viewed." />
      <Availability state={data.state} message={data.message} />
      <MetricGrid metrics={data.metrics} />
      <TimeSeriesChart title="Audience over time" description="Page views, visitors, and sessions by day." series={data.trend} />
      <div className="analytics-three-column">
        <RankedList title="Top pages" description="Most-viewed public routes." rows={data.topPages} valueLabel="views" />
        <RankedList title="Referrers" description="Sites and channels sending traffic." rows={data.referrers} valueLabel="visits" />
        <RankedList title="Campaigns" description="Recorded UTM sources and campaigns." rows={data.campaigns} valueLabel="visits" />
      </div>
    </div>
  )
}

export function FunnelsSection({ data }: { data: AnalyticsSnapshot['sections']['funnels'] }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Journeys" title="Funnels" copy="Absolute activity and current outcome counts. These stages have different scopes, so conversion percentages are unavailable." />
      <Availability state={data.state} message={data.message} />
      <div className="analytics-two-column">
        <ChartCard title="Join and account activation" description="Current lifetime profile snapshot with recorded completion evidence.">
          <MetricGrid metrics={data.activation || []} />
        </ChartCard>
        <FunnelChart funnel={data.drop} />
        <FunnelChart funnel={data.claim} />
      </div>
    </div>
  )
}

function SearchSection({ data }: { data: AnalyticsSnapshot['sections']['search'] }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Discovery" title="Search" copy="How people find Reloved through Google Search." />
      <Availability state={data.state} message={data.message} />
      {data.reportingPeriod && (
        <p className="analytics-period-note">
          Google reporting period: {formatAxisDate(data.reportingPeriod.from)}–{formatAxisDate(data.reportingPeriod.to)}.
          {data.latencyNote ? ` ${data.latencyNote}` : ''}
        </p>
      )}
      <MetricGrid metrics={data.metrics} />
      <TimeSeriesChart title="Search trend" description="Clicks and impressions from available Search Console reports." series={data.trend} />
      <div className="analytics-two-column">
        <RankedList title="Top search queries" description="Queries that produced impressions or clicks." rows={data.queries} valueLabel="clicks" />
        <RankedList title="Top landing pages" description="Reloved pages reached from search." rows={data.landingPages} valueLabel="clicks" />
      </div>
    </div>
  )
}

function DeviceGroup({ title, description, devices }: { title: string; description: string; devices: AnalyticsDeviceSnapshot[] }) {
  return (
    <ChartCard title={title} description={description}>
      <div className="analytics-device-grid">
        {devices.length ? devices.map((device) => (
          <section key={device.device}>
            <div className="analytics-device-title">
              <h3>{device.device}</h3>
              <span className={`analytics-state is-${device.state}`}>{stateLabel(device.state)}</span>
            </div>
            {device.message && <p className="analytics-device-message">{device.message}</p>}
            <MetricGrid metrics={device.metrics} compact />
          </section>
        )) : <CompactEmpty message="No reliable device data is available." />}
      </div>
    </ChartCard>
  )
}

function PerformanceSection({ data }: { data: AnalyticsSnapshot['sections']['performance'] }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Web quality" title="Performance" copy="Field experience, lab audits, and shipped frontend weight are shown separately." />
      <Availability state={data.state} message={data.message} />
      <div className="analytics-two-column">
        <DeviceGroup title="Field data" description="Chrome user experience data from real visits." devices={data.field.devices} />
        <DeviceGroup title="Lab data" description="PageSpeed lab audits for a controlled test run." devices={data.lab.devices} />
      </div>
      <ChartCard title="Frontend bundle" description="Minified application assets from the current local production build.">
        <Availability state={data.bundles.state} message={data.bundles.message} />
        <MetricGrid metrics={data.bundles.metrics} compact />
        {data.bundles.warning && <p className="analytics-bundle-warning">{data.bundles.warning}</p>}
        {data.bundles.assets.length > 0 && (
          <ol className="analytics-asset-list">
            {data.bundles.assets.map((asset) => (
              <li key={asset.id}><span>{asset.label}</span><strong>{Math.round(asset.value / 1000).toLocaleString('en-IN')} KB</strong></li>
            ))}
          </ol>
        )}
      </ChartCard>
    </div>
  )
}

export function ProductSection({ data }: { data: AnalyticsSnapshot['sections']['product'] }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Marketplace" title="Product" copy="Supply, demand, geography, and fulfillment speed from operational records." />
      <Availability state={data.state} message={data.message} />
      <MetricGrid metrics={data.metrics} />
      <div className="analytics-three-column">
        <ComparisonChart title="By category" description="Current visible available items vs Claims submitted in the selected period." rows={data.categories} />
        <ComparisonChart title="By audience" description="Current available supply vs selected-period claim demand." rows={data.audiences} />
        <ComparisonChart title="By size" description="Current available supply vs selected-period claim demand." rows={data.sizes} />
      </div>
      <div className="analytics-three-column">
        <RankedList title="Drop areas" description="Selected-period Drops by recognised public neighbourhood; unknown values stay visible." rows={data.dropAreas} valueLabel="drops" />
        <RankedList title="Claim areas" description="Selected-period Claims by recognised requester neighbourhood; private addresses are not exposed." rows={data.claimAreas} valueLabel="claims" />
        <RankedList title="Wall status" description="Current inventory snapshot, including hidden records; independent of selected period." rows={data.wallStatus} valueLabel="items" />
      </div>
      <div className="analytics-two-column">
        <RankedList title="Claim pipeline" description="Current claim snapshot. Completed claims appear once in Completed." rows={data.claimPipeline || []} valueLabel="claims" />
        <RankedList title="Giver and claimer roles" description={data.roleCoverage || 'Not enough reliable identity coverage yet.'} rows={data.roles || []} valueLabel="people" />
      </div>
      <HealthIssues issues={data.attention || []} title="Aged and waiting work" description="Current operational snapshot, independent of the selected period. Totals require complete age evidence." />
      {!!data.attentionItems?.length && <ul className="analytics-attention-links" aria-label="Open aged or pending records">{data.attentionItems.map(item => <li key={item.id}><a href={item.href}>{item.label}</a></li>)}</ul>}
      <ChartCard title="Quick share links" description="The QR sheet is an existing public application route.">
        <a href="/qr" target="_blank" rel="noopener noreferrer">Open QR codes</a>
        <p>Short links are unavailable: no verified configured link result is included in this snapshot.</p>
      </ChartCard>
    </div>
  )
}

function HealthIssues({ issues, title = "Data checks", description = "Records that may need product or engineering attention." }: { issues: AnalyticsHealthIssue[]; title?: string; description?: string }) {
  return (
    <ChartCard title={title} description={description}>
      {!issues.length ? <CompactEmpty message="No reliable checks are available. See source coverage below." /> : (
        <ul className="analytics-health-list">
          {issues.map((issue) => (
            <li key={issue.id}>
              <span className={`analytics-health-severity is-${issue.severity}`} aria-hidden="true" />
              <div>
                <strong>{issue.label}</strong>
                <span className={`analytics-health-status is-${issue.severity}`}>{issue.severity}</span>
                <p>{issue.count === null ? 'Unavailable because required source or timestamp coverage is incomplete. ' : ''}{issue.message}</p>
              </div>
              <strong>{issue.count === null ? '—' : issue.count.toLocaleString('en-IN')}</strong>
              {issue.href && <a href={issue.href}>Open</a>}
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  )
}

const integrationStatusLabel: Record<AnalyticsIntegrationStatus['status'], string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
  not_configured: 'Not configured',
}

function IntegrationHealth({ integrations }: { integrations: AnalyticsIntegrationStatus[] }) {
  return (
    <ChartCard title="Integrations" description="Readiness and recent signals without exposing credentials.">
      {!integrations.length ? <CompactEmpty message="Integration checks are unavailable." /> : (
        <ul className="analytics-integration-list">
          {integrations.map((integration) => (
            <li key={integration.id}>
              <span className={`analytics-integration-dot is-${integration.status}`} aria-hidden="true" />
              <div><strong>{integration.label}</strong><p>{integration.detail}</p></div>
              <span>{integrationStatusLabel[integration.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  )
}

function DataHealthSection({ data }: { data: AnalyticsSnapshot['sections']['dataHealth'] }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="System confidence" title="Data health" copy="Useful checks for broken links, stale operations, communications, and source availability." />
      <Availability state={data.state} message={data.message} />
      <MetricGrid metrics={data.metrics} />
      <div className="analytics-two-column">
        <HealthIssues issues={data.issues} />
        <IntegrationHealth integrations={data.integrations} />
      </div>
      <div className="analytics-activity-note">
        <span>Last analytics activity <strong>{data.lastAnalyticsActivityAt ? `${adminDate(data.lastAnalyticsActivityAt)} IST` : 'Unavailable'}</strong></span>
        <span>Last notification activity <strong>{data.lastNotificationActivityAt ? `${adminDate(data.lastNotificationActivityAt)} IST` : 'Unavailable'}</strong></span>
      </div>
    </div>
  )
}

function DataDetails({ data }: { data: AnalyticsSnapshot }) {
  return (
    <details className="analytics-data-details">
      <summary>
        Data details
        <span className={`analytics-state is-${data.coverage === 'complete' ? 'ready' : data.coverage}`}>{data.coverage}</span>
      </summary>
      <div>
        <p>{data.scope}</p>
        <p>
          Current period: {formatAxisDate(data.period.from)}–{formatAxisDate(data.period.to)} · Previous comparison: {formatAxisDate(data.period.previousFrom)}–{formatAxisDate(data.period.previousTo)}.
        </p>
        <ul>
          {data.sources.map((source) => (
            <li key={source.source}>
              <strong>{source.source}</strong>
              <span>{source.state}</span>
              <p>{source.scanned.toLocaleString('en-IN')} records inspected{source.reason ? ` · ${source.reason}` : ''}</p>
            </li>
          ))}
        </ul>
        <p>Snapshot: {adminDate(data.asOf)} IST. Tester identities are excluded where the source supports it.</p>
      </div>
    </details>
  )
}

export function AdminAnalyticsContent({
  range,
  onRange,
  view,
  onView,
}: {
  range: AnalyticsRange
  onRange: (value: AnalyticsRange) => void
  view: AnalyticsView
  onView: (value: AnalyticsView) => void
}) {
  const operationalRange = operationalAnalyticsRange(range)
  const resource = useAdminResource<AnalyticsSnapshot>(
    `/api/admin/control-center/analytics/snapshot?range=${operationalRange}`,
    () => false,
  )
  const posthog = usePostHogResource(range)
  const data = resource.data
  const posthogConnected = posthog.data?.status === 'connected' ? posthog.data : null
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([resource.refresh(), posthog.refresh()])
  }, [resource.refresh, posthog.refresh])
  return (
    <div className="admin-control-center analytics-workspace">
      <AdminPageHeader
        title="Analytics"
        description="Business, product, acquisition, performance, and data confidence in one decision-ready view."
        refresh={refreshAll}
        refreshing={resource.refreshing || posthog.refreshing}
        asOf={data?.asOf}
      >
        <div className="admin-segmented analytics-range" aria-label="Analytics date range">
          <button type="button" aria-pressed={range === '24h'} onClick={() => onRange('24h')}>24 hours</button>
          <button type="button" aria-pressed={range === '7d'} onClick={() => onRange('7d')}>7 days</button>
          <button type="button" aria-pressed={range === '30d'} onClick={() => onRange('30d')}>30 days</button>
        </div>
      </AdminPageHeader>
      <p className="analytics-period-note">PostHog: selected {range === '24h' ? '24 hours' : range}. Firestore: {operationalRange === '7d' ? '7 calendar days' : '30 calendar days'} through the snapshot. Sources remain visibly separated.</p>
      <ResourceNotice resource={resource} />
      <AnalyticsNavigation view={view} onView={onView} />
      {view === 'overview' && (
        <div className="analytics-section-body">
          {posthogConnected ? <PostHogOverview data={posthogConnected} /> : <PostHogSourceState data={posthog.data} loading={posthog.status === 'loading'} />}
          {data && <OverviewSection data={data.sections.overview} />}
        </div>
      )}
      {view === 'acquisition' && (posthogConnected ? <AcquisitionSection data={posthogConnected} /> : <PostHogUnavailableView title="Acquisition" data={posthog.data} loading={posthog.status === 'loading'} />)}
      {view === 'behavior' && (posthogConnected ? <PostHogBehaviorSection data={posthogConnected} /> : <PostHogUnavailableView title="Behavior" data={posthog.data} loading={posthog.status === 'loading'} />)}
      {view === 'drop-funnel' && (
        <div className="analytics-section-body">
          {posthogConnected ? <PostHogFunnelSection kind="drop" data={posthogConnected} /> : <PostHogUnavailableView title="Drop funnel" data={posthog.data} loading={posthog.status === 'loading'} />}
          {data && <OperationalFunnelBlock funnel={data.sections.funnels.drop} range={operationalRange} />}
        </div>
      )}
      {view === 'claim-funnel' && (
        <div className="analytics-section-body">
          {posthogConnected ? <PostHogFunnelSection kind="claim" data={posthogConnected} /> : <PostHogUnavailableView title="Claim funnel" data={posthog.data} loading={posthog.status === 'loading'} />}
          {data && <OperationalFunnelBlock funnel={data.sections.funnels.claim} range={operationalRange} />}
        </div>
      )}
      {view === 'device-geo' && (posthogConnected ? <PostHogDeviceGeoSection data={posthogConnected} /> : <PostHogUnavailableView title="Device & geo" data={posthog.data} loading={posthog.status === 'loading'} />)}
      {view === 'fulfillment' && data && <FulfillmentSection data={data} />}
      {view === 'product' && data && <ProductSection data={data.sections.product} />}
      {view === 'search' && data && <SearchSection data={data.sections.search} />}
      {view === 'performance' && data && <PerformanceSection data={data.sections.performance} />}
      {view === 'data-health' && (
        <div className="analytics-section-body">
          <PostHogSourceState data={posthog.data} loading={posthog.status === 'loading'} />
          {data && <DataHealthSection data={data.sections.dataHealth} />}
        </div>
      )}
      {data && <DataDetails data={data} />}
    </div>
  )
}
