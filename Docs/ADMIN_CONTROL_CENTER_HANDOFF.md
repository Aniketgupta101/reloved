# Reloved Admin Control Center handoff

Date: 2026-09-29

Branch: `release/admin-dashboard`

Base: `aniket/client-handover` at `5381ecb6eec7d0173cce163acb4430d2423223ee`

Final reviewed implementation SHA before handoff cleanup: `9554bff03ea3bea7af00ebc0c17442bc9311017b`

Final branch SHA: use `git rev-parse HEAD` after the handoff commit; it is also recorded in the delivery message.

No commits were pushed, no pull request was opened, and nothing was deployed.

## Delivered product

- Overview: defensible KPIs, today operations, next 48 hours, waiting-on-people and communication attention.
- Notifications: actionable inbox derived from claims, deliveries, support and notification logs.
- Drops: Give evidence, complete paged inventory, search/filtering, moderation and linked detail.
- Wall: admin catalog with hidden/withdrawn inventory, filters, linked claims, visibility and metadata controls.
- Claims: visible evidence funnel, paged operational states, linked people/item/delivery, real next actions and chat.
- Deliveries: Today, Next 48h, Calendar day/week, overdue, unscheduled, completed, all, coordinate map/fallback, communication audit and existing manual lifecycle actions.
- Support: unified Ask Reloved/contact inbox with Unread, Open, Actioned and All; existing chat and email reply paths remain distinct.
- Analytics: Overview, Acquisition, Activation, Drop Funnel, Claim Funnel, Fulfillment, Retention and Supply & Demand with source/definition labels and explicit unavailable states.
- Automations: read-only inventory of the existing 09:00 digest and lifecycle notifications; no new automation engine.

## Architecture and contracts

The frontend calls the authenticated existing Admin API. Focused read services aggregate bounded Firestore reads and notification history into the shared contracts in `shared/adminControlCenter.d.ts`. Existing mutation and vendor adapter routes remain the only write/side-effect paths.

New authenticated read endpoints:

- `GET /api/admin/control-center/overview?range=24h|7d`
- `GET /api/admin/control-center/attention?category=&limit=&cursor=`
- `GET /api/admin/control-center/drops` and `/drops/:id`
- `GET /api/admin/control-center/drops/:id/items`
- `GET /api/admin/control-center/drops/funnel`
- `GET /api/admin/control-center/wall` and `/wall/:id`
- `GET /api/admin/control-center/wall/:id/claims`
- `GET /api/admin/control-center/claims` and `/claims/:id`
- `GET /api/admin/control-center/claims/funnel`
- `GET /api/admin/control-center/deliveries` and `/deliveries/:id`
- `GET /api/admin/control-center/deliveries/:id/communications`
- `GET /api/admin/control-center/support`
- `GET /api/admin/control-center/analytics/snapshot?range=7d|30d`

Primary shared models include `AdminOverviewSnapshot`, `AttentionItem`, `DropAdminRow`, `WallAdminItem`, `OperationRow`, `OperationDetail`, `CommunicationRow`, `SupportThreadSummary`, `AnalyticsMetric` and `AnalyticsSnapshot`.

## Index and migrations

No data migration is required. One Firestore composite index was added:

- `messageThreads`: `subjectType ASC`, `lastMessageAt DESC`

Deploy the index before staging validation. Existing single-field indexes cover the other read paths.

## Integration preservation

- Brevo and MSG91 sends still run through the existing backend notification/template services and notification log.
- OTP behavior and authentication routes are unchanged.
- Edesy masking still uses `/api/admin/calls/masking-status` and `/api/admin/calls/mask`; stale records cannot trigger calls.
- Courier adapters and booking endpoints were not refactored or invoked by local QA.
- Ask Reloved chat uses the stored support owner identity; contact forms keep the existing Brevo reply route.
- PostHog/browser analytics production behavior is unchanged. Local QA strips and blocks capture.
- Public Give, Claim, Wall and public-site presentation were not redesigned.

Relevant environment variable names only:

- Auth/runtime: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `JWT_SECRET`, `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, `FIREBASE_STORAGE_BUCKET`.
- Local QA: `ADMIN_LOCAL_QA`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`, `VITE_ADMIN_LOCAL_QA`, `VITE_API_URL`, `VITE_DEV_API_PROXY`, `VITE_FIREBASE_PROJECT_ID`.
- Communications: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_CONTACT_REPLY_TEMPLATE_ID`, `MSG91_AUTH_KEY`, `MSG91_SMS_TEMPLATE_ID`, `MSG91_OTP_SENDER` and the existing `BREVO_*_TEMPLATE_ID` variables.
- Calls/couriers: `CALL_MASKING_ENABLED`, `EDESY_API_BASE`, `EDESY_API_KEY`, `EDESY_TENANT_ID`, `BORZO_API_BASE`, `BORZO_AUTH_TOKEN`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHADOWFAX_BASE_URL`, `SHADOWFAX_TOKEN`.
- Analytics: `VITE_POSTHOG_PROJECT_TOKEN`.

