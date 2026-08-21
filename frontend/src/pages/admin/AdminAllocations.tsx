import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"

interface Partner { id: string; organisationName: string }
interface ApprovedItem { id: string; title: string; quantity: number }
interface Allocation {
  id: string
  reference: string
  status: string
  partner: Partner
  items: { id: string; allocatedQuantity: number; completedQuantity: number; item: { title: string } }[]
}

export function AdminAllocations() {
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<ApprovedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPartner, setSelectedPartner] = useState("")
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({})

  async function load() {
    setLoading(true)
    try {
      const [a, p, i] = await Promise.all([
        api.admin.get<{ allocations: Allocation[] }>("/api/admin/allocations"),
        api.admin.get<{ partners: Partner[] }>("/api/admin/partners"),
        api.admin.get<{ items: ApprovedItem[] }>("/api/admin/items?status=approved"),
      ])
      setAllocations(a.allocations)
      setPartners(p.partners)
      setItems(i.items)
      if (p.partners[0]) setSelectedPartner(sp => sp || p.partners[0].id)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function toggleItem(id: string, checked: boolean) {
    setSelectedItems(prev => {
      const next = { ...prev }
      if (checked) next[id] = 1
      else delete next[id]
      return next
    })
  }

  async function createAllocation() {
    const chosen = Object.entries(selectedItems).map(([itemId, quantity]) => ({ itemId, quantity }))
    if (!selectedPartner || chosen.length === 0) return
    await api.admin.post("/api/admin/allocations", { partnerId: selectedPartner, items: chosen })
    setSelectedItems({})
    load()
  }

  async function markCompleted(allocationItemId: string, completedQuantity: number) {
    await api.admin.patch(`/api/admin/allocation-items/${allocationItemId}`, { completedQuantity })
    load()
  }

  async function setAllocationStatus(id: string, status: string) {
    await api.admin.patch(`/api/admin/allocations/${id}`, { status })
    load()
  }

  return (
    <div className="flex flex-col gap-10 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Allocations</h1>
        <p className="text-foreground-muted mt-2">Match approved items to a partner, then track completion.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="font-display font-black uppercase">New allocation</h2>
          <div className="flex flex-col gap-1 max-w-xs">
            <label className="text-xs font-black uppercase tracking-widest text-foreground-muted">Partner</label>
            <select value={selectedPartner} onChange={e => setSelectedPartner(e.target.value)} className="h-10 rounded-none border-2 border-foreground px-3 text-sm font-bold bg-white">
              {partners.map(p => <option key={p.id} value={p.id}>{p.organisationName}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-2">
            {items.map(item => (
              <label key={item.id} className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={item.id in selectedItems} onChange={e => toggleItem(item.id, e.target.checked)} />
                <span className="flex-1">{item.title}</span>
                {item.id in selectedItems && (
                  <input
                    type="number"
                    min={1}
                    max={item.quantity}
                    value={selectedItems[item.id]}
                    onChange={e => setSelectedItems(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                    className="w-16 h-8 rounded-none border-2 border-foreground px-2"
                  />
                )}
              </label>
            ))}
            {items.length === 0 && <p className="text-sm text-foreground-muted">No approved items available to allocate.</p>}
          </div>
          <Button onClick={createAllocation} disabled={Object.keys(selectedItems).length === 0} size="sm" className="self-start">Create allocation</Button>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-foreground-muted">Loading...</p>
      ) : (
        <div className="flex flex-col gap-4">
          {allocations.map(alloc => (
            <Card key={alloc.id}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display font-black uppercase">{alloc.partner.organisationName}</p>
                    <p className="text-xs font-mono text-foreground-muted">{alloc.reference}</p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-blue text-white">{alloc.status}</span>
                </div>

                <div className="flex flex-col gap-2">
                  {alloc.items.map(ai => (
                    <div key={ai.id} className="flex items-center justify-between text-sm bg-surface-muted border-2 border-foreground p-2">
                      <span className="font-medium">{ai.item.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-foreground-muted">{ai.completedQuantity}/{ai.allocatedQuantity} completed</span>
                        {ai.completedQuantity < ai.allocatedQuantity && (
                          <Button size="sm" variant="outline" onClick={() => markCompleted(ai.id, ai.allocatedQuantity)}>Mark done</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2 border-t-2 border-foreground/10">
                  {alloc.status === "requested" && <Button size="sm" variant="secondary" onClick={() => setAllocationStatus(alloc.id, "confirmed")}>Confirm partner request</Button>}
                  {alloc.status === "proposed" && <Button size="sm" variant="secondary" onClick={() => setAllocationStatus(alloc.id, "confirmed")}>Confirm</Button>}
                  {alloc.status === "confirmed" && <Button size="sm" variant="secondary" onClick={() => setAllocationStatus(alloc.id, "completed")}>Mark allocation complete</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
