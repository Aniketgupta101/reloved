# Reloved Admin Control Center handoff

Date: 2026-10-01
Branch: `release/admin-dashboard`

Read this first. `aniket/client-handover` at `70047f275c4a2585eaef514dce44308ec4dfc019` is already integrated through merge `bece18e7d3c4cd8d943aafca0796523c54ecc763`; the original common ancestor was `5381ecb6eec7d0173cce163acb4430d2423223ee`.

Verified implementation SHA before the evidence/docs finalization commit: `15c7341d1d4d9c036937c3ff032d59e820fe99b5`. Use `git rev-parse HEAD` for the final branch SHA after the evidence commit.

## Delivered product

Overview, Notifications, Drops, Wall, Claims, Deliveries, Support and Analytics now use typed, bounded admin read models with explicit loading, empty, ready, partial/stale and error states. Existing admin mutations and provider adapters remain the action boundary. Automations is an inventory of existing jobs, not a new engine. Public Give/Claim behavior remains owned by the integrated live branch.

## Architecture and read endpoints

```text
Admin UI -> authenticated Admin API
         -> Control Center read services -> Firestore / notification logs / analytics adapters
         -> existing action routes       -> Brevo / MSG91 / Edesy / courier adapters
```

The browser never receives vendor or PostHog read credentials. Shared contracts live in `shared/adminControlCenter.d.ts`.

- `GET /api/admin/control-center/overview?range=24h|7d`
- `GET /api/admin/control-center/attention?category=&limit=&cursor=`
- Drops: `/drops`, `/drops/:id`, `/drops/:id/items`, `/drops/funnel`
- Wall: `/wall`, `/wall/:id`, `/wall/:id/claims`
- Claims: `/claims`, `/claims/:id`, `/claims/funnel`
- Deliveries: `/deliveries`, `/deliveries/:id`, `/deliveries/:id/communications`
- `GET /api/admin/control-center/support`
- `GET /api/admin/control-center/analytics/snapshot?range=7d|14d|30d`
- `GET /api/admin/control-center/analytics/posthog?range=24h|7d|30d`

## Integrated behavior and intentional limits

- Brevo lifecycle sends/contact reply and MSG91 OTP/lifecycle SMS are preserved. No generic arbitrary resend endpoint exists, so none is invented.
- Edesy readiness and masked-call modes are preserved.
- Borzo keeps readiness, estimate, book, sync, cancel, tracking and payment/subsidy state.
- Shiprocket keeps readiness, estimate, book, cancel and AWB/tracking/payment state. No provider sync is claimed.
- Shadowfax keeps readiness, book, cancel and AWB/tracking/payment state. The UI uses explicit cancel then book; cancellation failure stops the compatibility force path.
- Porter/manual booking and Reloved-paid recording remain explicit; no Porter API is claimed.
- Wall supports current metadata/visibility edits and verified-original recovery. Arbitrary image replacement is intentionally absent.
- Claim/Delivery decision, schedule, address, stage, notification, message and contact routes retain current stale-action guards.
- Ask Reloved and contact-form support remain separate workflows.

The shared Borzo/Shiprocket/Shadowfax booking lease uses unique ownership tokens. Active cross-provider orders block competing bookings, a stale owner cannot release a newer lock, and only the current lease owner can persist a successful provider response. Provider action confirmations are bound to the displayed provider order identity, so a confirmation for order A cannot cancel or sync replacement order B. A confirmed provider cancellation clears historical booked/dispatched UI blocking for a new booking, while pickup and completed handovers remain irreversible. Claim decisions also use a Firestore transaction across the claim and live Wall item; stale/conflicting decisions return `409` and notifications run only after the winning transaction commits.

## PostHog backend adapter

The adapter requires backend-only `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` and `POSTHOG_HOST`. It uses allowlisted aggregate queries, sanitized responses, an 8-second timeout, a 90-second cache and in-flight coalescing. Raw people, distinct IDs, credentials and unbounded properties are not returned.

Current supplied configuration is capture-only (`VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST`). Historical reads are therefore **misconfigured**, and actual PostHog analytics are not live. Add a Reloved-project personal API key with only `query:read`, the numeric project ID and private regional app host in approved backend secret storage before staging can return `connected`.

## Environment names only

