import { useLayoutEffect } from "react"
import { useLocation } from "react-router-dom"

/** Scroll window to top on every route change (fixes mobile SPA scroll retention). */
export function ScrollToTop() {
  const { pathname, search, hash } = useLocation()

  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual"
    }

    // In-page anchors keep their hash target; all other navigations start at top.
    if (hash) return

    const toTop = () => {
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }

    toTop()
    // Re-apply after paint in case layout/images shift scroll on mobile.
    const id = window.requestAnimationFrame(() => {
      toTop()
      window.requestAnimationFrame(toTop)
    })
    return () => window.cancelAnimationFrame(id)
  }, [pathname, search, hash])

  return null
}
