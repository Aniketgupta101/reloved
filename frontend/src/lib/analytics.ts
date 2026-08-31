import { isPostHogEnabled, posthog } from "@/lib/posthog"

export const GA4_MEASUREMENT_ID = "G-37TR85XWE8"

/** Named product events for funnels (PostHog + GA4 custom events + GTM dataLayer). */
export const AnalyticsEvent = {
  ctaDropItem: "cta_drop_item_clicked",
  ctaClaimItem: "cta_claim_item_clicked",
  ctaExploreWall: "cta_explore_wall_clicked",
  navLink: "nav_link_clicked",
  navAccount: "nav_account_clicked",
  footerLink: "footer_link_clicked",
  itemCardClicked: "item_card_clicked",
  itemViewed: "item_viewed",
  claimStarted: "claim_started",
  claimSubmitted: "claim_submitted",
  claimFailed: "claim_failed",
  donationStarted: "donation_started",
  donationSubmitted: "donation_submitted",
  donationFailed: "donation_failed",
  donationCompleted: "donation_completed",
  trackLookup: "track_lookup_submitted",
  trackViewed: "track_status_viewed",
  trackFailed: "track_status_failed",
  loginStarted: "login_started",
  loginCompleted: "login_completed",
  logout: "logout",
  partnerApplyCta: "partner_apply_cta_clicked",
  partnerApplicationSubmitted: "partner_application_submitted",
  partnerApplicationFailed: "partner_application_failed",
  contactSubmitted: "contact_submitted",
  contactFailed: "contact_failed",
  onboardingCompleted: "onboarding_completed",
  helpOpened: "help_chat_opened",
  helpClosed: "help_chat_closed",
  helpQuestionAsked: "help_question_asked",
  helpContactCta: "help_contact_cta_clicked",
  faqOpened: "faq_question_opened",
  faqContactCta: "faq_contact_cta_clicked",
  wallFilterChanged: "wall_filter_changed",
  partnerItemsRequested: "partner_items_requested",
  partnerItemsRequestFailed: "partner_items_request_failed",
} as const

type Props = Record<string, string | number | boolean | null | undefined>

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
    gtag?: (...args: unknown[]) => void
  }
}

