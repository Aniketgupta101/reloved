# Task 3 — Analytics parity and responsive finish

Date: 2026-09-30
Branch: `release/admin-dashboard`
Base: `b630b1dbce75d8babe7386578796f2eb6ebae0eb`

## Delivered

- Daily Drops, Claims and Accounts use persisted entity timestamps across 7/14/30 Asia/Kolkata calendar days, ending at the exclusive snapshot boundary. Missing timestamps or incomplete required collections suppress period totals/trends rather than return plausible zeros.
- Funnel stages expose absolute counts, per-stage definitions and sources; all cross-stage conversion rates are null. Mirrored event stages explicitly retain their actual UTC bucket scope and tester limitations.
- Added Join/account activation, current Wall distribution, exclusive claim pipeline, current decision acceptance context (accepted versus accepted/rejected; pending/withdrawn excluded), soft declines/withdrawn, timestamp-based match/Reloved medians with valid/eligible sample counts, profile-joined giver/claimer/both roles and unresolved identity coverage.
- Category/audience/size compare current visible available inventory with selected-period Claim demand. Drop/Claim neighbourhoods reuse the existing public-area reducer and emit recognised neighbourhoods, never raw address text.
- Added available items aged 7+ days and pending Claims aged 3+ days, inclusive at the exact threshold. Totals require complete age evidence. Links target supported Wall filters, Notifications and exact item/claim detail routes.
- Preserved missing-item Claims until health checks; unknown/missing links are counted when sources are complete. Product/data-health counts are suppressed when their required sources are incomplete.
- Added a daily values table and keyboard-focusable chart/table scrolling. Added mobile range wrapping and confirmation wrapping. Existing Task 2 operational handlers and guards were not changed.
- Preserved the existing `/qr` route (verified in `frontend/src/App.tsx`). Short links explicitly show unavailable because no verified configured link payload reaches this snapshot.
- The separate live read-only adapter now suppresses uncertifiable legacy bounded operational aggregates. It no longer presents successful endpoint responses or historical sent attempts as globally complete metrics or evidence of recipient delivery. Actual PageSpeed/build results remain distinct from absent traffic/search/CrUX data.

## Exact changed files

- `firebase-backend/functions/src/lib/adminSupportAnalytics.ts`
- `firebase-backend/functions/src/lib/adminSupportAnalytics.test.ts`
- `firebase-backend/functions/src/routes/adminControlCenter.ts`
- `shared/adminControlCenter.d.ts`
- `frontend/src/pages/admin/AdminAnalytics.tsx`
- `frontend/src/components/admin/AdminAnalyticsContent.tsx`
- `frontend/src/components/admin/admin-analytics.css`
- `frontend/src/components/admin/admin-operations.css`
- `frontend/scripts/admin-live-readonly-api.mjs`
- `frontend/scripts/admin-live-readonly-data.mjs`
- `frontend/scripts/admin-live-readonly-data.test.mjs`
- `frontend/scripts/admin-ui.test.mjs`
- `frontend/scripts/admin-courier-confirmation-browser.test.mjs`
- This report.

## Verification

- Backend `npm run build`: passed.
- Backend `node --test lib/lib/adminSupportAnalytics.test.js`: **19/19 passed**.
- Frontend `npm run lint`: passed (TypeScript, no emit).
- Frontend `npm run build`: passed; existing large-chunk warning remains.
- Frontend `npm run test:admin:ui`: **22/22 passed**, including two mounted Chromium tests.
- Frontend `npm run test:admin:live-readonly`: **24/24 passed**.
- Frontend `npm run test:admin:local`: **10/10 passed**.
- `git diff --check`: passed.

Regression failures were observed before implementation for daily field/count truth and IST/14-day range, lost orphan checks/incomplete counts, decision denominator and parity summaries, absent UI parity, false legacy readiness, missing dates, private area text and exact aged thresholds. The mounted narrow-screen test exposed range-control overflow at 200% text; the new wrapping resolves it.

Mounted fixture coverage: 390×844 and 320×844 Overview, Notifications with long recorded copy, Claims, Deliveries, Calendar, Map fallback, focused courier confirmation and long tracking strings, all seven Analytics views, daily data table, 14-day selection, mobile menu Escape/focus return, and enlarged text. Reduced motion enabled. Assertions require viewport fit, visible action/control fit, no page errors, **zero external requests and zero mutation requests**. Existing stale cross-provider booking confirmation regression continues to pass.

## Limitations / next verification

- No deployment, push, production mutation, vendor request, environment-value inspection or other-branch modification was performed. No production/customer screenshot was created.
- The deployed legacy read endpoints cannot prove completeness; live-review operational totals now show unavailable. Deployable Firebase parity is verified with deterministic complete/partial fixtures, not asserted as already deployed.
- UTC event mirrors cannot produce IST event cohorts or unique-person conversion; this limitation is displayed. Operational entity series use Asia/Kolkata.
- No verified PostHog/GA4/Search Console/CrUX read payload or Short.io link payload was available. Missing timestamp pairs and unresolved role identities are reported as sample limitations, not inferred from `updatedAt` or guessed identities.
- Area reduction intentionally favours recognised Mumbai neighbourhoods; unrecognised data remains Unknown.
- Available age means age since creation, not continuously available duration. Pending age means age since claim creation, not an inferred item matching transition.
- Existing frontend main/map bundles still produce the >500 kB warning; splitting is outside this correctness/parity change.
- Full emulator integration and authenticated production/read-only browser tour belong to Task 4; this task ran the requested local safety suites and synthetic mounted browser flows.
- The pre-existing untracked plan `Docs/superpowers/plans/2026-09-30-admin-action-parity.md` is deliberately outside this commit.
