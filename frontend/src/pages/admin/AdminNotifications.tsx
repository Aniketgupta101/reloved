import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  AttentionCategory,
  AttentionItem,
  Page,
} from '@shared/adminControlCenter'
import { useAdminResource } from '@/lib/adminResource'
import {
  AdminPageHeader,
  ResourceNotice,
  SourceDetails,
} from '@/components/admin/AdminResourceView'
import { AttentionList } from '@/components/admin/AdminOverviewContent'

const categories: { value: AttentionCategory; label: string }[] = [
  { value: 'all', label: 'Needs attention' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'claims', label: 'Claims' },
  { value: 'support', label: 'Support' },
]
export function AdminNotifications() {
  const [params, setParams] = useSearchParams()
  const category =
    categories.find((option) => option.value === params.get('category'))
      ?.value || 'all'
  // Cursor history belongs to one category. Category changes remount the paged inbox.
  return (
    <NotificationsInbox
      key={category}
      category={category}
      onCategory={(value) =>
        setParams(value === 'all' ? {} : { category: value })
      }
    />
  )
}
function NotificationsInbox({
  category,
  onCategory,
}: {
  category: AttentionCategory
  onCategory: (category: AttentionCategory) => void
}) {
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1]
  const resource = useAdminResource<Page<AttentionItem>>(
    `/api/admin/control-center/attention?category=${category}&limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    (data) => data.items.length === 0 && !data.nextCursor,
  )
  const data = resource.data
  return (
    <div className="admin-control-center">
      <AdminPageHeader
        title="Notifications"
        description="One inbox for the next step. Signals come from the source records."
        refresh={resource.refresh}
        refreshing={resource.refreshing}
        asOf={data?.asOf}
      />
      <div className="admin-filter-tabs" aria-label="Notification category">
        {categories.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === category}
            onClick={() => onCategory(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <ResourceNotice resource={resource} />
      {data && (
        <>
          <section className="admin-panel" aria-label="Attention inbox">
            <div className="admin-panel-header">
              <div>
                <h2>
                  {
                    categories.find((option) => option.value === category)
                      ?.label
                  }
                </h2>
                <p className="admin-subtitle">
                  {data.items.length} signals in this scan · page{' '}
                  {cursors.length}
                </p>
              </div>
              <span className="admin-status is-neutral">
                {data.coverage} source coverage
              </span>
            </div>
            <p className="admin-panel-description">
              Priority is within each scan, not a global total. Resolve the
              source condition, then refresh. Notification audit records are
              retained.
            </p>
            {data.items.length === 0 && data.nextCursor ? (
              <p className="admin-empty">
                No matching signals in this scan. Continue to the next scan to
                check more records.
              </p>
            ) : (
              <AttentionList
                items={data.items}
                coverage={data.coverage}
                emptyText="No matching attention signals in this scan."
              />
            )}
            <div className="admin-pagination">
              <button
                type="button"
                className="admin-button"
                disabled={cursors.length === 1 || resource.refreshing}
                onClick={() => setCursors((history) => history.slice(0, -1))}
              >
                Previous scan
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
                Next scan
              </button>
            </div>
          </section>
          <SourceDetails data={data} />
        </>
      )}
    </div>
  )
}