function cleanProps(properties?: Props): Record<string, string | number | boolean | null> | undefined {
  if (!properties) return undefined
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

/** GA4 recommended events so Google Analytics reports conversions, not only custom names. */
function ga4Recommended(event: string, props?: Record<string, string | number | boolean | null>) {
  switch (event) {
    case AnalyticsEvent.loginCompleted:
      return { name: "login", params: { method: String(props?.channel || "unknown") } }
    case AnalyticsEvent.onboardingCompleted:
      return { name: "sign_up", params: { method: "account" } }
    case AnalyticsEvent.partnerApplicationSubmitted:
      return { name: "generate_lead", params: { lead_source: "partner" } }
    case AnalyticsEvent.contactSubmitted:
      return { name: "generate_lead", params: { lead_source: "contact" } }
    case AnalyticsEvent.donationSubmitted:
      return { name: "generate_lead", params: { lead_source: "donation" } }
    case AnalyticsEvent.claimSubmitted:
      return { name: "generate_lead", params: { lead_source: "claim" } }
    case AnalyticsEvent.itemCardClicked:
      return {
        name: "select_item",
        params: { item_id: String(props?.slug || ""), item_category: String(props?.category || "") },
      }
    case AnalyticsEvent.itemViewed:
      return {
        name: "view_item",
        params: {
          item_id: String(props?.slug || ""),
          item_name: String(props?.title || ""),
          item_category: String(props?.category || ""),
        },
      }
    default:
      return null
  }
}

function sendGtag(name: string, params: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return
  window.gtag("event", name, { ...params, send_to: GA4_MEASUREMENT_ID })
}

/** Fire a named event to PostHog, GA4 (gtag), and GTM dataLayer. */
export function track(event: string, properties?: Props) {
  const props = cleanProps(properties)

  if (isPostHogEnabled) {
    try {
      posthog.capture(event, props)
    } catch {
      // Never break UX if analytics fails.
    }
  }

  try {
    if (typeof window !== "undefined") {
      window.dataLayer = window.dataLayer || []
      window.dataLayer.push({ event, ...(props || {}) })
      sendGtag(event, props || {})
      const recommended = ga4Recommended(event, props)
      if (recommended) {
        sendGtag(recommended.name, recommended.params)
        window.dataLayer.push({ event: recommended.name, ...recommended.params })
      }
    }
  } catch {
    // ignore
  }
}

export function identifyDonor(distinctId: string, properties?: Props) {
  if (!isPostHogEnabled || !distinctId) return
  try {
    posthog.identify(distinctId, cleanProps(properties))
  } catch {
    // ignore
  }
}

export function resetAnalyticsIdentity() {
  if (!isPostHogEnabled) return
  try {
    posthog.reset()
  } catch {
    // ignore
  }
}

const PAGE_TITLES: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p === "/", title: "Home" },
  { match: (p) => p === "/drop" || p === "/wall", title: "Wall of Kindness" },
  { match: (p) => /^\/(drop|wall)\/[^/]+$/.test(p), title: "Item" },
  { match: (p) => p === "/give", title: "Drop an item" },
  { match: (p) => p.startsWith("/give/success"), title: "Donation submitted" },
  { match: (p) => p === "/track", title: "Track submission" },
  { match: (p) => p.startsWith("/track/"), title: "Submission status" },
  { match: (p) => p === "/partner", title: "Partner application" },
  { match: (p) => p === "/partner/login", title: "Partner login" },
  { match: (p) => p === "/partner/dashboard", title: "Partner dashboard" },
  { match: (p) => p === "/account/login", title: "Account login" },
  { match: (p) => p === "/account/onboarding", title: "Account onboarding" },
  { match: (p) => p === "/account", title: "Your account" },
  { match: (p) => p === "/love", title: "Wall of Love" },
  { match: (p) => p === "/map", title: "Impact map" },
  { match: (p) => p === "/about", title: "Our story" },
  { match: (p) => p === "/standards", title: "Quality standards" },
  { match: (p) => p === "/privacy", title: "Privacy" },
  { match: (p) => p === "/terms", title: "Terms" },
  { match: (p) => p === "/contact", title: "Contact" },
  { match: (p) => p === "/faq", title: "FAQs" },
  { match: (p) => p.startsWith("/admin"), title: "Admin" },
]

export function pageTitleForPath(pathname: string): string {
  const found = PAGE_TITLES.find((row) => row.match(pathname))
  return found ? `reloved | ${found.title}` : "reloved | Page not found"
}

/** SPA page view for PostHog $pageview, GA4 page_view, and GTM. */
export function trackPageView(pathname: string, search = "") {
  const pagePath = `${pathname}${search}`
  const pageTitle = pageTitleForPath(pathname)
  const pageLocation = typeof window !== "undefined" ? window.location.href : pagePath

  if (typeof document !== "undefined") {
    document.title = pageTitle
  }

  if (isPostHogEnabled) {
    try {
      posthog.capture("$pageview", {
        $current_url: pageLocation,
        $pathname: pathname,
        title: pageTitle,
      })
    } catch {
      // ignore
    }
  }

  const payload = {
    page_title: pageTitle,
    page_location: pageLocation,
    page_path: pagePath,
  }

  try {
    if (typeof window !== "undefined") {
      window.dataLayer = window.dataLayer || []
      window.dataLayer.push({ event: "virtualPageView", ...payload })
    }
  } catch {
    // ignore
  }

  const fireGtag = () => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return false
    window.gtag("event", "page_view", { ...payload, send_to: GA4_MEASUREMENT_ID })
    return true
  }

  if (!fireGtag() && typeof window !== "undefined") {
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      if (fireGtag() || attempts > 25) window.clearInterval(timer)
    }, 200)
  }
}
