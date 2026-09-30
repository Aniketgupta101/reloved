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

## Independent review fix round 1 — 2026-09-30

Resolved all four Important findings in `task-3-review.md`:

- **S1:** The real live bundle loader and its cache now distinguish 7, 14 and 30 days, with 14, 28 and 60-day comparison reads respectively. A dispatcher-through-loader regression uses an in-memory client to assert the exact upstream primary/comparison requests, returned range/date boundaries and cache reuse across all three selections. The test first failed with September 24 instead of September 17 for a 14-day selection ending September 30; it now passes.
- **P1:** Restored a separate `stuckMatching` summary for Wall inventory with `publicStatus === being_matched`, aged at least three days since recorded creation. Includes hidden matching inventory as in the legacy source, uses item/profile completeness and candidate date gates, includes the exact threshold, and exposes supported Wall filters plus focused item links. Pending-claim ageing remains an additional `pendingClaims` insight. The regression covers an old matching item whose claim is already approved, plus undated and partial-source suppression.
- **P2:** Acceptance definitions suppress numerator and denominator entirely whenever any required profile, item or claim source is partial/unavailable. Tests check both the percentage and visible definition in Product and Overview for every incomplete dependency. Complete-source definitions retain the decision context.
- **P3:** The earlier report's root-font-based 200% claim was not valid evidence and is superseded by this verification. The mounted test now snapshots each rendered element's computed font size and line height, sets both to twice their baseline pixel values, and asserts representative text actually doubles. Original inline styles are restored before each measurement so newly mounted children cannot inherit an already enlarged baseline. This is measured programmatic text enlargement, not a claim of native browser zoom testing.

The enlarged-text test runs normal and doubled-text flows at **390×844 and 320×844**, waiting for populated Overview delivery rows/KPIs, Notifications, Claims and Deliveries; it also covers Calendar, Map fallback, long tracking strings, courier confirmation, all seven Analytics sections, and the populated daily table. Numeric metrics, activation/funnel stages, product categories, roles and pipeline rows are synthetic fixtures. At least 30 enlarged-surface checks assert representative font doubling, including table header and confirmation text. Checks assert document/control bounds and text-container clipping, in addition to zero mutation requests, zero external requests and zero page errors. Mobile menu Escape/focus restoration and reduced motion remain covered.

This stronger regression reproduced a real clipped `1,234` Overview total under doubled text (162px content in a 148px card). Overview and Analytics metric grids now use text-relative minimum card widths so enlarged text gets a full row when necessary. The full mounted tour passes after this fix.

### Follow-up changed files

- `firebase-backend/functions/src/lib/adminSupportAnalytics.ts`
- `firebase-backend/functions/src/lib/adminSupportAnalytics.test.ts`
- `frontend/scripts/admin-live-readonly-api.mjs`
- `frontend/scripts/admin-live-readonly-data.mjs`
- `frontend/scripts/admin-live-readonly.test.mjs`
- `frontend/scripts/admin-courier-confirmation-browser.test.mjs`
- `frontend/src/styles/admin.css`
- `frontend/src/components/admin/admin-analytics.css`
- This report.

### Final follow-up verification

- Backend build: passed; focused analytics/support suite **21/21 passed**.
- Frontend TypeScript/lint and production build: passed.
- Frontend admin UI suite: **22/22 passed**, including both mounted Chromium regressions.
- Frontend live-readonly suite: **25/25 passed**.
- Frontend local safety suite: **10/10 passed**.
- Focused real-loader/dispatcher file: **12/12 passed**.
- `git diff --check`: passed.

The existing bundle-size warning remains. No environment values were inspected, no production/vendor access or mutation was performed, and no push/deployment occurred. The untracked plan was not modified or staged. Task 4's emulator integration/authenticated tour remains outside this fix round.

## Independent re-review fix round 2 — 2026-09-30

- **R1 resolved:** The live adapter now derives current and previous 7/14/30 calendar periods from the supplied snapshot time in `Asia/Kolkata`. It no longer copies the legacy endpoint's UTC bucket dates into the selected Indian period. `asOf` is explicitly set from the same snapshot time. A regression first reproduced the wrong September dates, then verified all three ranges at `2026-09-30T20:00:00Z` (October 1, 01:30 IST): current ranges September 25–October 1, September 18–October 1, and September 2–October 1; previous ranges September 18–24, September 4–17, and August 3–September 1. The dispatcher/loader regression now uses a fixed snapshot clock, so its date assertions cannot drift with the test execution date.
- **M1 resolved:** The enlarged-text Chromium tour now records every non-GET/HEAD request with a browser-context request listener, independent of route matching. The admin-route handler continues to abort writes without being the observation mechanism. The context-wide listener reports zero writes across the full populated 390/320 normal/doubled-text matrix; zero external requests and page errors also remain asserted.

Changed files: `frontend/scripts/admin-live-readonly-data.mjs`, `frontend/scripts/admin-live-readonly-data.test.mjs`, `frontend/scripts/admin-live-readonly.test.mjs`, `frontend/scripts/admin-courier-confirmation-browser.test.mjs`, and this report.

Verification: frontend types/lint and production build passed; admin UI **22/22**, live-readonly **26/26**, local safety **10/10** passed; backend build and analytics/support **21/21** passed; `git diff --check` passed. The existing bundle-size warning remains. No environment values, production/vendor access, push/deployment or plan edits were involved.
