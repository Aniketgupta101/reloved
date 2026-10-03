# Admin Control Center — Client Handover Merge Ledger

Date: 2026-09-30

## Merge facts

- Target branch: `release/admin-dashboard`
- Target before merge: `6e3cd620213a7ad53eacd10916b0b2c838fa47ad`
- Source branch: `aniket/client-handover`
- Source SHA: `70047f275c4a2585eaef514dce44308ec4dfc019`
- Original merge base: `5381ecb6eec7d0173cce163acb4430d2423223ee`
- Source commits since merge base: 13
- Merge policy: preserve the latest client-handover business, security, concurrency, courier, lifecycle and notification behavior; retain the Control Center information architecture and read-only review safety.

## Textual conflicts predicted before merge

| File | Current admin branch intent | Latest client-handover behavior | Final resolution |
| --- | --- | --- | --- |
| `frontend/src/lib/analytics.ts` | Suppress every analytics capture and mirrored write when local fixture or live read-only review mode is active. | Adds Meta Pixel standard events and SPA PageView handling while preserving PostHog, GA4, GTM and mirrored analytics behavior. | Keep the read-only capture barrier as the first guard in every capture path. Add the latest Meta event mapping and SPA PageView semantics behind the same barrier. Preserve the latest named events and event properties. |
| `frontend/src/pages/admin/AdminDashboard.tsx` | Implements the new typed, progressive Control Center Overview with operational KPIs, attention and delivery summaries. | Adds Shadowfax order state, duplicate protection, booking/rebooking and tracking controls to the legacy Overview card. | Keep the Control Center Overview. Transfer current Shadowfax fields and state-aware actions into the shared claim/delivery detail action surface so Overview links to the same safe operational workflow. Preserve backend duplicate-booking and force-rebook confirmation semantics; do not retain the legacy page layout. |

## Auto-merged files requiring semantic inspection

| File | Current admin branch intent | Latest client-handover behavior | Final resolution |
| --- | --- | --- | --- |
| `firebase-backend/functions/src/app.ts` | Mounts the typed Control Center read API and local live-read-only adapter boundary. | Adds request timing, `/api/tasks`, and emulator/flag gating for development seed routes. | Retain both routers, request timing and the stricter seed guard. Confirm router order does not bypass admin auth or the local write barrier. |
| `frontend/src/lib/api.ts` | Blocks non-read methods in live read-only mode and exposes typed Control Center clients. | Enriches API errors with structured details needed by current provider workflows. | Retain both the method barrier and structured provider error details. |
| `firebase-backend/firestore.indexes.json` | Adds Control Center support and pagination indexes. | Adds current item/item-request indexes for live flows. | Union the indexes without removing either set; validate JSON and document any deploy prerequisite without deploying it. |
| `frontend/package.json` and lockfile | Adds Control Center QA, live-read-only and browser verification scripts. | Adds current frontend tests and dependencies for the latest Give flow. | Keep all compatible scripts and dependency updates; reinstall only through the lockfile and run the combined test set. |
| `firebase-backend/functions/package.json` and lockfile | Supports the existing typed admin read-model tests. | Adds Tasks/HEIC dependencies and current backend security/concurrency tests. | Keep the current live dependencies and all admin verification commands; run both suites after merge. |

## Characterization baseline before merge

- Frontend typecheck: passed.
- Admin UI/browser suite: 25 passed.
- Live read-only suite: 30 passed.
- Local safety suite: 10 passed.
- Backend admin read-model suite: 71 passed.

These results characterize the pre-merge admin branch only. They are not final release evidence.
