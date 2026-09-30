# Aniket's Admin Control Center live-integration guide

Date: 2026-09-30

## Purpose

This guide brings the completed Admin Control Center from `release/admin-dashboard` into Aniket's current integration branch without replacing newer vendor work. It is written for a coding agent working in the same checkout where the existing frontend `env` and backend `env.reloved-digital` files are already configured.

Read [the Control Center handoff](ADMIN_CONTROL_CENTER_HANDOFF.md) first. It is the authoritative record of scope, tests, API contracts and known limitations.

## What is being integrated

The branch adds the operational admin shell and read models for Overview, Notifications, Drops, Wall, Claims, Deliveries, Support and Analytics. It preserves the existing mutation and vendor routes:

- Brevo email templates and sending
- MSG91 SMS and OTP
- Edesy masking
- Borzo estimates, bookings, sync and cancellation
- Shiprocket and Shadowfax adapters
- existing admin authentication, public Give/Claim flows and notification logging

The Control Center adds authenticated, `no-store`, read-only API routes under `/api/admin/control-center`. It does not replace any provider adapter or expose vendor credentials to the browser.

## Before merging

1. Fetch every remote and identify Aniket's intended integration branch. Do not assume `main` or the old `client-handover` branch is the destination.
2. Record the destination branch and SHA in the merge commit or pull request description.
3. Keep the supplied `env` and `env.reloved-digital` files local. Inspect names only; never add, copy, print or commit their values.
4. Make a clean worktree from Aniket's destination branch before applying this work.

Suggested sequence once `release/admin-dashboard` is available on the remote:

```text
git fetch --all --prune
git switch <aniket-current-integration-branch>
git pull --ff-only
git merge --no-ff origin/release/admin-dashboard
```