| Capability | Variable names |
| --- | --- |
| Admin/session | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `JWT_SECRET` |
| Firebase | `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, `FIREBASE_STORAGE_BUCKET` |
| Browser/API | `VITE_API_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST` |
| Local review | `VITE_ADMIN_DATA_MODE`, `VITE_ADMIN_LIVE_READ_ONLY`, `VITE_ADMIN_LOCAL_QA`, `VITE_DEV_API_PROXY`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST` |
| Brevo | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, existing `BREVO_*_TEMPLATE_ID`, `OPS_DAILY_DELIVERIES_EMAILS` |
| MSG91 | `MSG91_AUTH_KEY`, `MSG91_SMS_TEMPLATE_ID`, `MSG91_OTP_SENDER`, existing `MSG91_TPL_*` |
| Edesy | `CALL_MASKING_ENABLED`, `EDESY_API_BASE`, `EDESY_API_KEY`, `EDESY_TENANT_ID`, `EDESY_MASKED_NUMBER_HINT`, `EDESY_INBOUND_WEBHOOK_SECRET`, `RELOVED_OPS_PRIMARY_PHONE`, `RELOVED_OPS_BACKUP_PHONE` |
| Borzo | `BORZO_API_BASE`, `BORZO_AUTH_TOKEN`, `BORZO_CALLBACK_SECRET`, `BORZO_OPS_PHONE` |
| Shiprocket | `SHIPROCKET_BOOKING_ENABLED`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_HSN`, `SHIPROCKET_OPS_PHONE` |
| Shadowfax | `SHADOWFAX_BOOKING_ENABLED`, `SHADOWFAX_BASE_URL`, `SHADOWFAX_TOKEN`, `SHADOWFAX_AUTH_STYLE`, `SHADOWFAX_OPS_PHONE` |
| PostHog reads | `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST` |
| Other reads | `GOOGLE_ANALYTICS_PROPERTY_ID` or `GA_PROPERTY_ID`, `GOOGLE_SEARCH_CONSOLE_SITE`, approved `GOOGLE_APPLICATION_CREDENTIALS` or OAuth, `CRUX_API_KEY`, `PAGESPEED_API_KEY` |

## Indexes and migrations

No data migration is required. Deploy `firebase-backend/firestore.indexes.json` as a unit. It contains `messageThreads(subjectType ASC, lastMessageAt DESC)` plus current live-flow indexes for items, OTP codes, notification history and item requests. Wait for readiness before staging reads.

## Local modes

- `LOCAL FIXTURE DATA`: deterministic emulators for UI and mutation testing.
- `LIVE READ-ONLY · PRODUCTION DATA`: production reads through a loopback adapter with frontend and adapter write barriers.

Live review permits production `GET` and `HEAD` only. Provider calls, sends, bookings, replies, state changes and browser analytics capture are disabled. Blocked writes return `Live review is read-only.`

## Known unavailable reads

- PostHog: missing all three backend read variables; current environment is capture-only.
- Google Analytics: missing property ID and approved backend read identity.
- Search Console: missing site property and approved service-account/OAuth access.
- CrUX/PageSpeed: dependable quota requires `CRUX_API_KEY` and `PAGESPEED_API_KEY`; local bundle metrics remain.
- Bounded deployed list routes cannot prove global totals; unsupported totals remain unavailable instead of becoming zeros.

## Verification completed

| Gate | Result |
| --- | --- |
| Frontend typecheck | Passed |
| Frontend unit tests | 26/26 passed |
| Frontend production build | Passed; Analytics is a separate route chunk |
| Admin UI/browser tests | 28/28 passed |
| Live read-only tests | 32/32 passed |
| Local emulator/network safety tests | 10/10 passed |
| Backend tests | 54/54 passed |
| Privacy-safe live browser review | 28 screenshots + walkthrough, zero writes, zero unexpected remotes |

Evidence is under `Docs/admin-control-center-evidence/live-readonly/`. The machine-readable proof is `network-write-barrier-proof.json`. Full-data screenshots remain outside Git; committed screenshots mask email, phone, addresses, notes and exact coordinates.

## Performance result

The cold local live Overview improved from 5,668 ms to 2,077 ms (63%) by removing unrelated collection and notification-history loads from its critical path. A warm request served in 2 ms. Analytics loads independently, PostHog has an eight-second timeout and 90-second cache, and the operations home never waits for PostHog or provider checks. See `Docs/ADMIN_PERFORMANCE_AUDIT.md`.

The main production bundle remains 1,496.57 KB minified (428.52 KB gzip) and MapLibre remains 763.38 KB. These are documented follow-up risks; the Analytics route is split into a 32.22 KB JavaScript chunk.

## Remaining risks

- PostHog, Search Console, Google Analytics and dependable CrUX/PageSpeed reads require the named backend-only access before those panels can show live provider data.
- A courier provider may accept a remote booking response after the local lease expired. The stale response cannot mutate Firestore or subsidy state, but a provider-side orphan may require operational reconciliation.
- Current production list endpoints are bounded legacy reads, so global totals remain unavailable until the new read endpoints are deployed.
- Provider sends, calls and paid bookings were not fired against production. Complete one controlled staging lifecycle per enabled provider before production approval.

## Deployment order

1. Audit the outgoing diff for environment files, credentials, auth state and PII evidence.
2. Confirm required variables by name in staging secret storage.
3. Deploy the complete Firestore index manifest and wait for readiness.
4. Deploy backend functions to staging and verify admin auth plus every Control Center GET.
5. Deploy frontend to staging without review-only flags.
6. With controlled staging identities, verify lifecycle email/SMS, masked calls, support replies, claim decisions, delivery transitions and each enabled courier lifecycle, including duplicate-booking rejection.
7. Verify notification outcomes, desktop/mobile access, partial/error states, analytics source labels and performance.
8. Approve production only after staging and final diff/secret review.

## Rollback

Roll back frontend and functions to the prior approved release together when shared contracts changed. Revert the integration commit(s); no data rollback is needed. Firestore indexes may remain. Do not remove provider credentials or callbacks as part of an Admin UI rollback. If only PostHog reads fail, remove its three backend read variables or roll back the adapter route; operational Firestore views remain independent.

See `Docs/ANIKET_ADMIN_CONTROL_CENTER_LIVE_INTEGRATION.md` for the executable integration checklist and `Docs/ADMIN_PRODUCTION_PARITY_AUDIT.md` for the action matrix.
