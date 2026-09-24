import posthog from "posthog-js"

const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as string | undefined
const apiHost = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com"

export const isPostHogEnabled = Boolean(token)

function appEnvironment(hostname: string): "production" | "staging" | "preview" | "local" {
  if (hostname === "reloved.digital" || hostname === "www.reloved.digital") return "production"
  if (hostname === "test.reloved.digital") return "staging"
  if (hostname.includes("web.app") || hostname.includes("firebaseapp.com")) return "preview"
  return "local"
}

if (token) {
  posthog.init(token, {
    api_host: apiHost,
    defaults: "2026-05-30",
    // React Router does not always emit a full page load. We send $pageview
    // from GaPageView so every route is counted once.
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    person_profiles: "identified_only",
    loaded: (ph) => {
      if (typeof window === "undefined") return
      const host = window.location.hostname
      ph.register({
        host,
        app_host: host,
        app_environment: appEnvironment(host),
        app_domain: "reloved.digital",
      })
    },
  })
  if (typeof window !== "undefined") {
    ;(window as unknown as { posthog: typeof posthog }).posthog = posthog
  }
}

export { posthog, appEnvironment }
