import { Outlet, Link, useNavigate, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { getAdminToken, clearAdminToken } from "@/lib/adminSession"

// Matches backend/server/middleware/adminAuth.ts's DEV_ADMIN_BYPASS — see
// there for why this exists. Never true in a production build.
const DEV_ADMIN_BYPASS = import.meta.env.VITE_DEV_ADMIN_BYPASS === "true"

export function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [checked, setChecked] = useState(DEV_ADMIN_BYPASS)

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

  function handleSignOut() {
    clearAdminToken()
    navigate('/admin/login')
  }

  const nav = [
    { name: "Overview", path: "/admin" },
    { name: "Donations", path: "/admin/donations" },
    { name: "Inventory", path: "/admin/items" },
    { name: "Bulk Upload", path: "/admin/bulk-upload" },
    { name: "Partners", path: "/admin/partners" },
    { name: "Needs", path: "/admin/needs" },
    { name: "Allocations", path: "/admin/allocations" },
    { name: "Take Requests", path: "/admin/item-requests" },
    { name: "Messages", path: "/admin/messages" },
  ]

  if (!checked) return null

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-white border-b-2 md:border-b-0 md:border-r-2 border-foreground p-6 flex flex-col gap-8 flex-shrink-0">
        <Link to="/admin" className="font-display font-black text-2xl uppercase tracking-tight">reloved.ops</Link>
        {DEV_ADMIN_BYPASS && (
          <div className="text-xs font-black uppercase tracking-widest px-3 py-2 border-2 border-foreground bg-accent-red text-white shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            Dev auth bypass active
          </div>
        )}
        <nav className="flex flex-col gap-2">
          {nav.map(item => {
            const active = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path))
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all ${
                  active
                    ? 'bg-foreground text-background shadow-none'
                    : 'bg-white text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]'
                }`}
              >
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto">
           <button
             onClick={handleSignOut}
             className="text-xs font-black uppercase tracking-widest text-foreground-muted hover:text-foreground"
           >
             Sign out
           </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
