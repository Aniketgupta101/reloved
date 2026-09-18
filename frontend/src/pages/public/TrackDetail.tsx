import { useParams } from "react-router-dom"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { AnalyticsEvent, track } from "@/lib/analytics"

export function TrackDetail() {
  const { reference } = useParams()
  const [submission, setSubmission] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function fetchTracking() {
      setLoading(true)
      try {
        const { submission } = await api.get<{ submission: any }>(`/api/track/${reference}`)
        setSubmission(submission)
        setError(false)
        track(AnalyticsEvent.trackViewed, { reference: reference || "", status: submission?.status })
      } catch (e) {
        setError(true)
        track(AnalyticsEvent.trackFailed, { reference: reference || "" })
      }
      setLoading(false)
    }

    if (reference) fetchTracking()
  }, [reference])

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-12 sm:py-20">
      {loading ? (
        <div className="h-64 animate-pulse bg-surface-muted border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)]" />
      ) : error || !submission ? (
        <div className="text-center py-16 sm:py-24 bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] px-4">
          <h2 className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight">Reference not found</h2>
          <p className="text-foreground-muted mt-2 font-medium">Please check your reference number and try again.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10 sm:gap-12 min-w-0">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-black uppercase tracking-tight text-balance">Submission Status</h1>
            <p className="text-sm sm:text-base text-foreground-muted mt-2 whitespace-nowrap overflow-x-auto">
              Reference: <span className="font-bold text-foreground bg-accent-pink/10 px-2">{reference}</span>
            </p>
          </div>
          
          <div className="bg-white p-5 sm:p-8 border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-8">
            <div className="flex flex-row items-center justify-between gap-3 border-b-2 border-foreground/10 pb-6 min-w-0">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs uppercase tracking-widest font-bold text-foreground-muted">Current Status</p>
                <p className="text-lg sm:text-3xl font-black uppercase mt-1 text-accent-green whitespace-nowrap overflow-x-auto">
                  {submission.status.replace('_', ' ')}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] sm:text-xs uppercase tracking-widest font-bold text-foreground-muted">Submitted</p>
                <p className="font-bold mt-1 text-sm sm:text-lg whitespace-nowrap">
                  {(() => {
                    const raw = submission.submitted_at || submission.submittedAt || submission.createdAt
                    const d = raw ? new Date(raw) : null
                    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString() : "Just now"
                  })()}
                </p>
              </div>
            </div>
            
            <div>
              <h3 className="font-black uppercase tracking-widest mb-4">Items ({submission.items?.length || 0})</h3>
              <div className="flex flex-col gap-4">
                {submission.items?.map((item: any) => (
                  <div key={item.id} className="flex flex-row items-center justify-between gap-3 p-3 sm:p-4 border-2 border-foreground bg-surface-muted min-w-0">
                    <div className="min-w-0">
                      <p className="font-bold truncate">{item.title}</p>
                      <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted mt-1 truncate">{item.category}</p>
                    </div>
                    <div className="px-2 sm:px-3 py-1 bg-foreground text-white text-[10px] sm:text-xs font-bold uppercase tracking-widest shrink-0 whitespace-nowrap">
                      {item.status.replace('_', ' ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
