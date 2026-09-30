# Admin production parity audit

Date: 2026-09-30
Branch: `release/admin-dashboard`

## Integrated live baseline

- Original common ancestor: `5381ecb6eec7d0173cce163acb4430d2423223ee`
- Integrated `aniket/client-handover`: `70047f275c4a2585eaef514dce44308ec4dfc019`
- Semantic merge: `bece18e7d3c4cd8d943aafca0796523c54ecc763`

The 13 live commits after the common ancestor were audited before merge. `client-handover` owns current product, security, concurrency, courier, lifecycle and notification behavior. The admin branch owns the Control Center information architecture, read models, presentation and local live-read-only boundary. No production mutation, provider call, deployment or credential change was made.

## Current action and provider parity

| Capability | Current backend/API | Control Center result |
| --- | --- | --- |
| Drop moderation | `PATCH /api/admin/submissions/:id` | Review, approve and decline remain state-aware. Live review shows and blocks writes. |
| Wall editing | `PATCH /api/admin/items/:id` | Supported metadata and visibility edits are preserved; hard deletion is not introduced. |
| Wall images | `POST /api/admin/items/:id/attach-original` and existing recovery tools | Verified-original workflow remains available. Unsupported arbitrary image replacement is intentionally absent. |
| Claims | `PATCH /api/admin/item-requests/:id` | Decision, address/schedule and linked delivery actions preserve current lifecycle guards. |
| Deliveries | `PATCH /api/admin/orders/:id`, `PATCH /api/admin/item-requests/:id/delivery` | Current transitions and stale-action protection remain authoritative. |
| Communication audit | notification log, template catalog, `GET /api/admin/orders/:id/notifications` | Actual recorded email/SMS copy, status and attempts are visible. |
| Brevo | existing lifecycle sends and contact reply | Existing sends remain. No generic arbitrary resend endpoint or button is claimed. |
| MSG91 | existing OTP and lifecycle SMS | Existing sends remain. No generic arbitrary resend endpoint or button is claimed. |
| Edesy | masking status and call routes | Current call modes/readiness remain; live review blocks calls. |
| Borzo | status, estimate, book, sync, cancel | Tracking and subsidy/payment state remain visible; duplicate booking is guarded. |
| Shiprocket | status, estimate, book, cancel | AWB/tracking/payment state remain; no unsupported provider sync is claimed. |
| Shadowfax | status, book, cancel | AWB/tracking/payment remain. UI rebooking is explicit safe cancel then book. |
| Porter/manual | `courier/mark-reloved-paid` and manual delivery state | Existing offline workflow is preserved; no Porter API is invented. |
| Support | contact-message and Ask Reloved thread routes | The two sources retain their existing, separate reply behavior. |

## Provider safety invariants

- Borzo, Shiprocket and Shadowfax share one atomic claim booking lock.
- An active order from any provider blocks another provider booking.
- Booking leases have unique ownership tokens; an expired owner cannot release a newer lock.
- Shadowfax cancellation failure stops rebooking before subsidy release, claim mutation or a second booking.
- Shiprocket and Shadowfax booking flags default off. Provider readiness appears before cost-incurring controls are enabled.
- A provider status GET is not evidence that a real booking, call or recipient delivery succeeded; those need controlled staging verification.

Intentional retirements: no generic Brevo/MSG91 resend, no unsupported arbitrary Wall image mutation, and no one-click Shadowfax force-rebook in the Control Center. The compatibility force request is fail-closed on cancellation error. `POST /api/admin/threads/open` marks read and is treated as a mutation. Shiprocket and Shadowfax have no authoritative per-order sync route in the current backend.

## PostHog and analytics truth

The branch adds a backend-only PostHog adapter at `GET /api/admin/control-center/analytics/posthog`. It accepts `24h`, `7d` or `30d`, uses server-owned aggregate HogQL, strips unsafe labels, times out after 8 seconds, coalesces identical requests and caches for 90 seconds. It returns `connected`, `misconfigured`, `unauthorized`, `rate-limited` or `unavailable` without exposing credentials.

The supplied environment is **capture-only**. It has browser capture configuration but no historical read credential/project ID, so PostHog currently reports `misconfigured`. No actual Reloved PostHog dataset was used as acceptance evidence. Required backend-only names:

- `POSTHOG_PERSONAL_API_KEY`
- `POSTHOG_PROJECT_ID`
- `POSTHOG_HOST`

`VITE_POSTHOG_PROJECT_TOKEN` is a public capture token and is never accepted as a query credential.

Other missing read access:

| Source | Missing configuration/access |
| --- | --- |
| Google Analytics | `GOOGLE_ANALYTICS_PROPERTY_ID` or `GA_PROPERTY_ID` plus approved backend Google read credentials |
| Search Console | `GOOGLE_SEARCH_CONSOLE_SITE` plus approved service-account or OAuth read access |
| CrUX | `CRUX_API_KEY` for dependable authenticated quota |
| PageSpeed | `PAGESPEED_API_KEY` for dependable quota; local bundle evidence remains available |

Firestore operational truth remains independent of analytics providers. Behavioral cohorts are never mixed with incompatible all-time operational totals.

## Conflict resolutions

| Area | Final resolution |
| --- | --- |
| `frontend/src/lib/analytics.ts` | Current Meta/named-event behavior remains behind fixture/live-read-only capture guards. |
| `frontend/src/pages/admin/AdminDashboard.tsx` | The Control Center Overview stays; current provider state/actions moved into shared Claim/Delivery detail. |
| `firebase-backend/functions/src/app.ts` | Control Center, Tasks, timing and strict development seed gating all remain. |
| `frontend/src/lib/api.ts` | Structured provider errors and the live-read-only method barrier both remain. |
| `firebase-backend/firestore.indexes.json` | The union of Control Center and current live-flow indexes remains. |
| Package files and `frontend/index.html` | Current live dependencies/analytics and admin scripts/review safeguards remain. |

Local live review permits production `GET`/`HEAD` only through a loopback adapter and blocks `POST`, `PUT`, `PATCH` and `DELETE` in both frontend and adapter. Full-data evidence stays ignored because it can contain PII. The release owner records the final branch SHA and final test totals after all concurrent work is complete.
