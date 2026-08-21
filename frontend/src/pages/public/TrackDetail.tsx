import { useParams } from "react-router-dom"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

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
      } catch (e) {
        setError(true)
      }
      setLoading(false)
    }

    if (reference) fetchTracking()
  }, [reference])

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-24">
      {loading ? (
        <div className="h-64 animate-pulse bg-surface-muted border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)]" />
      ) : error || !submission ? (
        <div className="text-center py-24 bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)]">
          <h2 className="text-3xl font-display font-black uppercase tracking-tight">Reference not found</h2>
          <p className="text-foreground-muted mt-2 font-medium">Please check your reference number and try again.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          <div>
            <h1 className="text-5xl font-display font-black uppercase tracking-tight">Submission Status</h1>
            <p className="text-lg text-foreground-muted mt-2">Reference: <span className="font-bold text-foreground bg-accent-blue/10 px-2">{reference}</span></p>
          </div>
          
          <div className="bg-white p-8 border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-8">
            <div className="flex items-center justify-between border-b-2 border-foreground/10 pb-6">
              <div>
                <p className="text-xs uppercase tracking-widest font-bold text-foreground-muted">Current Status</p>
                <p className="text-3xl font-black uppercase mt-1 text-accent-green">{submission.status.replace('_', ' ')}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-widest font-bold text-foreground-muted">Submitted</p>
                <p className="font-bold mt-1 text-lg">{new Date(submission.submitted_at).toLocaleDateString()}</p>
              </div>
            </div>
            
            <div>
              <h3 className="font-black uppercase tracking-widest mb-4">Items ({submission.items?.length || 0})</h3>
              <div className="flex flex-col gap-4">
                {submission.items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center p-4 border-2 border-foreground bg-surface-muted">
                    <div>
                      <p className="font-bold">{item.title}</p>
                      <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted mt-1">{item.category}</p>
                    </div>
                    <div className="px-3 py-1 bg-foreground text-white text-xs font-bold uppercase tracking-widest">
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
