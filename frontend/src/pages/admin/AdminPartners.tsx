import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"

interface Application {
  id: string
  reference: string
  organisationName: string
  organisationType: string
  contactName: string
  phone: string
  email: string
  locality: string
  status: string
  partner: { id: string } | null
}

interface Partner {
  id: string
  organisationName: string
  locality: string
  verificationStatus: string
  active: boolean
  needs: { id: string }[]
}

export function AdminPartners() {
  const [applications, setApplications] = useState<Application[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [apps, ps] = await Promise.all([
        api.admin.get<{ applications: Application[] }>("/api/admin/partner-applications?status=pending"),
        api.admin.get<{ partners: Partner[] }>("/api/admin/partners"),
      ])
      setApplications(apps.applications)
      setPartners(ps.partners)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function decide(id: string, status: "approved" | "rejected") {
    await api.admin.patch(`/api/admin/partner-applications/${id}`, { status })
    load()
  }

  return (
    <div className="flex flex-col gap-10 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Partners</h1>
        <p className="text-foreground-muted mt-2">Verify organisations before matching items to them.</p>
      </div>

      {loading ? (
        <p className="text-foreground-muted">Loading...</p>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-display font-black uppercase tracking-tight">Pending applications ({applications.length})</h2>
            {applications.length === 0 ? (
              <p className="text-foreground-muted text-sm">No applications waiting for review.</p>
            ) : (
              applications.map(app => (
                <Card key={app.id}>
                  <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="font-display font-black uppercase">{app.organisationName}</p>
                      <p className="text-sm text-foreground-muted">{app.organisationType} &bull; {app.locality}</p>
                      <p className="text-xs text-foreground-muted mt-1">{app.contactName} &bull; {app.phone} &bull; {app.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => decide(app.id, "approved")}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => decide(app.id, "rejected")}>Reject</Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-display font-black uppercase tracking-tight">Verified partners ({partners.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {partners.map(p => (
                <Card key={p.id}>
                  <CardContent className="flex flex-col gap-1">
                    <p className="font-display font-black uppercase">{p.organisationName}</p>
                    <p className="text-sm text-foreground-muted">{p.locality}</p>
                    <div className="flex gap-2 mt-2 text-[10px] font-black uppercase tracking-widest">
                      <span className="px-2 py-1 border-2 border-foreground bg-accent-green text-foreground">{p.verificationStatus}</span>
                      <span className="px-2 py-1 border-2 border-foreground bg-white text-foreground-muted">{p.needs.length} open need{p.needs.length === 1 ? "" : "s"}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
