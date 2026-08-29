import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

interface Partner { id: string; organisationName: string }
interface Need {
  id: string
  category: string
  itemType: string
  quantityRequired: number
  quantityFulfilled: number
  status: string
  partner: Partner
}

export function AdminNeeds() {
  const [needs, setNeeds] = useState<Need[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ partnerId: "", category: "Clothing", itemType: "", quantityRequired: 1 })

  async function load() {
    setLoading(true)
    try {
      const [n, p] = await Promise.all([
        api.admin.get<{ needs: Need[] }>("/api/admin/partner-needs"),
        api.admin.get<{ partners: Partner[] }>("/api/admin/partners"),
      ])
      setNeeds(n.needs)
      setPartners(p.partners)
      if (p.partners[0]) setForm(f => ({ ...f, partnerId: f.partnerId || p.partners[0].id }))
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createNeed() {
    if (!form.partnerId || !form.itemType) return
    await api.admin.post("/api/admin/partner-needs", form)
    setForm(f => ({ ...f, itemType: "", quantityRequired: 1 }))
    load()
  }

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Needs Management</h1>
        <p className="text-foreground-muted mt-2">What each partner is short on right now - feeds the allocation matching.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col sm:flex-row flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase tracking-widest text-foreground-muted">Partner</label>
            <select value={form.partnerId} onChange={e => setForm({ ...form, partnerId: e.target.value })} className="h-10 rounded-none border-2 border-foreground px-3 text-sm font-bold bg-white">
              {partners.map(p => <option key={p.id} value={p.id}>{p.organisationName}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase tracking-widest text-foreground-muted">Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="h-10 rounded-none border-2 border-foreground px-3 text-sm font-bold bg-white">
              {["Clothing", "Footwear", "Accessories", "Books & Learning", "Home", "Art & Hobby"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase tracking-widest text-foreground-muted">Item type</label>
            <Input value={form.itemType} onChange={e => setForm({ ...form, itemType: e.target.value })} placeholder="e.g. School shoes" className="w-48" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase tracking-widest text-foreground-muted">Quantity</label>
            <Input type="number" min={1} value={form.quantityRequired} onChange={e => setForm({ ...form, quantityRequired: Number(e.target.value) })} className="w-24" />
          </div>
          <Button onClick={createNeed} size="sm">Add need</Button>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-foreground-muted">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {needs.map(need => (
            <Card key={need.id}>
              <CardContent className="flex flex-col gap-1">
                <p className="font-display font-black uppercase">{need.itemType}</p>
                <p className="text-sm text-foreground-muted">{need.partner.organisationName} &bull; {need.category}</p>
                <p className="text-xs font-bold mt-1">{need.quantityFulfilled} / {need.quantityRequired} fulfilled</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
