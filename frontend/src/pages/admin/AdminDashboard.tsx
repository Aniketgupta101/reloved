import { useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  AdminOverviewSnapshot,
  OverviewRange,
} from '@shared/adminControlCenter'
import { useAdminResource } from '@/lib/adminResource'
import {
  AdminPageHeader,
  ResourceNotice,
  SourceDetails,
  adminDate,
} from '@/components/admin/AdminResourceView'
import {
  KpiCard,
  DeliveryList,
  AttentionList,
} from '@/components/admin/AdminOverviewContent'

export function AdminDashboard() {
  const [range, setRange] = useState<OverviewRange>('7d')
  const resource = useAdminResource<AdminOverviewSnapshot>(
    `/api/admin/control-center/overview?range=${range}`,
    (data) => data.kpis.every((kpi) => kpi.value === 0),
  )
  const data = resource.data
  return (
    <div className="admin-control-center">
      <AdminPageHeader
        title="Overview"
        description="The pulse of Reloved. What’s moving, and what needs you."
        refresh={resource.refresh}
        refreshing={resource.refreshing}
        asOf={data?.asOf}
      >
        <div className="admin-segmented" aria-label="Metric period">
          {(
            [
              { value: '24h', label: '24h' },
              { value: '7d', label: '7 days' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </AdminPageHeader>
      <ResourceNotice resource={resource} />
      {data && (
        <>
          <section
            aria-label="Performance snapshot"
            className="admin-kpi-section"
          >
            <div className="admin-section-caption">
              <span>Performance snapshot</span>
              <span>
                {adminDate(data.rangeStart)} – {adminDate(data.asOf)} IST
              </span>
            </div>
            <div className="admin-kpi-strip">
              {data.kpis
                .filter(
                  (kpi) => !['activeUsers', 'acceptanceRate'].includes(kpi.id),
                )
                .map((kpi) => (
                  <KpiCard key={kpi.id} kpi={kpi} />
                ))}
            </div>
            <div className="admin-metric-notes">
              {data.kpis
                .filter((kpi) =>
                  ['activeUsers', 'acceptanceRate'].includes(kpi.id),
                )
                .map((kpi) => (
                  <details key={kpi.id}>
                    <summary>
                      {kpi.label}:{' '}
                      {kpi.value === null ? 'Unavailable' : `${kpi.value}%`}
                    </summary>
                    <p>{kpi.reason || kpi.definition}</p>
                    <p>
                      Source: {kpi.source} · {kpi.scope}
                    </p>
                    <Link to={kpi.href}>Inspect source view</Link>
                  </details>
                ))}
              <span>30-day view requires verified history.</span>
            </div>
          </section>
          <section className="admin-panel" aria-labelledby="admin-today-title">
            <div className="admin-panel-header">
              <div>
                <p className="admin-eyebrow">Today · India time</p>
                <h2 id="admin-today-title">
                  Today’s deliveries{' '}
                  <span className="admin-count">
                    {data.deliveries.today.length} in view
                  </span>
                </h2>
              </div>
              <Link to="/admin/orders" className="admin-text-link">
                View deliveries →
              </Link>
            </div>
            <p className="admin-panel-description">
              Agreed schedules for today. Email and SMS show recorded attempts,
              not confirmed receipt.
            </p>
            {data.deliveries.state !== 'complete' && (
              <p className="admin-inline-warning">
                Delivery coverage is {data.deliveries.state}; this list may be
                incomplete.
              </p>
            )}
            <DeliveryList
              rows={data.deliveries.today}
              coverage={data.deliveries.state}
              emptyText="No agreed deliveries scheduled for today."
            />
          </section>
          <div className="admin-overview-grid">
            <section
              className="admin-panel"
              aria-labelledby="admin-waiting-title"
            >
              <div className="admin-panel-header">
                <div>
                  <p className="admin-eyebrow">Keep things moving</p>
                  <h2 id="admin-waiting-title">Waiting on people</h2>
                </div>
                <Link
                  to="/admin/notifications?category=claims"
                  className="admin-text-link"
                >
                  Review claims →
                </Link>
              </div>
              <AttentionList
                items={data.waitingOnPeople.slice(0, 4)}
                coverage={data.coverage}
                compact
                emptyText="No waiting claims in the current snapshot."
              />
              {data.waitingOnPeople.length > 4 && (
                <p className="admin-panel-description">
                  Showing 4 of {data.waitingOnPeople.length} loaded signals.
                  Continue in Notifications.
                </p>
              )}
            </section>
            <section
              className="admin-panel"
              aria-labelledby="admin-upcoming-title"
            >
              <div className="admin-panel-header">
                <div>
                  <p className="admin-eyebrow">From now</p>
                  <h2 id="admin-upcoming-title">Next 48 hours</h2>
                </div>
              </div>
              <DeliveryList
                rows={data.deliveries.next48h}
                coverage={data.deliveries.state}
                compact
                emptyText="No agreed deliveries in the next 48 hours."
              />
            </section>
          </div>
          <section
            className="admin-panel"
            aria-labelledby="admin-messaging-title"
          >
            <div className="admin-panel-header">
              <div>
                <p className="admin-eyebrow">Communication audit</p>
                <h2 id="admin-messaging-title">Messaging needs review</h2>
              </div>
              <Link
                to="/admin/notifications?category=messaging"
                className="admin-text-link"
              >
                Open messaging →
              </Link>
            </div>
            <AttentionList
              items={data.messagingFailures.slice(0, 3)}
              coverage={data.coverage}
              emptyText="No failed or skipped messages in the current audit snapshot."
            />
          </section>
          <details className="admin-source-details">
            <summary>
              Without an agreed time · {data.deliveries.undated.length} in view
            </summary>
            <p>
              These records are not counted in Today or Next 48 hours. Proposed
              times remain unconfirmed.
            </p>
            <DeliveryList
              rows={data.deliveries.undated}
              coverage={data.deliveries.state}
              compact
              emptyText="All loaded deliveries have an agreed time."
            />
          </details>
          <SourceDetails data={data} />
        </>
      )}
    </div>
  )
}
