import { useEffect, useState } from "react"
import { api, resolveImageUrl } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"

interface Submission {
  id: string
  reference: string
  donorFirstName: string
  donorLastName: string | null
  phone: string
  locality: string
  status: string
  submittedAt: string
  items: { id: string; title: string; category: string; gender: string | null; status: string; images: { storagePath: string }[] }[]
}

const STATUS_FILTERS = ["submitted", "under_review", "approved", "rejected", "all"]

export function AdminDonations() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [filter, setFilter] = useState("submitted")
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const qs = filter !== "all" ? `?status=${filter}` : ""
      const { submissions } = await api.admin.get<{ submissions: Submission[] }>(`/api/admin/submissions${qs}`)
      setSubmissions(submissions)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  async function setStatus(id: string, status: string) {
    await api.admin.patch(`/api/admin/submissions/${id}`, { status })
    load()
  }

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Donations Review</h1>
        <p className="text-foreground-muted mt-2">Review incoming submissions before items go live on the Wall.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all ${
              filter === s
                ? "bg-foreground text-background"
                : "bg-white text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
            }`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-foreground-muted">Loading...</p>
      ) : submissions.length === 0 ? (
        <p className="text-foreground-muted">No submissions in this state.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {submissions.map(sub => (
            <Card key={sub.id}>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="font-display font-black uppercase text-lg">{sub.donorFirstName} {sub.donorLastName || ""}</p>
                    <p className="text-sm text-foreground-muted">{sub.phone} &bull; {sub.locality}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold bg-surface-muted border border-foreground/20 px-2 py-1">{sub.reference}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-blue text-white">{sub.status}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {sub.items.map(item => (
                    <div key={item.id} className="flex items-center gap-2 bg-surface-muted border-2 border-foreground p-2 pr-3">
                      {item.images?.[0] && (
                        <SafeImage src={resolveImageUrl(item.images[0].storagePath)} alt={item.title} className="w-12 h-12 object-cover border border-foreground/20" />
                      )}
                      <div>
                        <p className="text-sm font-bold">{item.title}</p>
                        <p className="text-xs text-foreground-muted">
                          {item.category}
                          {item.gender && <span className="ml-1.5 px-1.5 py-0.5 border border-foreground/20 uppercase font-bold text-[10px] tracking-widest">{item.gender}</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2 border-t-2 border-foreground/10">
                  <Button size="sm" variant="secondary" onClick={() => setStatus(sub.id, "approved")}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(sub.id, "under_review")}>Mark Reviewing</Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus(sub.id, "rejected")}>Reject</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
