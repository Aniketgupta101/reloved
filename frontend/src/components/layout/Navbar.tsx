import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "motion/react"
import { ArrowUpRight, UserCircle2 } from "lucide-react"
import { RelovedBadge } from "@/components/ui/RelovedBadge"
import { AnalyticsEvent, track } from "@/lib/analytics"

export function Navbar() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const location = useLocation()

  React.useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  // "When you scroll down, this navigation bar will collapse. It will
  // become less in your face." - shrinks to a slimmer bar past the hero,
  // full-size again once scrolled back near the top.
  React.useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 80)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const links = [
    { name: "Wall of Kindness", path: "/drop" },
    { name: "Impact Map", path: "/map" },
    { name: "Wall of Love", path: "/love" },
    { name: "Our Story", path: "/about" },
    { name: "Track", path: "/track" },
  ]

  return (
    <>
      <header className={cn(
        "fixed left-0 right-0 z-50 px-4 pointer-events-none flex justify-center transition-all duration-300",
        scrolled ? "top-2" : "top-4"
      )}>
        <div className={cn(
          "pointer-events-auto flex items-center justify-between bg-white border-2 border-foreground w-full max-w-6xl shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all duration-300",
          scrolled ? "px-4 py-2" : "px-6 py-3.5"
        )}>
          <Link to="/" className="text-foreground flex items-center gap-2.5" onClick={() => track(AnalyticsEvent.navLink, { label: "Home", path: "/", source: "navbar_logo" })}>
            <RelovedBadge className={cn("shrink-0 transition-all duration-300", scrolled ? "w-9 h-9" : "w-12 h-12")} />
            <span className="font-['Bebas_Neue',sans-serif] text-[1.7rem] leading-none uppercase tracking-[0.06em]">
              reloved
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-8">
            {links.map((link) => (
              <Link 
                key={link.path} 
                to={link.path}
                onClick={() => track(AnalyticsEvent.navLink, { label: link.name, path: link.path, source: "navbar" })}
                className={cn(
                  "text-xs font-black uppercase tracking-widest transition-colors hover:text-accent-blue py-1 border-b-2",
                  location.pathname === link.path ? "border-foreground text-foreground" : "border-transparent text-foreground-muted"
                )}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
             <Link
               to="/account"
               aria-label="Your account"
               onClick={() => track(AnalyticsEvent.navAccount, { source: "navbar" })}
               className="h-10 w-10 flex items-center justify-center border-2 border-foreground bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
             >
               <UserCircle2 size={18} />
             </Link>
             <Link to="/give" onClick={() => track(AnalyticsEvent.ctaDropItem, { source: "navbar" })}>
               <button className="h-10 px-5 text-xs font-black uppercase tracking-widest bg-foreground text-background border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center gap-1.5">
                <span>Drop an item</span>
                <ArrowUpRight size={14} className="stroke-[3]" />
               </button>
             </Link>
          </div>

          <button 
            className="lg:hidden relative z-50 flex h-10 w-10 flex-col items-center justify-center gap-1.5 border-2 border-foreground bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)]"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle Navigation"
          >
            <span className={cn("block h-0.5 w-5 bg-foreground transition-transform duration-300", isOpen ? "translate-y-2 rotate-45" : "")} />
            <span className={cn("block h-0.5 w-5 bg-foreground transition-opacity duration-300", isOpen ? "opacity-0" : "")} />
            <span className={cn("block h-0.5 w-5 bg-foreground transition-transform duration-300", isOpen ? "-translate-y-2 -rotate-45" : "")} />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-white border-b-4 border-foreground p-8"
          >
            <div className="text-center mb-8">
              <span className="text-xs font-black uppercase tracking-widest text-foreground-muted block mb-1">RE-LOVED DIGITAL</span>
              <span className="text-2xl font-display font-black uppercase">THE DIGITAL WALL OF KINDNESS</span>
            </div>

            <nav className="flex flex-col items-center gap-6 w-full max-w-sm">
              {links.map((link) => (
                <Link 
                  key={link.path}
                  to={link.path}
                  onClick={() => track(AnalyticsEvent.navLink, { label: link.name, path: link.path, source: "mobile_menu" })}
                  className="w-full text-center py-3 text-xl font-display font-black uppercase border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] bg-surface-muted hover:bg-black/5"
                >
                  {link.name}
                </Link>
              ))}
              <Link
                to="/account"
                onClick={() => track(AnalyticsEvent.navAccount, { source: "mobile_menu" })}
                className="w-full text-center py-3 text-xl font-display font-black uppercase border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] bg-surface-muted hover:bg-black/5"
              >
                My Account
              </Link>
              <Link to="/give" className="w-full mt-4" onClick={() => track(AnalyticsEvent.ctaDropItem, { source: "mobile_menu" })}>
                <button className="w-full py-4 text-lg font-black uppercase tracking-widest bg-foreground text-background border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                  Drop an item
                </button>
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
