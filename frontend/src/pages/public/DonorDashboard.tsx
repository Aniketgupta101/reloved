import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken, clearDonorToken } from "@/lib/donorSession"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"

interface Submission {
  id: string
  reference: string
  status: string
  submittedAt: string
  items: { id: string; title: string; category: string; status: string; images: { storagePath: string }[] }[]
}

interface ItemRequest {
  id: string
  status: string
  createdAt: string
  item: { id: string; title: string; images: { storagePath: string }[] }
}

export function DonorDashboard() {
  const navigate = useNavigate()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [itemRequests, setItemRequests] = useState<ItemRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getDonorToken()) {
      navigate("/account/login")
      return
    }

    async function load() {
      try {
        const { profile } = await api.donor.get<{ profile: { onboardedAt: string | null } | null }>("/api/donor/profile")
        if (!profile?.onboardedAt) {
          navigate("/account/onboarding")
          return
        }
        const [subData, reqData] = await Promise.all([
          api.donor.get<{ submissions: Submission[] }>("/api/donor/submissions"),
          api.donor.get<{ requests: ItemRequest[] }>("/api/donor/item-requests"),
        ])
        setSubmissions(subData.submissions)
        setItemRequests(reqData.requests)
      } catch {
        clearDonorToken()
        navigate("/account/login")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [navigate])

  function handleSignOut() {
    clearDonorToken()
    navigate("/account/login")
  }

  const totalItems = submissions.reduce((sum, s) => sum + s.items.length, 0)
  const relovedItems = submissions.reduce((sum, s) => sum + s.items.filter((i) => i.status === "reloved" || i.status === "completed").length, 0)

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-16 flex flex-col gap-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tight">Your giving history</h1>
          <p className="text-foreground-muted mt-2">Every submission you've made through reloved, in one place.</p>
        </div>
        <button onClick={handleSignOut} className="text-xs font-bold uppercase tracking-widest text-foreground-muted underline">
          Sign out
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Submissions</p>
          <p className="text-3xl font-display font-black mt-1">{submissions.length}</p>
        </div>
        <div className="bg-white border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Items given</p>
          <p className="text-3xl font-display font-black mt-1">{totalItems}</p>
        </div>
        <div className="bg-accent-green border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <p className="text-xs font-bold uppercase tracking-widest text-black/60">Reloved</p>
          <p className="text-3xl font-display font-black mt-1">{relovedItems}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <Link to="/give">
          <Button className="font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-pink text-foreground hover:bg-accent-pink">
            Drop another item
          </Button>
        </Link>
        <Link to="/drop">
          <Button variant="outline" className="font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all">
            Browse the Wall to take an item
          </Button>
        </Link>
      </div>

      {!loading && itemRequests.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-display font-black uppercase tracking-tight">Items you've requested</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {itemRequests.map((r) => (
              <div key={r.id} className="bg-white border-2 border-foreground p-3 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-2">
                <div className="aspect-square border-2 border-foreground bg-surface-muted overflow-hidden">
                  <SafeImage src={resolveImageUrl(r.item.images?.[0]?.storagePath)} alt={r.item.title} className="w-full h-full object-cover" />
                </div>
                <p className="text-xs font-bold leading-tight">{r.item.title}</p>
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 ${
                  r.status === "approved" ? "bg-accent-green/20 text-accent-green" : r.status === "rejected" ? "bg-accent-red/10 text-accent-red" : "bg-accent-blue/10 text-accent-blue"
                }`}>
                  {r.status === "pending" ? "Awaiting review (24-48h)" : r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-40 bg-surface-muted border-2 border-foreground animate-pulse" />
      ) : submissions.length === 0 ? (
        <div className="text-center py-16 bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)]">
          <h3 className="text-2xl font-display font-black uppercase">Nothing here yet.</h3>
          <p className="text-foreground-muted mt-2">Once you drop an item using this phone/email, it'll show up here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {submissions.map((sub) => (
            <div key={sub.id} className="bg-white border-2 border-foreground p-6 shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-mono font-bold bg-surface-muted px-2 py-1 border border-foreground/20">{sub.reference}</span>
                <span className="text-xs font-black uppercase tracking-widest px-2 py-1 bg-accent-blue/10 text-accent-blue">{sub.status.replace("_", " ")}</span>
                <span className="text-xs text-foreground-muted">{new Date(sub.submittedAt).toLocaleDateString()}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {sub.items.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2">
                    <div className="aspect-square border-2 border-foreground bg-surface-muted overflow-hidden">
                      <SafeImage src={resolveImageUrl(item.images?.[0]?.storagePath)} alt={item.title} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-xs font-bold leading-tight">{item.title}</p>
                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">{item.status.replace("_", " ")}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
