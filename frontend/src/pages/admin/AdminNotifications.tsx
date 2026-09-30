import { useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import type {
  AttentionCategory,
  AttentionItem,
  Page,
} from '@shared/adminControlCenter'
import { useAdminResource } from '@/lib/adminResource'
import {
  adminDate,
  AdminPageHeader,
  ResourceNotice,
  SourceDetails,
} from '@/components/admin/AdminResourceView'

type InboxGroup =
  | 'urgent'
  | 'today'
  | 'messaging'
  | 'claims'
  | 'support'
  | 'system'
type InboxFilter = 'all' | InboxGroup

const filters: { value: InboxFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'today', label: 'Today' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'claims', label: 'Claims' },
  { value: 'support', label: 'Support' },
  { value: 'system', label: 'System' },
]

const groupLabels: Record<InboxGroup, string> = {
  urgent: 'Urgent',
  today: 'Today',
  messaging: 'Messaging',
  claims: 'Claims',
  support: 'Support',
  system: 'System',
}

function isTodayInIndia(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return false
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date(value)) === formatter.format(new Date())
}

function groupFor(item: AttentionItem): InboxGroup {
  if (item.severity === 'critical') return 'urgent'
  if (
    item.category === 'delivery' ||
    isTodayInIndia(item.dueAt) ||
    isTodayInIndia(item.occurredAt)
  )
    return 'today'
  const systemSignal = `${item.type} ${item.title}`.toLowerCase()
  if (
    ['system', 'integration', 'firestore', 'posthog', 'brevo', 'msg91', 'edesy'].some(
      (term) => systemSignal.includes(term),
    )
  )
    return 'system'
  if (item.category === 'messaging') return 'messaging'
  if (item.category === 'claims') return 'claims'
  if (item.category === 'support') return 'support'
  return 'system'
}

function backendCategory(filter: InboxFilter): AttentionCategory {
  if (filter === 'messaging' || filter === 'claims' || filter === 'support')
    return filter
  return 'all'
}

export function AdminNotifications() {
  const [params, setParams] = useSearchParams()
  const filter =
    filters.find((option) => option.value === params.get('category'))?.value ||
    'all'
  return (
    <NotificationsInbox
      key={filter}
      filter={filter}
      onFilter={(value) =>
        setParams(value === 'all' ? {} : { category: value })
      }
    />
  )
}

function NotificationsInbox({
  filter,
  onFilter,
}: {
  filter: InboxFilter
  onFilter: (filter: InboxFilter) => void
}) {
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1]
  const category = backendCategory(filter)
  const resource = useAdminResource<Page<AttentionItem>>(
    `/api/admin/control-center/attention?category=${category}&limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    (data) => data.items.length === 0 && !data.nextCursor,
  )
  const data = resource.data
  const groups = useMemo(() => {
    const grouped = new Map<InboxGroup, AttentionItem[]>()
    for (const group of Object.keys(groupLabels) as InboxGroup[])
      grouped.set(group, [])
    for (const item of data?.items || []) {
      const group = groupFor(item)
      if (filter === 'all' || filter === group) grouped.get(group)!.push(item)
    }
    return [...grouped.entries()].filter(([, items]) => items.length > 0)
  }, [data?.items, filter])

  return (
    <div className="admin-control-center">
      <AdminPageHeader
        title="Notifications"
        description="A focused inbox for urgent work, messages, claims and support."
        refresh={resource.refresh}
        refreshing={resource.refreshing}
        asOf={data?.asOf}
      />
      <div className="admin-filter-tabs" aria-label="Notification category">
        {filters.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === filter}
            onClick={() => onFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <ResourceNotice resource={resource} />
      {data && (
        <>
          <section
            className="admin-panel admin-notification-inbox"
            aria-label="Notification inbox"
          >
            <div className="admin-panel-header">
              <div>
                <h2>{filters.find((option) => option.value === filter)?.label}</h2>
                <p className="admin-subtitle">
                  {groups.reduce((total, [, items]) => total + items.length, 0)}{' '}
                  items · page {cursors.length}
                </p>
              </div>
            </div>
            {groups.length === 0 ? (
              <p className="admin-empty">
                {data.nextCursor
                  ? 'No matching notifications on this page. Continue to the next page.'
                  : 'No matching notifications.'}
              </p>
            ) : (
              groups.map(([group, items]) => (
                <section className="admin-notification-group" key={group}>
                  <header>
                    <h3>{groupLabels[group]}</h3>
                    <span>{items.length}</span>
                  </header>
                  <ul>
                    {items.map((item) => (
                      <li className="admin-notification-row" key={item.id}>
                        <span className={`admin-status is-${item.severity}`}>
                          {item.severity === 'critical'
                            ? 'Urgent'
                            : item.severity === 'warning'
                              ? 'High'
                              : 'Info'}
                        </span>
                        <div>
                          <h4>{item.title}</h4>
                          <p>{item.description}</p>
                          <p className="admin-row-meta">
                            {item.entity.type} ·{' '}
                            {adminDate(item.dueAt || item.occurredAt)} IST
                          </p>
                        </div>
                        <Link className="admin-action" to={item.nextAction.href}>
                          {item.nextAction.label}
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
            <div className="admin-pagination">
              <button
                type="button"
                className="admin-button"
                disabled={cursors.length === 1 || resource.refreshing}
                onClick={() => setCursors((history) => history.slice(0, -1))}
              >
                Previous page
              </button>
              <span>Page {cursors.length}</span>
              <button
                type="button"
                className="admin-button"
                disabled={
                  !data.nextCursor ||
                  resource.refreshing ||
                  resource.status === 'stale'
                }
                onClick={() =>
                  data.nextCursor &&
                  setCursors((history) => [...history, data.nextCursor])
                }
              >
                Next page
              </button>
            </div>
          </section>
          <SourceDetails data={data} />
        </>
      )}
    </div>
  )
}
