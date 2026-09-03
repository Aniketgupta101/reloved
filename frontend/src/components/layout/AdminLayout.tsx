import { Outlet, Link, useNavigate, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { Info, Menu, X } from "lucide-react"
import { api } from "@/lib/api"
import { getAdminToken, clearAdminToken } from "@/lib/adminSession"
import { RelovedBadge } from "@/components/ui/RelovedBadge"

// Matches backend/server/middleware/adminAuth.ts's DEV_ADMIN_BYPASS - see
// there for why this exists. Never true in a production build.
const DEV_ADMIN_BYPASS = import.meta.env.VITE_DEV_ADMIN_BYPASS === "true"

export function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [checked, setChecked] = useState(DEV_ADMIN_BYPASS)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    if (DEV_ADMIN_BYPASS) return

    const token = getAdminToken()
    if (!token) {
      navigate('/admin/login')
      return
    }

    api.admin
      .get("/api/auth/me")
      .then(() => setChecked(true))
      .catch(() => {
        clearAdminToken()
        navigate('/admin/login')
      })
  }, [navigate])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  function handleSignOut() {
    clearAdminToken()
    navigate('/admin/login')
  }

  const nav = [
    { name: "Overview", path: "/admin", info: "Live counts and recent activity across the whole platform - submissions, items, partners, at a glance." },
    { name: "Donations", path: "/admin/donations", info: "Incoming Drop submissions. Approve to put an item live on the Wall of Kindness, or reject." },
    { name: "Inventory", path: "/admin/items", info: "Every item currently listed, live or not - edit details, visibility, or status directly." },
    { name: "Bulk Upload", path: "/admin/bulk-upload", info: "Add many items at once instead of processing one Drop submission at a time." },
    { name: "Partners", path: "/admin/partners", info: "NGO/community partner applications, plus already-approved partner accounts." },
    { name: "Needs", path: "/admin/needs", info: "What each partner organization is currently short on - used for matching items to them." },
    { name: "Allocations", path: "/admin/allocations", info: "Match approved items to a partner's stated needs and track the handover." },
    { name: "Claim Requests", path: "/admin/item-requests", info: "Individual recipients' requests to claim a specific item - approve or reject." },
    { name: "Messages", path: "/admin/messages", info: "Contact-form submissions sent in from the public site." },
  ]
  const [infoOpen, setInfoOpen] = useState<string | null>(null)
  const activeNav = nav.find(
    (item) => location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path))
  )

  if (!checked) return null

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-white border-b-2 md:border-b-0 md:border-r-2 border-foreground p-4 md:p-6 flex flex-col gap-4 md:gap-8 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <Link to="/admin" className="font-display font-black text-2xl uppercase tracking-tight flex items-center gap-2.5 min-w-0">
            <RelovedBadge className="w-9 h-9 shrink-0" />
            <span className="truncate">reloved.ops</span>
          </Link>
          <button
            type="button"
            className="md:hidden h-10 w-10 flex items-center justify-center border-2 border-foreground bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)]"
            aria-label={mobileNavOpen ? "Close admin menu" : "Open admin menu"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((v) => !v)}
          >
            {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {!mobileNavOpen && (
          <p className="md:hidden text-[11px] font-black uppercase tracking-widest text-foreground-muted">
            {activeNav?.name || "Admin"}
          </p>
        )}

        {DEV_ADMIN_BYPASS && (
          <div className="text-xs font-black uppercase tracking-widest px-3 py-2 border-2 border-foreground bg-accent-red text-white shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            Dev auth bypass active
          </div>
        )}
        <nav className={`${mobileNavOpen ? "flex" : "hidden"} md:flex flex-col gap-2`}>
          {nav.map(item => {
            const active = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path))
            return (
              <div key={item.path} className="relative flex items-center gap-1.5">
                <Link
                  to={item.path}
                  className={`flex-1 px-4 py-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all ${
                    active
                      ? 'bg-foreground text-background shadow-none'
                      : 'bg-white text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]'
                  }`}
                >
                  {item.name}
                </Link>
                <button
                  type="button"
                  aria-label={`What ${item.name} manages`}
                  onClick={() => setInfoOpen(infoOpen === item.path ? null : item.path)}
                  className={`shrink-0 w-7 h-7 flex items-center justify-center border-2 transition-all ${
                    infoOpen === item.path
                      ? 'bg-accent-pink border-foreground'
                      : 'bg-white border-foreground/30 text-foreground-muted hover:border-foreground hover:text-foreground'
                  }`}
                >
                  <Info size={13} />
                </button>

                {infoOpen === item.path && (
                  <div className="absolute left-0 top-full mt-1 z-20 w-64 max-w-[calc(100vw-2rem)] bg-white border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] p-3 text-xs font-medium text-foreground normal-case tracking-normal leading-relaxed">
                    {item.info}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className={`${mobileNavOpen ? "block" : "hidden"} md:block mt-auto`}>
           <button
             onClick={handleSignOut}
             className="text-xs font-black uppercase tracking-widest text-foreground-muted hover:text-foreground"
           >
             Sign out
           </button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
