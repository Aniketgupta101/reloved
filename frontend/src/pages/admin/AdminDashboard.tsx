import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"

interface Metrics {
  completedDonations: number
  pendingSubmissions: number
  approvedInventory: number
  activePartners: number
  activeAllocations: number
}

export function AdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics>({
    completedDonations: 0,
    pendingSubmissions: 0,
    approvedInventory: 0,
    activePartners: 0,
    activeAllocations: 0
  })

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const data = await api.admin.get<Metrics>("/api/admin/metrics")
        setMetrics(data)
      } catch (err) {
        console.error("Error fetching metrics:", err)
      }
    }
    fetchMetrics()
  }, [])

  const statCards = [
    { label: "Completed Units", value: metrics.completedDonations, highlight: true },
    { label: "Pending Reviews", value: metrics.pendingSubmissions },
    { label: "Approved Inventory", value: metrics.approvedInventory },
    { label: "Active Partners", value: metrics.activePartners },
    { label: "Active Allocations", value: metrics.activeAllocations },
  ]

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Overview</h1>
        <p className="text-foreground-muted mt-2">Operational metrics for the first reloved drop.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, i) => (
          <Card key={i} className={stat.highlight ? "bg-accent-green" : "bg-white"}>
            <CardContent className="flex flex-col gap-2">
              <span className={`text-xs font-black uppercase tracking-widest ${stat.highlight ? 'text-black/60' : 'text-foreground-muted'}`}>
                {stat.label}
              </span>
              <span className="text-5xl font-display font-black text-foreground">
                {stat.value}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
