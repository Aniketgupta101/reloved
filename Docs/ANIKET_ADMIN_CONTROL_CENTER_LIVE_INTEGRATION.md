# Aniket's Admin Control Center live-integration guide

Date: 2026-09-30

## Baseline already integrated

- `aniket/client-handover`: `70047f275c4a2585eaef514dce44308ec4dfc019`
- Original common ancestor: `5381ecb6eec7d0173cce163acb4430d2423223ee`
- Semantic merge: `bece18e7d3c4cd8d943aafca0796523c54ecc763`

Read `Docs/ADMIN_CONTROL_CENTER_HANDOFF.md` first. Merge the complete branch; the UI, shared contracts, backend reads, indexes, safety barriers and tests are one unit.

```text
git fetch --all --prune
git switch <current-integration-branch>
git pull --ff-only
git merge --no-ff origin/release/admin-dashboard
```

Do not assume `main` is the destination and do not rebase shared history. Newer destination security, lifecycle and provider behavior wins; retain the Control Center information architecture, read models, source coverage and local write barriers. Resolve conflicts semantically, never with whole-file `ours` or `theirs` for routes, analytics, API clients, indexes or manifests.

## Resolved merge areas

| Area | Integrated result |
| --- | --- |
| Analytics capture | Current events/Meta behavior in normal builds; fixture/live-read-only capture stops before provider calls. |
| Admin Overview | Control Center layout with current courier state/actions in Claim/Delivery detail. |
| Backend app | Control Center, Tasks, request timing and strict seed gating coexist. |
| API client | Structured provider errors and the live-read-only method barrier coexist. |
| Indexes/manifests | Latest live-flow indexes/dependencies and Control Center indexes/scripts are retained. |

## Action rules

- Preserve Brevo lifecycle/contact sends and MSG91 OTP/lifecycle sends. Do not add generic resend controls; no generic safe endpoints exist.
- Preserve Edesy masking readiness/call modes, Borzo status/estimate/book/sync/cancel, Shiprocket status/estimate/book/cancel and Shadowfax status/book/cancel.
- Control Center Shadowfax rebooking is explicit cancel then book. Cancellation failure must stop the compatibility force path.
- Preserve shared cross-provider booking leases and token-owned release. Any active provider order blocks a competing booking.
- Preserve Porter/manual payment recording without claiming a Porter API.
- Preserve Wall metadata/visibility edits and verified-original recovery. Do not expose unsupported arbitrary image replacement.
- Preserve Claim/Delivery decision, schedule/address, stage, notification, message and stale-action behavior.

## Environment names

Use existing untracked environment files or approved deployment secret storage. Never copy values into Git, logs or screenshots.

| Capability | Names |
| --- | --- |
| Admin/Firebase | `ADMIN_EMAIL`, `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `JWT_SECRET`, `GCLOUD_PROJECT` or `GOOGLE_CLOUD_PROJECT`, `FIREBASE_STORAGE_BUCKET` |
| Brevo/MSG91 | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_*_TEMPLATE_ID`, `OPS_DAILY_DELIVERIES_EMAILS`, `MSG91_AUTH_KEY`, `MSG91_SMS_TEMPLATE_ID`, `MSG91_OTP_SENDER`, `MSG91_TPL_*` |
| Edesy | `CALL_MASKING_ENABLED`, `EDESY_API_BASE`, `EDESY_API_KEY`, `EDESY_TENANT_ID`, `EDESY_MASKED_NUMBER_HINT`, `EDESY_INBOUND_WEBHOOK_SECRET`, `RELOVED_OPS_PRIMARY_PHONE`, `RELOVED_OPS_BACKUP_PHONE` |
| Borzo | `BORZO_API_BASE`, `BORZO_AUTH_TOKEN`, `BORZO_CALLBACK_SECRET`, `BORZO_OPS_PHONE` |
| Shiprocket | `SHIPROCKET_BOOKING_ENABLED`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_HSN`, `SHIPROCKET_OPS_PHONE` |
| Shadowfax | `SHADOWFAX_BOOKING_ENABLED`, `SHADOWFAX_BASE_URL`, `SHADOWFAX_TOKEN`, `SHADOWFAX_AUTH_STYLE`, `SHADOWFAX_OPS_PHONE` |
| Frontend | `VITE_API_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST` |
| PostHog reads | `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST` |
| Search/performance | `GOOGLE_ANALYTICS_PROPERTY_ID` or `GA_PROPERTY_ID`, `GOOGLE_SEARCH_CONSOLE_SITE`, approved `GOOGLE_APPLICATION_CREDENTIALS` or OAuth, `CRUX_API_KEY`, `PAGESPEED_API_KEY` |

Current PostHog configuration is capture-only and historical reads must report `misconfigured`. To enable them, add a Reloved-project personal key with only `query:read`, numeric project ID and private regional app host to backend secret storage. Never use `VITE_POSTHOG_PROJECT_TOKEN` or an `*.i.posthog.com` ingestion host for private queries. Google Analytics, Search Console, CrUX and dependable PageSpeed reads also remain unavailable until the named access is supplied.

## Verification and staging

```text
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:admin:ui
npm --prefix frontend run test:admin:live-readonly
npm --prefix frontend run test:admin:local
npm --prefix firebase-backend/functions test
```

1. Audit the outgoing diff for secrets, environment files, auth state and PII screenshots.
2. Deploy `firebase-backend/firestore.indexes.json` and wait for readiness. It includes the Control Center `messageThreads(subjectType ASC, lastMessageAt DESC)` index plus integrated items, OTP, notification and item-request indexes. No data migration exists.
3. Deploy functions to staging; verify admin auth and every Control Center GET.
4. Deploy frontend without `VITE_ADMIN_DATA_MODE=live-readonly` or `VITE_ADMIN_LIVE_READ_ONLY=1`.
5. With controlled staging identities, test one supported Brevo send/contact reply, MSG91 send, Edesy call, Claim decision, Delivery transition and Support reply.
6. For each enabled courier, test readiness, estimate where supported, booking, duplicate rejection, tracking/payment and cancellation. Shadowfax must confirm cancellation before another booking.
7. Verify Wall edits/recovery, notification outcomes, desktop/390/320 action parity, focus/dialogs and error/partial states.
8. If PostHog variables were added, require `connected` and compare aggregate results to the Reloved project. Otherwise require explicit `misconfigured`.

For read-only production review, run `npm --prefix frontend run admin:live-readonly` and open `http://127.0.0.1:3200/admin`. It must show `LIVE READ-ONLY · PRODUCTION DATA`; normal browsing must emit zero production writes and a local write probe must return `Live review is read-only.`

## Deployment and rollback

Deploy in this order: indexes, staging functions, staging frontend, controlled action validation, then production approval. On rollback, restore the previous frontend and functions, revert the admin integration, and leave indexes in place. Do not rotate/remove provider credentials or callbacks as part of the UI rollback. PostHog adapter failure can be isolated by removing its backend read variables; Firestore operational views remain independent.

## Agent-ready instruction

> Merge `origin/release/admin-dashboard` into the current integration branch without rebasing shared history. Treat `aniket/client-handover` at `70047f275c4a2585eaef514dce44308ec4dfc019` as integrated through `bece18e7d3c4cd8d943aafca0796523c54ecc763`. Preserve newer destination security/lifecycle/provider behavior while retaining the Control Center read router, typed contracts, source coverage and local write barriers. Do not commit environment files. Deploy indexes first in staging, then functions, then frontend, and complete the controlled verification before proposing production deployment.
