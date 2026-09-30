# Reloved Admin Control Center handoff

Date: 2026-09-30
Branch: `release/admin-dashboard`

Read this first. `aniket/client-handover` at `70047f275c4a2585eaef514dce44308ec4dfc019` is already integrated through merge `bece18e7d3c4cd8d943aafca0796523c54ecc763`; the original common ancestor was `5381ecb6eec7d0173cce163acb4430d2423223ee`.

The final branch SHA and test totals are intentionally left to release finalization after concurrent work stops.

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

The shared Borzo/Shiprocket/Shadowfax booking lease uses unique ownership tokens. Active cross-provider orders block competing bookings, and a stale owner cannot release a newer lock.

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