Use a complete merge. Do not selectively copy UI files: the shared contracts, backend read services, Firestore index and regression tests form one unit. If a merge is impractical, use the ordered groups in [the handoff](ADMIN_CONTROL_CENTER_HANDOFF.md#rollback-and-aniket-integration) and retain each group's follow-up fixes.

## Conflict-resolution rules

The right resolution keeps Aniket's newest provider implementation and the Control Center's additive read layer.

| Area | Preserve from Aniket's current branch | Bring from `release/admin-dashboard` | Verify after resolution |
|---|---|---|---|
| `firebase-backend/functions/src/routes/admin.ts` | All provider mutation handlers, callback/webhook handling, notification sends, OTP and auth behavior | Existing admin controls remain reachable by their original paths | No mutation endpoint is removed or renamed |
| `firebase-backend/functions/src/routes/adminControlCenter.ts` and `src/app.ts` | Any current app/router registrations | The `/api/admin/control-center` router and `requireAdmin`/`Cache-Control: no-store` boundary | Every Control Center GET endpoint returns under an authenticated admin session |
| `src/lib/borzo.ts`, `shiprocket.ts`, `shadowfax.ts`, Edesy and notification services | The newest vendor request, signature, callback and error behavior | Do not move vendor secrets into frontend code; reuse provider-specific status/action contracts | Status reads, estimates, bookings, sync and cancellation still use the current adapters |
| `frontend/src/lib/api.ts` and admin components | Current public/API configuration | Data-mode safety guards, typed action surfaces and read-only controls | Production admin writes work only in a normal production build; the review build blocks every write |
| `shared/adminControlCenter.d.ts` and admin read services | Any newer compatible shared types | Complete Control Center contracts, pagination/cursor safeguards and source-coverage states | Failed or bounded reads never render as authoritative zero data |
| `firebase-backend/firestore.indexes.json` | Existing indexes | `messageThreads(subjectType ASC, lastMessageAt DESC)` | Index deployment is queued before staging tests |

When a conflict changes the shape of an order, item request, notification event or courier result, update the server-side mapper first. Do not join vendor payloads directly in the browser.

## Existing environment expected on Aniket's machine

Keep values in the existing local files. These are the variable names used by the current integrations:

| Capability | Variable names |
|---|---|
| Admin/session | `ADMIN_EMAIL`, `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `JWT_SECRET` |
| Firebase runtime | `GCLOUD_PROJECT` or `GOOGLE_CLOUD_PROJECT`, `FIREBASE_STORAGE_BUCKET` |
| Brevo | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_*_TEMPLATE_ID` |
| MSG91 | `MSG91_AUTH_KEY`, `MSG91_SMS_TEMPLATE_ID`, `MSG91_OTP_SENDER` |
| Edesy | `CALL_MASKING_ENABLED`, `EDESY_API_BASE`, `EDESY_API_KEY`, `EDESY_TENANT_ID`, `EDESY_INBOUND_WEBHOOK_SECRET` |
| Borzo | `BORZO_API_BASE`, `BORZO_AUTH_TOKEN`, `BORZO_CALLBACK_SECRET`, `BORZO_OPS_PHONE` |
| Shiprocket | `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_HSN`, `SHIPROCKET_OPS_PHONE` |
| Shadowfax | `SHADOWFAX_BASE_URL`, `SHADOWFAX_TOKEN`, `SHADOWFAX_AUTH_STYLE`, `SHADOWFAX_OPS_PHONE` |
| Browser runtime | `VITE_API_URL`, Firebase `VITE_FIREBASE_*`, `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST` |

The `admin:live-readonly` review runner intentionally creates its own loopback configuration. Never set `VITE_ADMIN_DATA_MODE=live-readonly` or `VITE_ADMIN_LIVE_READ_ONLY=1` in a deployed production build; those flags disable operational writes by design.

## Required verification before staging

Run these from the merged checkout:

```text
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:admin:ui
npm --prefix frontend run test:admin:live-readonly
npm --prefix frontend run test:admin:local
npm --prefix firebase-backend/functions run build
node --test firebase-backend/functions/lib/lib/adminControlCenter.test.js firebase-backend/functions/lib/lib/adminInventory.test.js firebase-backend/functions/lib/lib/adminOperations.test.js firebase-backend/functions/lib/lib/adminSupportAnalytics.test.js
```

For local emulator integration, use JDK 21 and the documented emulator setup in [Admin Control Center local QA](ADMIN_CONTROL_CENTER_LOCAL_QA.md). Run `npm --prefix frontend run test:admin:local:integration` only against `demo-reloved-admin` emulators.

Then run the production-read review locally:

```text
cd frontend
npm run admin:live-readonly
```

Open `http://127.0.0.1:3200/admin`. It must show `LIVE READ-ONLY · PRODUCTION DATA`. Verify that normal browsing emits no `POST`, `PUT`, `PATCH` or `DELETE`; every attempted write must fail locally with `Live review is read-only.`

## Staging validation order

1. Deploy the Firestore index and wait for it to become ready.
2. Deploy the merged functions to staging, then deploy the frontend to staging.
3. Sign in as a staging admin and verify every Control Center read route.
4. Use controlled staging identities to test one action in each side-effect family: Brevo email, MSG91 SMS, Edesy masked call, Borzo booking lifecycle, Shadowfax operation, Claim decision, Delivery stage, Ask Reloved reply and contact-form reply.
5. Confirm each action writes a notification event with an honest `sent`, `failed` or `skipped` outcome.
6. Verify failure states remain errors or partial coverage, never empty counts.
7. Check Overview, Notifications, Drops, Wall, Claims, Deliveries, Support and all Analytics sections at 1440px, 390px and 320px.
8. Compare the visible delivery/operator controls against the current production admin before approving production deployment.

No provider action was performed against production during this branch's review. Staging is the place to validate vendor behavior, callbacks, wallet/payment state and recipient delivery.

## Production deployment gate

Deploy only after staging validation is signed off. Before deployment, confirm:

- the current production integration branch contains all newer Borzo, Shadowfax, Brevo and MSG91 work;
- no `.env`, auth state, screenshots with PII or credentials appear in the outgoing diff;
- the Firestore index is ready;
- the normal production build does not contain review-only mode flags;
- the Control Center's central notification-history limitation is accepted: detailed recorded history is authoritative per Claim or Delivery, while a cross-entity History feed remains deferred until the backend has a cursor-backed global event read.

## Rollback

The Control Center is additive. Roll back by reverting the merge commit. No data migration is required. The added Firestore index can remain safely if it has already been deployed. Do not roll back provider credentials, callbacks or vendor configuration as part of this UI rollback.

## Agent-ready completion prompt

Use this with Aniket's agent after the branch is available:

> Merge `origin/release/admin-dashboard` into the current Reloved integration branch. Preserve the newest Borzo, Shadowfax, Brevo, MSG91, Edesy, OTP and webhook implementations already on the destination branch. Keep the Admin Control Center read router mounted at `/api/admin/control-center`, retain its source-coverage and cursor safeguards, and do not copy or commit any environment files. Run the verification commands in `Docs/ANIKET_ADMIN_CONTROL_CENTER_LIVE_INTEGRATION.md`, resolve all failures, then complete the staging validation checklist with controlled recipients before proposing deployment.
