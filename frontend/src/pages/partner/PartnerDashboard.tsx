import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, resolveImageUrl } from "@/lib/api"
import { getPartnerToken, clearPartnerToken } from "@/lib/partnerSession"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"
import { AnalyticsEvent, resetAnalyticsIdentity, track } from "@/lib/analytics"

interface AvailableItem {
  id: string
  title: string
  category: string
  condition: string
  locality: string
  images: { storagePath: string }[]
}

interface Allocation {
  id: string
  reference: string
  status: string
  createdAt: string
  items: { id: string; allocatedQuantity: number; completedQuantity: number; item: { title: string } }[]
}

export function PartnerDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AvailableItem[]>([])
  const [requests, setRequests] = useState<Allocation[]>([])
  const [monthlyUsed, setMonthlyUsed] = useState(0)
  const [monthlyLimit, setMonthlyLimit] = useState(3)
  const [selected, setSelected] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [avail, reqs] = await Promise.all([
        api.partner.get<{ items: AvailableItem[] }>("/api/partner/available-items"),
        api.partner.get<{ allocations: Allocation[]; monthlyUsed: number; monthlyLimit: number }>("/api/partner/requests"),
      ])
      setItems(avail.items)
      setRequests(reqs.allocations)
      setMonthlyUsed(reqs.monthlyUsed)
      setMonthlyLimit(reqs.monthlyLimit)
    } catch (err) {
      clearPartnerToken()
      navigate("/partner/login")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!getPartnerToken()) {
      navigate("/partner/login")
      return
    }
    load()
  }, [navigate])

  const remaining = monthlyLimit - monthlyUsed

  function toggleSelect(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= remaining) return prev
      return [...prev, id]
    })
  }

  async function handleRequest() {
    if (selected.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      await api.partner.post("/api/partner/requests", {
        items: selected.map((itemId) => ({ itemId, quantity: 1 })),
      })
      track(AnalyticsEvent.partnerItemsRequested, { count: selected.length })
      setSelected([])
      await load()
    } catch (err: any) {
      track(AnalyticsEvent.partnerItemsRequestFailed)
      setError(err?.message || "Failed to submit request")
    } finally {
      setSubmitting(false)
    }
  }

  function handleSignOut() {
    track(AnalyticsEvent.logout, { role: "partner" })
    resetAnalyticsIdentity()
    clearPartnerToken()
    navigate("/partner/login")
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b-2 border-foreground px-6 py-4 flex items-center justify-between">
        <span className="font-display font-black text-xl uppercase tracking-tight">reloved.partners</span>
        <button onClick={handleSignOut} className="text-xs font-black uppercase tracking-widest text-foreground-muted hover:text-foreground">Sign out</button>
      </header>

      <main className="max-w-6xl mx-auto p-8 flex flex-col gap-8">
        <Card className={remaining <= 0 ? "border-accent-red" : ""}>
          <CardContent className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-display font-black uppercase tracking-tight">Monthly item requests</h1>
              <p className="text-foreground-muted mt-1">{monthlyUsed} of {monthlyLimit} items requested this month{remaining <= 0 ? " - limit reached" : ""}.</p>
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: monthlyLimit }).map((_, i) => (
                <div key={i} className={`w-8 h-8 border-2 border-foreground flex items-center justify-center text-xs font-black ${i < monthlyUsed ? "bg-accent-green text-foreground" : "bg-white text-foreground-muted"}`}>
                  {i + 1}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {error && <div className="bg-white border-2 border-accent-red text-accent-red text-sm font-bold p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">{error}</div>}

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-black uppercase tracking-tight">Available items</h2>
          {selected.length > 0 && (
            <Button onClick={handleRequest} disabled={submitting} size="sm">
              {submitting ? "Requesting..." : `Request ${selected.length} item(s)`}
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-foreground-muted">Loading...</p>
        ) : remaining <= 0 ? (
          <p className="text-foreground-muted text-sm">You've used your requests for this month - check back next month, or contact reloved for an urgent need.</p>
        ) : items.length === 0 ? (
          <p className="text-foreground-muted text-sm">No items available right now - check back soon.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {items.map((item) => {
              const isSelected = selected.includes(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => toggleSelect(item.id)}
                  className={`text-left border-2 border-foreground overflow-hidden transition-all ${isSelected ? "shadow-[4px_4px_0px_rgba(0,0,0,1)] bg-accent-green/10" : "shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"}`}
                >
                  <SafeImage src={resolveImageUrl(item.images?.[0]?.storagePath)} alt={item.title} className="w-full aspect-square object-cover bg-surface-muted" />
                  <div className="p-3">
                    <p className="text-sm font-bold leading-tight">{item.title}</p>
                    <p className="text-xs text-foreground-muted mt-1">{item.category} &middot; {item.condition}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <h2 className="text-xl font-display font-black uppercase tracking-tight mt-4">Your requests</h2>
        {requests.length === 0 ? (
          <p className="text-foreground-muted text-sm">No requests yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {requests.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-mono text-xs font-bold text-foreground-muted">{r.reference}</p>
                    <p className="text-sm mt-1">{r.items.map((i) => i.item.title).join(", ")}</p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-blue text-white">{r.status}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
