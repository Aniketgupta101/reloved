import { SITE_URL } from "@/lib/logisticsLinks"

/** True on Firebase preview / testing hosts — not the canonical custom domain. */
export function isTestingHost(): boolean {
  if (typeof window === "undefined") return false
  const host = window.location.hostname.toLowerCase()
  if (host === "reloved.digital" || host === "www.reloved.digital") return false
  return host.endsWith(".web.app") || host.endsWith(".firebaseapp.com")
}

/** Approx banner height used to offset the fixed navbar + page content. */
export const MAIN_SITE_BANNER_H = "2.75rem"

/**
 * Sticky notice when someone lands on the Firebase testing URL.
 * Points them to https://reloved.digital/ (main site, latest fixes).
 */
export function MainSiteBanner() {
  if (!isTestingHost()) return null

  const path = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/"
  const mainHref = `${SITE_URL}${path === "/" ? "/" : path}`

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] w-full border-b-2 border-foreground bg-accent-pink px-3 py-2 text-center text-foreground"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
    >
      <p className="text-xs sm:text-sm font-bold leading-snug max-w-3xl mx-auto">
        You&apos;re on the <span className="uppercase tracking-wide">testing</span> link. Use the main site instead — it&apos;s live and already fixed:{" "}
        <a
          href={mainHref}
          className="underline decoration-2 underline-offset-2 font-black"
        >
          reloved.digital
        </a>
      </p>
    </div>
  )
}
