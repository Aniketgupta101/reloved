# Admin Analytics before and after

Date: 2026-09-30

This records the final analytics audit and preserves the useful parts of the production `AdminAnalytics` implementation that existed at the integration base.

## Useful capabilities in the previous page

The previous page contained:

- 7, 14 and 30 day range selection.
- High level totals for accounts, Drops, Wall inventory and Claims.
- Join, Drop and Claim journey blocks.
- Daily activity for accounts, Drops and Claims.
- Current Wall status distribution.
- Supply versus demand by category and audience.
- Top Drop and Claim areas.
- Median time to match and to Reloved, including sample sizes.
- Claim acceptance, giver/claimer role counts and claim status distribution.
- Stale available and matching inventory lists.
- Short share links for public routes.

The page also displayed conversion percentages between counters that were not cohort aligned. Those percentages were not reliable and are no longer presented as funnel conversion.

## Where each capability now lives

| Previous capability | Final location | Treatment |
|---|---|---|
| Accounts, Drops, Claims, matched and Reloved totals | Analytics Overview | Preserved with definitions, period scope and comparison only when defensible. |
| Daily activity | Analytics Overview | Preserved as a Drops versus Claims time series. Account activity remains available in source details until a reliable traffic reader is connected. |
| Drop and Claim journeys | Analytics Funnels | Preserved as recorded step counts. Mixed aggregate counters are labelled as non-cohort evidence. |
| Wall distribution | Analytics Product | Preserved as a ranked Wall status visualization. |
| Supply and demand by category/audience | Analytics Product | Preserved as paired comparison charts. |
| Size movement | Analytics Product | Added, with the leading sizes and an aggregated Other sizes row. |
| Top areas | Analytics Product | Preserved for Drops and Claims. |
| Median fulfillment times and acceptance | Analytics Overview and Product | Preserved. Unreliable or undersampled values show an explicit unavailable state. |
| Stale inventory and broken links | Analytics Data Health and operational inboxes | Moved to actionable health checks and deep links. |
| Role counts and status pipeline | Analytics Product, Funnels and operational pages | Preserved where the current production read model has reliable evidence. |
| Public share links | Public routes and existing short-link source | Kept out of the analytics decision surface because they are navigation utilities rather than measurements. |

## New final experience

- **Overview:** executive KPIs, operational activity trend, conversion summary, top interactions and an honest unavailable state for traffic metrics.
- **Traffic:** Page views, visitors, sessions, top pages, referrers and campaigns once backend-only PostHog query access is configured.
- **Funnels:** Drop and Claim journey visualizations using actual mirrored event counts and persisted outcomes without manufactured stages.
- **Search:** Search Console clicks, impressions, CTR, position, queries, landing pages and trend once read access is configured.
- **Performance:** Chrome field data, PageSpeed lab data and actual local production bundle weight kept as separate evidence types.
- **Product:** Category, audience, size, geography, Wall state and fulfillment measures from production operational records.
- **Data health:** actionable record checks, communication failures, integration readiness and last activity signals.

The primary UI uses business terms. Collection names, inspected-record counts and source coverage are available only inside **Data details**.
