import { isPostHogEnabled, posthog } from "@/lib/posthog"

/** Named product events for funnels (alongside PostHog autocapture). */
export const AnalyticsEvent = {
  ctaDropItem: "cta_drop_item_clicked",
  ctaClaimItem: "cta_claim_item_clicked",
  ctaExploreWall: "cta_explore_wall_clicked",
  navLink: "nav_link_clicked",
  navAccount: "nav_account_clicked",
  itemCardClicked: "item_card_clicked",
  claimStarted: "claim_started",
  claimSubmitted: "claim_submitted",
  claimFailed: "claim_failed",
  donationSubmitted: "donation_submitted",
  donationFailed: "donation_failed",
  donationCompleted: "donation_completed",
  trackLookup: "track_lookup_submitted",
  loginCompleted: "login_completed",
} as const

type Props = Record<string, string | number | boolean | null | undefined>

function cleanProps(properties?: Props): Record<string, string | number | boolean | null> | undefined {
  if (!properties) return undefined
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

export function track(event: string, properties?: Props) {
  if (!isPostHogEnabled) return
  try {
    posthog.capture(event, cleanProps(properties))
  } catch {
    // Never break UX if analytics fails.
  }
}

export function identifyDonor(distinctId: string, properties?: Props) {
  if (!isPostHogEnabled) return
  try {
    posthog.identify(distinctId, cleanProps(properties))
  } catch {
    // ignore
  }
}