Secret values were never copied into this worktree, documentation, evidence or commits.

## Verification

- Backend TypeScript build: passed.
- Backend admin/read-model tests: 55 passed.
- Frontend TypeScript check: passed.
- Frontend admin UI tests: 12 passed.
- Local safety/network/fixture tests: 10 passed.
- Signed emulator integration: 1 passed.
- Normal frontend production build: passed. Vite retains the existing large-chunk warning.
- Final production-built local browser proof: passed on 1440, 1280, 1024, 768, 390 and 320 widths; 200% text, reduced motion, keyboard skip/menu focus, native dialog Escape and all eight primary pages were exercised.
- Browser network gate: zero external requests, zero uncaught page errors and zero failed responses.
- Independent reviews: Tasks 1–6 and the complete branch were reviewed; every Critical/Important finding was fixed and re-reviewed. The final complete-branch re-review found no remaining blockers.

Evidence is intentionally ignored by Git and remains under `frontend/qa-artifacts/admin-control-center/`:

- Final screenshots: `final/{overview,notifications,drops,wall,claims,deliveries,support,analytics}-1440.png`
- Responsive screenshots: `final/overview-{1280,1024,768,390,320}.png`
- Text pressure: `final/support-390-text-200.png`
- Walkthrough: `final/admin-control-center-walkthrough.webm`
- Machine proof: `final/proof.json`

## Local run

1. Use Node 22+ and JDK 21+. Set `JAVA_HOME` to `firebase-backend/.firebase/local-tools/jdk-21.0.12.1+1-jre/Contents/Home` in this checkout.
2. Run `npm --prefix firebase-backend/functions run build`.
3. Run `npm --prefix frontend run admin:local`.
4. In another terminal run `npm --prefix frontend run admin:local:seed`.
5. Open `http://127.0.0.1:3100/admin` and sign in with the documented synthetic local account in `Docs/ADMIN_CONTROL_CENTER_LOCAL_QA.md`.

The runner uses only `demo-reloved-admin`, loopback emulators and a process-sanitized environment. It refuses production origins and provider credentials.

## Remaining limitations

- Retention, acquisition attribution and reliable active-user metrics display “Not enough reliable data yet.”
- Analytics uses bounded operational snapshots and mirrored daily events; it is not a warehouse or historical backfill.
- List screens deliberately expose partial coverage and continuation when linked history exceeds bounded read budgets.
- Map plots only existing valid coordinate pairs with no geocoding or tiles. The delivery list remains primary.
- The UI does not create courier bookings or arbitrary resends; it exposes only capabilities already supported by backend routes.
- Production bundle splitting remains future work; the build reports the pre-existing large-chunk warning.

## Staging validation

1. Deploy the Firestore index and wait until it is ready.
2. Confirm admin auth and every new read endpoint with a staging admin account.
3. Check Overview totals against direct staging source queries for one known period.
4. Test one non-sending notification preview and confirm the sandbox blocks remote subresources.
5. Test one Ask Reloved reply, one contact reply, one masked-call request and one manual delivery transition with controlled staging recipients.
6. Confirm notification events record sent/failed/skipped outcomes and that no failure renders as zero/empty.
7. Recheck all primary pages at desktop and mobile and monitor function read counts/latency.

## Rollback and Aniket integration

- The branch is additive and isolated. Roll back by reverting the branch commits in reverse order; no data rollback is needed.
- If the new support index was deployed, it may remain safely or be removed after reverting the support endpoint.
- Preferred integration: review and merge the complete `release/admin-dashboard` branch onto Aniket's current integration branch after reconfirming the base relationship.
- For selective integration, cherry-pick in the commit order below; keep each implementation commit with its following fix commits.

Commit order:

1. `dc217cf`, `f1203b0` — audit and plan.
2. `36093e5`, `9111007` — safe local harness.
3. `7aef207`, `8e6eb14` — Overview/attention backend.
4. `dc21d17`, `a7ab9aa` — shell, Overview and Notifications.
5. `40b2884`, `c6c4dcc`, `5dad80c` — Drops and Wall.
6. `471a162`, `35e89bd`, `2f8ac2e` — Claims and Deliveries.
7. `d4c2bb0`, `4ad36fa`, `5f3315f` — Support and Analytics.
8. `655b832` — final browser proof and fixture correction.
9. `9de542d`, `9554bff` — handoff and complete-review fixes.
10. Final handoff cleanup commit follows.
