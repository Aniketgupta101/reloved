import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "motion/react"
import { ArrowUpRight, Menu, UserCircle2, X } from "lucide-react"
import { RelovedBadge } from "@/components/ui/RelovedBadge"
import { AnalyticsEvent, track } from "@/lib/analytics"
import { useDonorUnreadCount } from "@/lib/useDonorNotifications"

export function Navbar() {
  const [isOpen, setIsOpen] = React.useState(false)
  const unread = useDonorUnreadCount()
  const location = useLocation()

  React.useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  // Lock body scroll + flag for other UI (help FAB) while mobile menu is open.
  React.useEffect(() => {
    if (!isOpen) {
      document.body.removeAttribute("data-mobile-menu")
      return
    }
    document.body.setAttribute("data-mobile-menu", "open")
    const prevOverflow = document.body.style.overflow
    const prevTouch = document.body.style.touchAction
    document.body.style.overflow = "hidden"
    document.body.style.touchAction = "none"
    return () => {
      document.body.removeAttribute("data-mobile-menu")
      document.body.style.overflow = prevOverflow
      document.body.style.touchAction = prevTouch
    }
  }, [isOpen])

  const links = [
    { name: "Wall of Kindness", path: "/drop" },
    { name: "Impact Map", path: "/map" },
    { name: "Wall of Love", path: "/love" },
    { name: "Our Story", path: "/about" },
    { name: "Track", path: "/track" },
  ]

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 pointer-events-none transition-all duration-300",
          "px-0 sm:px-4",
          "pt-[env(safe-area-inset-top,0px)] sm:pt-[max(0.5rem,env(safe-area-inset-top,0px))]",
        )}
      >
        <div
          className={cn(
            "pointer-events-auto mx-auto flex w-full max-w-6xl min-w-0 items-center justify-between gap-2",
            "bg-white border-b sm:border-2 border-foreground",
            "shadow-none sm:shadow-[4px_4px_0px_rgba(0,0,0,1)]",
            "h-12 sm:h-14 px-3 sm:px-5 transition-all duration-300",
            isOpen && "invisible pointer-events-none"
          )}
        >
          <Link
            to="/"
            className="text-foreground flex items-center gap-2 min-w-0"
            onClick={() => track(AnalyticsEvent.navLink, { label: "Home", path: "/", source: "navbar_logo" })}
          >
            <RelovedBadge className="w-8 h-8 sm:w-10 sm:h-10 shrink-0" />
            <span className="font-['Bebas_Neue',sans-serif] text-[1.35rem] sm:text-[1.7rem] leading-none uppercase tracking-[0.06em]">
              reloved
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-6 xl:gap-8 shrink-0">
            {links.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() =>
                  track(AnalyticsEvent.navLink, { label: link.name, path: link.path, source: "navbar" })
                }
                className={cn(
                  "text-xs font-black uppercase tracking-widest transition-colors hover:text-accent-pink py-1 border-b-2 whitespace-nowrap",
                  location.pathname === link.path
                    ? "border-foreground text-foreground"
                    : "border-transparent text-foreground-muted"
                )}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <Link
              to="/account?tab=notifications"
              aria-label={unread ? `Your account, ${unread} notifications` : "Your account"}
              onClick={() => track(AnalyticsEvent.navAccount, { source: "navbar" })}
              className="relative h-10 w-10 flex items-center justify-center border-2 border-foreground bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              <UserCircle2 size={18} />
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 bg-accent-pink border-2 border-foreground text-[10px] font-black flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <Link to="/give" onClick={() => track(AnalyticsEvent.ctaDropItem, { source: "navbar" })}>
              <button
                type="button"
                className="h-10 px-5 text-xs font-black uppercase tracking-widest bg-foreground text-background border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center gap-1.5"
              >
                <span>Drop an item</span>
                <ArrowUpRight size={14} className="stroke-[3]" />
              </button>
            </Link>
          </div>

          {/* Mobile: account + menu */}
          <div className="flex lg:hidden items-center gap-2 shrink-0">
            <Link
              to="/account?tab=notifications"
              aria-label={unread ? `Your account, ${unread} notifications` : "Your account"}
              onClick={() => track(AnalyticsEvent.navAccount, { source: "navbar_mobile" })}
              className="relative h-9 w-9 flex items-center justify-center border-2 border-foreground bg-white"
            >
              <UserCircle2 size={16} />
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-0.5 bg-accent-pink border border-foreground text-[9px] font-black flex items-center justify-center leading-none">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center border-2 border-foreground bg-white"
              onClick={() => setIsOpen(true)}
              aria-label="Open menu"
              aria-expanded={isOpen}
            >
              <Menu size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[80] flex flex-col bg-white"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              paddingLeft: "env(safe-area-inset-left, 0px)",
              paddingRight: "env(safe-area-inset-right, 0px)",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
          >
            <div className="shrink-0 flex items-center justify-between gap-3 h-12 px-3 border-b-2 border-foreground bg-white">
              <Link
                to="/"
                className="flex items-center gap-2 min-w-0"
                onClick={() => {
                  setIsOpen(false)
                  track(AnalyticsEvent.navLink, { label: "Home", path: "/", source: "mobile_menu_logo" })
                }}
              >
                <RelovedBadge className="w-8 h-8 shrink-0" />
                <span className="font-['Bebas_Neue',sans-serif] text-[1.35rem] leading-none uppercase tracking-[0.06em] truncate">
                  reloved
                </span>
              </Link>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-foreground bg-white"
                onClick={() => setIsOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div className="mx-auto w-full max-w-md px-4 py-5 flex flex-col gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-foreground-muted mb-1 px-0.5">
                  Menu
                </p>

                <nav className="flex flex-col gap-2 w-full">
                  {links.map((link) => {
                    const active = location.pathname === link.path
                    return (
                      <Link
                        key={link.path}
                        to={link.path}
                        onClick={() =>
                          track(AnalyticsEvent.navLink, {
                            label: link.name,
                            path: link.path,
                            source: "mobile_menu",
                          })
                        }
                        className={cn(
                          "w-full text-left px-4 py-3 text-sm font-black uppercase tracking-wide border-2 border-foreground",
                          "shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                          active ? "bg-accent-pink text-foreground" : "bg-white text-foreground"
                        )}
                      >
                        {link.name}
                      </Link>
                    )
                  })}
                  <Link
                    to="/account?tab=notifications"
                    onClick={() => track(AnalyticsEvent.navAccount, { source: "mobile_menu" })}
                    className="w-full text-left px-4 py-3 text-sm font-black uppercase tracking-wide border-2 border-foreground bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex items-center justify-between gap-2"
                  >
                    <span>My Account</span>
                    {unread > 0 && (
                      <span className="min-w-6 h-6 px-1.5 bg-accent-pink border-2 border-foreground text-[11px] font-black flex items-center justify-center">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </Link>
                </nav>

                <Link
                  to="/give"
                  className="w-full mt-3"
                  onClick={() => track(AnalyticsEvent.ctaDropItem, { source: "mobile_menu" })}
                >
                  <button
                    type="button"
                    className="w-full py-3.5 text-sm font-black uppercase tracking-widest bg-foreground text-background border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-2"
                  >
                    Drop an item
                    <ArrowUpRight size={16} className="stroke-[3]" />
                  </button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
