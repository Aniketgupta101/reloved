import { useEffect, useRef, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { ArrowUpRight, Menu, UserCircle2, X } from "lucide-react"
import { AnalyticsEvent, track } from "@/lib/analytics"
import { useDonorUnreadCount } from "@/lib/useDonorNotifications"
import { isTestingHost, MAIN_SITE_BANNER_H } from "./MainSiteBanner"

const links = [
  { name: "Wall of Kindness", path: "/drop" },
  { name: "Impact Map", path: "/map" },
  { name: "Wall of Love", path: "/love" },
  { name: "Our Story", path: "/about" },
  { name: "Track", path: "/track" },
]

function Brand() {
  return <>
    <img className="public-nav-badge" src="/images/reloved-logo.webp" alt="" width="48" height="48" />
    <img className="public-wordmark" src="/images/public/RELOVED_Primary_Wordmark_Black.svg" alt="reloved" width="135" />
  </>
}

export function PublicNavbar() {
  const location = useLocation()
  const { pathname } = location
  // A new router location closes the sheet, including history and query changes.
  const [openLocation, setOpenLocation] = useState<typeof location | null>(null)
  const isOpen = openLocation === location
  const triggerRef = useRef<HTMLButtonElement>(null)
  const brandRef = useRef<HTMLAnchorElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const unread = useDonorUnreadCount()
  const accountLabel = unread ? `Your account, ${unread} notifications` : "Your account"
  const primary = pathname.startsWith("/give") ? null : pathname.startsWith("/account")
    ? { path: "/drop", label: "Wall of Kindness" }
    : { path: "/give", label: "Drop an item" }

  useEffect(() => {
    if (!isOpen) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.body.setAttribute("data-mobile-menu", "open")
    dialog.showModal()
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
    controls()[0]?.focus()
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const items = controls()
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    dialog.addEventListener("keydown", trapFocus)
    // CSS can switch navigation on either viewport or text-size changes.
    // Observe the actual trigger so cleanup always follows that same boundary.
    const trigger = triggerRef.current
    const navigationMode = new ResizeObserver(() => {
      if (trigger && !trigger.getClientRects().length) setOpenLocation(null)
    })
    if (trigger) navigationMode.observe(trigger)
    const brand = brandRef.current
    return () => {
      dialog.removeEventListener("keydown", trapFocus)
      navigationMode.disconnect()
      dialog.close()
      document.body.style.overflow = previousOverflow
      document.body.removeAttribute("data-mobile-menu")
      // The mobile trigger is hidden after a desktop resize; keep keyboard
      // users at the corresponding visible navigation entry instead.
      const focusTarget = trigger?.getClientRects().length ? trigger : brand
      focusTarget?.focus({ preventScroll: true })
    }
  }, [isOpen])

  const close = () => setOpenLocation(null)
  const primaryLink = (source: string) => primary && (
    <Link className="public-nav-primary" to={primary.path} onClick={() => {
      close()
      if (primary.path === "/give") track(AnalyticsEvent.ctaDropItem, { source })
      else track(AnalyticsEvent.navLink, { label: primary.label, path: primary.path, source })
    }}>
      {primary.label}<ArrowUpRight size={16} aria-hidden="true" />
    </Link>
  )
  const navLinks = (source: string) => links.map(link => (
    <Link key={link.path} to={link.path}
      aria-current={pathname === link.path || (link.path === "/drop" && /^(\/drop\/|\/wall(?:\/|$))/.test(pathname)) ? "page" : undefined}
      onClick={() => {
        close()
        track(AnalyticsEvent.navLink, { label: link.name, path: link.path, source })
      }}>
      {link.name}
    </Link>
  ))

  return <>
    <header className="public-header" style={{ top: isTestingHost() ? MAIN_SITE_BANNER_H : 0 }}>
      <div className="public-header-inner">
        <Link ref={brandRef} to="/" className="public-brand" onClick={() => track(AnalyticsEvent.navLink, { label: "Home", path: "/", source: "navbar_logo" })}><Brand /></Link>
        <nav className="public-desktop-nav" aria-label="Main navigation">{navLinks("navbar")}</nav>
        <div className="public-header-actions">
          <Link className="public-nav-icon public-desktop-account" to="/account?tab=notifications" aria-label={accountLabel}
            onClick={() => track(AnalyticsEvent.navAccount, { source: "navbar" })}>
            <UserCircle2 size={20} />{unread > 0 && <span className="public-unread">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <Link className="public-nav-icon public-mobile-account" to="/account?tab=notifications" aria-label={accountLabel}
            onClick={() => track(AnalyticsEvent.navAccount, { source: "navbar_mobile" })}>
            <UserCircle2 size={20} />{unread > 0 && <span className="public-unread">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <div className="public-desktop-primary">{primaryLink("navbar")}</div>
          <button ref={triggerRef} className="public-nav-icon public-menu-trigger" type="button" aria-label="Open menu"
            aria-expanded={isOpen} aria-controls="public-site-menu" onClick={() => setOpenLocation(location)}><Menu size={22} /></button>
        </div>
      </div>
    </header>
    {isOpen && <dialog ref={dialogRef} id="public-site-menu" className="public-menu" aria-label="Site menu" aria-modal="true"
      onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }}>
      <div className="public-menu-inner">
        <div className="public-menu-heading">
          <Link to="/" className="public-brand" onClick={() => { close(); track(AnalyticsEvent.navLink, { label: "Home", path: "/", source: "mobile_menu_logo" }) }}><Brand /></Link>
          <button className="public-nav-icon" type="button" aria-label="Close menu" onClick={close}><X size={22} /></button>
        </div>
        <p className="public-menu-label">Menu</p>
        <nav className="public-menu-links" aria-label="Mobile navigation">
          {navLinks("mobile_menu")}
          <Link to="/account?tab=notifications" onClick={() => { close(); track(AnalyticsEvent.navAccount, { source: "mobile_menu" }) }}>
            <span>My Account</span>{unread > 0 && <span>{unread > 9 ? "9+" : unread}</span>}
          </Link>
        </nav>
        {primaryLink("mobile_menu")}
      </div>
    </dialog>}
  </>
}
