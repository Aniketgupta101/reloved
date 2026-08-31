import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { trackPageView } from "@/lib/analytics"

/** Send a page view to PostHog, GA4, and GTM on every client-side route change. */
export function GaPageView() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    trackPageView(pathname, search)
  }, [pathname, search])

  return null
}
