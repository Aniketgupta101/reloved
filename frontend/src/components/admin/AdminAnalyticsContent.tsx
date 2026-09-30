import type {
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
import { useAdminResource } from '@/lib/adminResource'
import { AdminPageHeader, ResourceNotice, adminDate } from './AdminResourceView'
import './admin-analytics.css'

export const analyticsViews = [
  'overview',
  'traffic',
  'funnels',
  'search',
  'performance',
  'product',
  'data-health',
] as const

export type AnalyticsView = (typeof analyticsViews)[number]

const viewLabels: Record<AnalyticsView, string> = {
  overview: 'Overview',
  traffic: 'Traffic',
  funnels: 'Funnels',
  search: 'Search',
  performance: 'Performance',
  product: 'Product',
  'data-health': 'Data health',
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
      <div className="analytics-chart-scroll">
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
      description={funnel.message || 'Conversion between each recorded journey step.'}
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
                {step.value === null
                  ? step.message || 'This step is not reliably measured yet.'
                  : step.rateFromPrevious === null
                    ? index === 0
                      ? 'Journey entry'
                      : 'Recorded count; not a cohort conversion'
                    : `${step.rateFromPrevious.toLocaleString('en-IN', { maximumFractionDigits: 1 })}% from the previous step`}
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

function OverviewSection({ data }: { data: AnalyticsSnapshot['sections']['overview'] }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Executive view" title="How Reloved is performing" copy="Audience, product activity, and outcomes for the selected period." />
      <Availability state={data.state} message={data.message} />
      <MetricGrid metrics={data.metrics} />
      <div className="analytics-two-column is-wide-left">
        <TimeSeriesChart title="Traffic over time" description="Page views and visitors by day." series={data.traffic} />
        <MetricGrid metrics={data.conversion} compact />
      </div>
      <TimeSeriesChart title="Drops vs claims" description="New persisted Drops and Claims by day." series={data.activity} />
      <div className="analytics-two-column">
        <RankedList title="Top pages" description="Pages receiving the most visits." rows={data.topPages} valueLabel="views" />
        <RankedList title="Top interactions" description="The most-used product actions." rows={data.topInteractions} />
      </div>
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

function FunnelsSection({ data }: { data: AnalyticsSnapshot['sections']['funnels'] }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Conversion" title="Funnels" copy="Behavior events lead into persisted operational outcomes without mixing their definitions." />
      <Availability state={data.state} message={data.message} />
      <div className="analytics-two-column">
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

function ProductSection({ data }: { data: AnalyticsSnapshot['sections']['product'] }) {
  return (
    <div className="analytics-section-body">
      <SectionIntro eyebrow="Marketplace" title="Product" copy="Supply, demand, geography, and fulfillment speed from operational records." />
      <Availability state={data.state} message={data.message} />
      <MetricGrid metrics={data.metrics} />
      <div className="analytics-three-column">
        <ComparisonChart title="By category" description="Drops compared with Claims." rows={data.categories} />
        <ComparisonChart title="By audience" description="Who available and claimed items are for." rows={data.audiences} />
        <ComparisonChart title="By size" description="Recorded sizes across supply and demand." rows={data.sizes} />
      </div>
      <div className="analytics-three-column">
        <RankedList title="Drop areas" description="Areas producing the most Drops." rows={data.dropAreas} valueLabel="drops" />
        <RankedList title="Claim areas" description="Areas producing the most Claims." rows={data.claimAreas} valueLabel="claims" />
        <RankedList title="Wall status" description="Current state of relevant Wall inventory." rows={data.wallStatus} valueLabel="items" />
      </div>
    </div>
  )
}

function HealthIssues({ issues }: { issues: AnalyticsHealthIssue[] }) {
  return (
    <ChartCard title="Data checks" description="Records that may need product or engineering attention.">
      {!issues.length ? <CompactEmpty message="No material data issues were found in the available checks." /> : (
        <ul className="analytics-health-list">
          {issues.map((issue) => (
            <li key={issue.id}>
              <span className={`analytics-health-severity is-${issue.severity}`} aria-hidden="true" />
              <div>
                <strong>{issue.label}</strong>
                <span className={`analytics-health-status is-${issue.severity}`}>{issue.severity}</span>
                {issue.message && <p>{issue.message}</p>}
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
  range: '7d' | '30d'
  onRange: (value: '7d' | '30d') => void
  view: AnalyticsView
  onView: (value: AnalyticsView) => void
}) {
  const resource = useAdminResource<AnalyticsSnapshot>(
    `/api/admin/control-center/analytics/snapshot?range=${range}`,
    () => false,
  )
  const data = resource.data
  return (
    <div className="admin-control-center analytics-workspace">
      <AdminPageHeader
        title="Analytics"
        description="Business, product, acquisition, performance, and data confidence in one decision-ready view."
        refresh={resource.refresh}
        refreshing={resource.refreshing}
        asOf={data?.asOf}
      >
        <div className="admin-segmented analytics-range" aria-label="Analytics date range">
          <button type="button" aria-pressed={range === '7d'} onClick={() => onRange('7d')}>7 days</button>
          <button type="button" aria-pressed={range === '30d'} onClick={() => onRange('30d')}>30 days</button>
        </div>
      </AdminPageHeader>
      {resource.status !== 'partial' && <ResourceNotice resource={resource} />}
      {resource.status === 'partial' && data && (
        <p className="analytics-coverage-note">Some supporting sources are incomplete. Affected metrics are marked; details are available below.</p>
      )}
      {data && (
        <>
          <nav className="analytics-nav" aria-label="Analytics sections">
            {analyticsViews.map((item) => (
              <button key={item} type="button" aria-pressed={view === item} onClick={() => onView(item)}>{viewLabels[item]}</button>
            ))}
          </nav>
          {view === 'overview' && <OverviewSection data={data.sections.overview} />}
          {view === 'traffic' && <TrafficSection data={data.sections.traffic} />}
          {view === 'funnels' && <FunnelsSection data={data.sections.funnels} />}
          {view === 'search' && <SearchSection data={data.sections.search} />}
          {view === 'performance' && <PerformanceSection data={data.sections.performance} />}
          {view === 'product' && <ProductSection data={data.sections.product} />}
          {view === 'data-health' && <DataHealthSection data={data.sections.dataHealth} />}
          <DataDetails data={data} />
        </>
      )}
    </div>
  )
}
