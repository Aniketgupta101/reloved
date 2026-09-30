import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AdminAnalyticsContent,
  analyticsViews,
  type AnalyticsView,
} from '@/components/admin/AdminAnalyticsContent'

function isAnalyticsView(value: string | null): value is AnalyticsView {
  return value !== null && (analyticsViews as readonly string[]).includes(value)
}

export function AdminAnalytics() {
  const [range, setRange] = useState<'7d' | '30d'>('7d')
  const [params, setParams] = useSearchParams()
  const requestedView = params.get('view')
  const view: AnalyticsView = isAnalyticsView(requestedView) ? requestedView : 'overview'

  function setView(nextView: AnalyticsView) {
    const next = new URLSearchParams(params)
    if (nextView === 'overview') next.delete('view')
    else next.set('view', nextView)
    setParams(next, { replace: true })
  }

  return (
    <AdminAnalyticsContent
      range={range}
      onRange={setRange}
      view={view}
      onView={setView}
    />
  )
}
