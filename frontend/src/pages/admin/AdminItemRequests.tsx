import { useEffect, useState } from "react"
import { api, resolveImageUrl } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"

interface ItemRequest {
  id: string
  requesterTarget: string
  requesterName: string | null
  requesterPhone: string | null
  requesterAddress: string | null
  note: string | null
  photoStoragePath: string | null
  status: string
  createdAt: string
  item: {
    id: string
    title: string
    category: string
    images: { storagePath: string }[]
  }
}

const TABS = ["pending", "approved", "rejected"] as const

export function AdminItemRequests() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending")
  const [requests, setRequests] = useState<ItemRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actingOn, setActingOn] = useState<string | null>(null)

  async function load(status: string) {
    setLoading(true)
    try {
      const { requests } = await api.admin.get<{ requests: ItemRequest[] }>(`/api/admin/item-requests?status=${status}`)
      setRequests(requests)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => { load(tab) }, [tab])

  async function decide(id: string, status: "approved" | "rejected") {
    setActingOn(id)
    try {
      await api.admin.patch(`/api/admin/item-requests/${id}`, { status })
      await load(tab)
    } catch (err) {
      console.error(err)
    }
    setActingOn(null)
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Claim requests</h1>
        <p className="text-foreground-muted mt-2">Individuals requesting to take a Wall of Kindness item directly - separate from partner/NGO allocations.</p>
      </div>

      <div className="flex gap-2 border-b-2 border-foreground/10 pb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all ${
              tab === t
                ? "bg-foreground text-background shadow-none"
                : "bg-white text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-foreground-muted">Loading...</p>
      ) : requests.length === 0 ? (
        <p className="text-foreground-muted">No {tab} requests.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-28 aspect-square border-2 border-foreground bg-surface-muted overflow-hidden flex-shrink-0">
                  <SafeImage
                    src={resolveImageUrl(r.item.images?.[0]?.storagePath)}
                    alt={r.item.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="font-display font-black uppercase">{r.item.title}</p>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-blue text-white">{r.status}</span>
                  </div>
                  <p className="text-sm">
                    <span className="font-bold">{r.requesterName || "Unnamed"}</span> &bull; {r.requesterPhone} &bull; {r.requesterTarget}
                  </p>
                  {r.requesterAddress && <p className="text-sm text-foreground-muted">{r.requesterAddress}</p>}
                  {r.note && <p className="text-sm italic">"{r.note}"</p>}
                  {r.photoStoragePath && (
                    <a href={resolveImageUrl(r.photoStoragePath)} target="_blank" rel="noreferrer" className="text-xs font-bold underline w-fit">
                      View submitted photo
                    </a>
                  )}
                  <p className="text-xs text-foreground-muted">{new Date(r.createdAt).toLocaleString()}</p>

                  {r.status === "pending" && (
                    <div className="flex gap-2 pt-2 border-t-2 border-foreground/10">
                      <Button size="sm" onClick={() => decide(r.id, "approved")} disabled={actingOn === r.id}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => decide(r.id, "rejected")} disabled={actingOn === r.id}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
