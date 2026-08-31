import posthog from "posthog-js"

const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as string | undefined
const apiHost = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com"

export const isPostHogEnabled = Boolean(token)

if (token) {
  posthog.init(token, {
    api_host: apiHost,
    defaults: "2026-05-30",
    // React Router does not always emit a full page load. We send $pageview
    // from AnalyticsPageView so every route is counted once.
    capture_pageview: false,
    capture_pageleave: true,
  })
  if (typeof window !== "undefined") {
    ;(window as unknown as { posthog: typeof posthog }).posthog = posthog
  }
}

export { posthog }
