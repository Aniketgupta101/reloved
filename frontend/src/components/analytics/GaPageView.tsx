import { useEffect } from "react"
import { useLocation } from "react-router-dom"

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

const MEASUREMENT_ID = "G-37TR85XWE8"

/** Send a GA4 page_view on every client-side route change. */
export function GaPageView() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    if (typeof window.gtag !== "function") return
    window.gtag("event", "page_view", {
      page_title: document.title,
      page_location: window.location.href,
      page_path: `${pathname}${search}`,
      send_to: MEASUREMENT_ID,
    })
  }, [pathname, search])

  return null
}
