import { useEffect, useState } from "react"
import { api, resolveImageUrl } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"

interface Item {
  id: string
  title: string
  category: string
  locality: string
  condition: string
  status: string
  publicStatus: string
  publicVisibility: boolean
  images: { storagePath: string }[]
}

const STATUS_FILTERS = ["submitted", "approved", "rejected", "all"]

export function AdminItems() {
  const [items, setItems] = useState<Item[]>([])
  const [filter, setFilter] = useState("submitted")
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const qs = filter !== "all" ? `?status=${filter}` : ""
      const { items } = await api.admin.get<{ items: Item[] }>(`/api/admin/items${qs}`)
      setItems(items)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  async function approve(item: Item) {
    await api.admin.patch(`/api/admin/items/${item.id}`, { status: "approved", publicVisibility: true, publicStatus: "available" })
    load()
  }

  async function reject(item: Item) {
    const reason = window.prompt("Rejection reason (shown internally only):")
    await api.admin.patch(`/api/admin/items/${item.id}`, { status: "rejected", publicVisibility: false, rejectionReason: reason || "" })
    load()
  }

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Inventory</h1>
        <p className="text-foreground-muted mt-2">Approve items to make them visible on the public Wall of Kindness.</p>
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
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-foreground-muted">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-foreground-muted">No items in this state.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-3">
                {item.images?.[0] && (
                  <SafeImage src={resolveImageUrl(item.images[0].storagePath)} alt={item.title} className="w-full aspect-square object-cover border-2 border-foreground" />
                )}
                <div>
                  <p className="font-display font-black uppercase">{item.title}</p>
                  <p className="text-xs text-foreground-muted">{item.category} &bull; {item.condition} &bull; {item.locality}</p>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                  <span className="px-2 py-1 border-2 border-foreground bg-accent-blue text-white">{item.status}</span>
                  {item.publicVisibility && <span className="px-2 py-1 border-2 border-foreground bg-accent-green text-foreground">live</span>}
                </div>
                {item.status === "submitted" && (
                  <div className="flex gap-2 pt-2 border-t-2 border-foreground/10">
                    <Button size="sm" variant="secondary" onClick={() => approve(item)}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => reject(item)}>Reject</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
