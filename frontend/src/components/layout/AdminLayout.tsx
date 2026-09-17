import { Outlet, Link, useNavigate, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { Info, Menu, X } from "lucide-react"
import { api } from "@/lib/api"
import { getAdminToken, clearAdminToken } from "@/lib/adminSession"
import { RelovedBadge } from "@/components/ui/RelovedBadge"

const DEV_ADMIN_BYPASS = import.meta.env.VITE_DEV_ADMIN_BYPASS === "true"
const POLL_MS = 20000

interface AttentionMetrics {
  pendingSubmissions: number
  pendingClaims: number
  pendingPartners: number
  openMessages: number
  unreadChats: number
  unreadClaimChats: number
  unreadDonationChats: number
  needsAttention: number
}

type NavItem = {
  name: string
  path: string
  info: string
  badgeKey?: keyof AttentionMetrics
}

function NavBadge({ count }: { count: number }) {
  if (!count || count < 1) return null
  return (
    <span className="ml-2 inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center bg-accent-green border border-foreground text-[10px] font-black tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  )
}

export function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [checked, setChecked] = useState(DEV_ADMIN_BYPASS)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [attention, setAttention] = useState<AttentionMetrics | null>(null)

  useEffect(() => {
    if (DEV_ADMIN_BYPASS) return

    const token = getAdminToken()
    if (!token) {
      navigate("/admin/login")
      return
    }

    api.admin
      .get("/api/auth/me")
      .then(() => setChecked(true))
      .catch(() => {
        clearAdminToken()
        navigate("/admin/login")
      })
  }, [navigate])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!checked && !DEV_ADMIN_BYPASS) return
    let cancelled = false

    async function loadAttention() {
      try {
        const data = await api.admin.get<AttentionMetrics>("/api/admin/metrics")
        if (!cancelled) setAttention(data)
      } catch {
        // ignore — next poll retries
      }
    }

    loadAttention()
    const id = window.setInterval(loadAttention, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [checked, location.pathname])

  function handleSignOut() {
    clearAdminToken()
    navigate("/admin/login")
  }

  const nav: NavItem[] = [
    {
      name: "Overview",
      path: "/admin",
      info: "Start here. Shows everything that needs your attention: pending Gives, Claims, partner apps, contact messages, and unread chats.",
      badgeKey: "needsAttention",
    },
    {
      name: "Gives",
      path: "/admin/donations",
      info: "Items people Give / Drop. 1) Approve so they go on the Wall of Kindness. 2) When claimed, use Borzo/Porter (company phone). 3) Chat with the giver. Badge = pending reviews + unread giver chats.",
      badgeKey: "pendingSubmissions",
    },
    {
      name: "Wall items",
      path: "/admin/items",
      info: "All items on (or waiting for) the Wall of Kindness. Edit title, visibility, or status if something looks wrong after approval.",
    },
    {
      name: "Bulk Upload",
      path: "/admin/bulk-upload",
      info: "Add many items at once instead of one Give at a time. Use for warehouse / photoshoot batches.",
    },
    {
      name: "Partners",
      path: "/admin/partners",
      info: "NGO / community partner applications. Approve accounts and hand off via WhatsApp or email. Badge = apps waiting for review.",
      badgeKey: "pendingPartners",
    },
    {
      name: "Needs",
      path: "/admin/needs",
      info: "What partners say they need (sizes, categories). Used when matching Wall items to organisations.",
    },
    {
      name: "Allocations",
      path: "/admin/allocations",
      info: "Match approved items to a partner need and track handover. Separate from individual Claims on the Wall.",
    },
    {
      name: "Claims",
      path: "/admin/item-requests",
      info: "People claiming a Wall item for themselves. 1) Approve or decline. 2) Book Borzo with company phone (claimer pays prepaid). 3) Chat with the claimer. Badge = pending Claims + unread claimer chats.",
      badgeKey: "pendingClaims",
    },
    {
      name: "Contact",
      path: "/admin/messages",
      info: "Website contact-form messages (general help). This is NOT Give/Claim chat — that lives on Gives and Claims cards.",
      badgeKey: "openMessages",
    },
    {
      name: "QR codes",
      path: "/qr",
      info: "Printable Reloved / Instagram / waitlist QR codes for launch materials.",
    },
  ]

  const [infoOpen, setInfoOpen] = useState<string | null>(null)
  const activeNav = nav.find(
    (item) => location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path))
  )

  function badgeFor(item: NavItem): number {
    if (!attention || !item.badgeKey) return 0
    if (item.path === "/admin/donations") {
      return (attention.pendingSubmissions || 0) + (attention.unreadDonationChats || 0)
    }
    if (item.path === "/admin/item-requests") {
      return (attention.pendingClaims || 0) + (attention.unreadClaimChats || 0)
    }
    return attention[item.badgeKey] || 0
  }

  if (!checked) return null

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-72 bg-white border-b-2 md:border-b-0 md:border-r-2 border-foreground p-4 md:p-6 flex flex-col gap-4 md:gap-8 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <Link to="/admin" className="font-display font-black text-2xl uppercase tracking-tight flex items-center gap-2.5 min-w-0">
            <RelovedBadge className="w-9 h-9 shrink-0" />
            <span className="truncate">Reloved admin</span>
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
          <p className="md:hidden text-[11px] font-black uppercase tracking-widest text-foreground-muted flex items-center gap-2">
            {activeNav?.name || "Admin"}
            <NavBadge count={attention?.needsAttention || 0} />
          </p>
        )}

        {DEV_ADMIN_BYPASS && (
          <div className="text-xs font-black uppercase tracking-widest px-3 py-2 border-2 border-foreground bg-accent-red text-white shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            Dev auth bypass active
          </div>
        )}

        {(attention?.needsAttention || 0) > 0 && (
          <div className={`${mobileNavOpen ? "block" : "hidden"} md:block text-xs font-medium border-2 border-foreground bg-accent-green/20 px-3 py-2`}>
            <span className="font-black uppercase tracking-widest">{attention!.needsAttention} need attention</span>
            <p className="mt-1 text-foreground-muted normal-case tracking-normal">
              Green badges on the left show where to go next.
            </p>
          </div>
        )}

        <nav className={`${mobileNavOpen ? "flex" : "hidden"} md:flex flex-col gap-2`}>
          {nav.map((item) => {
            const active =
              location.pathname === item.path ||
              (item.path !== "/admin" && location.pathname.startsWith(item.path))
            const count = badgeFor(item)
            return (
              <div key={item.path} className="relative flex items-center gap-1.5">
                <Link
                  to={item.path}
                  className={`flex-1 px-3 py-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all flex items-center justify-between gap-2 ${
                    active
                      ? "bg-foreground text-background shadow-none"
                      : "bg-white text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                  }`}
                >
                  <span className="truncate">{item.name}</span>
                  <NavBadge count={count} />
                </Link>
                <button
                  type="button"
                  aria-label={`What ${item.name} manages`}
                  onClick={() => setInfoOpen(infoOpen === item.path ? null : item.path)}
                  className={`shrink-0 w-7 h-7 flex items-center justify-center border-2 transition-all ${
                    infoOpen === item.path
                      ? "bg-accent-pink border-foreground"
                      : "bg-white border-foreground/30 text-foreground-muted hover:border-foreground hover:text-foreground"
                  }`}
                >
                  <Info size={13} />
                </button>

                {infoOpen === item.path && (
                  <div className="absolute left-0 top-full mt-1 z-20 w-72 max-w-[calc(100vw-2rem)] bg-white border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] p-3 text-xs font-medium text-foreground normal-case tracking-normal leading-relaxed">
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
