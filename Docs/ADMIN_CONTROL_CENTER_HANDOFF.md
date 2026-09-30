# Reloved Admin Control Center handoff

Date: 2026-09-30

Branch: `release/admin-dashboard`

Base: `aniket/client-handover` at `5381ecb6eec7d0173cce163acb4430d2423223ee`

Reviewed implementation SHA before the live integration pass: `9554bff03ea3bea7af00ebc0c17442bc9311017b`

Live integration pass starting SHA: `e1363d78de3246dfe689019c5e70ff614022ffe6`

Independent-review blocker-fix baseline SHA: `9bfeb2ca17cc42373a53ca7d3b07d91c6cf99e32`

Final verified implementation/evidence SHA: `7823f274aa036208e6640bfec208e075d7d0c254`

Final branch SHA: use `git rev-parse HEAD` after the handoff commit; it is also recorded in the delivery message.

No commits were pushed, no pull request was opened, and nothing was deployed.

## Final live read-only integration pass

Two deliberately separate local review modes are available:

- `LOCAL FIXTURE DATA` at `http://127.0.0.1:3100/admin` for deterministic emulator tests.
- `LIVE READ-ONLY · PRODUCTION DATA` at `http://127.0.0.1:3200/admin` for production review with masked personal data.

The live review runner builds the real frontend, starts a loopback-only adapter, mints a short-lived admin read token locally and calls the existing deployed Admin API using only `GET` and `HEAD`. It does not deploy the new control-center read endpoints. The adapter converts existing production reads into the same typed view models used by fixture mode.

The live safety boundary is enforced twice:

1. The frontend admin request layer rejects `POST`, `PUT`, `PATCH` and `DELETE` with `Live review is read-only.`
2. The loopback adapter rejects those methods before route dispatch or any production request and logs only method/path metadata.

Production images are read through an allowlisted loopback proxy for the existing `reloved-digital-uploads` bucket. The live browser does not receive production bearer credentials or mutation-provider credentials. Browser analytics capture is disabled in this mode.

### Live source capability matrix

| Source | Read available in this checkout | Production can normally write | Credential location by name | Safe review result |
|---|---|---|---|---|
| Reloved Admin API / Firestore records | Yes, through authenticated deployed `GET` routes | Yes, separate production mutation routes exist | Frontend `VITE_API_URL`; backend `ADMIN_EMAIL`, `JWT_SECRET` | Live and read-only through the dual barrier. |
| Direct Firebase Admin / Firestore | No direct service-account reader was found | A privileged service account could write | `GOOGLE_APPLICATION_CREDENTIALS` or approved service-account configuration | Not used; existing Admin API reads are sufficient for this review. |
| PostHog query API | No | The browser capture token can ingest events but cannot query analytics | Missing `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST` | Not configured; browser capture is stripped. |
| Google Analytics Data API | No | Depends on the granted Google identity | Missing `GOOGLE_ANALYTICS_PROPERTY_ID` or `GA_PROPERTY_ID` and approved Google read credentials | Not configured. |
| Google Search Console | No | Depends on the granted Google identity | Missing `GOOGLE_SEARCH_CONSOLE_SITE` and approved `GOOGLE_APPLICATION_CREDENTIALS` or OAuth access | Not configured. |
| Chrome UX Report | No authenticated query access | No product mutation path | Missing restricted `CRUX_API_KEY` | Not configured. |
| PageSpeed Insights | Anonymous read was attempted and quota returned HTTP 429 | No product mutation path | Missing `PAGESPEED_API_KEY` for a usable review quota | Lab report unavailable; local bundle evidence remains live. |
| Brevo, MSG91, Edesy and couriers | Configuration names are present for production behavior; vendor health calls were not made | Yes | Existing backend-only provider variables | Sends, calls, bookings and vendor probes are disabled in live review. |

No secret value is stored in this document, the frontend build, evidence, logs or Git history.

### Actual live operational coverage

The adapter uses existing production reads for Overview, Notifications, Drops, Wall, Claims, Deliveries and Support. Analytics Product and Data Health use the same production operational payload plus the deployed analytics mirror and notification history. At final verification the review returned actual production records in every operational area, including a current-day delivery and combined Ask Reloved/contact support items. Counts remain intentionally omitted where the deployed API cannot prove a global total.

The legacy deployed list routes return bounded snapshots without totals or cursors. Live review therefore marks their coverage partial inside the collapsed Data Details area, even when the current row count is below the known endpoint bound. Primary pages do not turn this uncertainty into fake totals or an empty state.

Traffic, visitor/session, Search Console and Chrome field metrics are never replaced with fixture values in live mode. They render an explicit unavailable state until the listed backend read access exists.

### Live run

From `frontend/` run:

```text
npm run admin:live-readonly
```

Then open `http://127.0.0.1:3200/admin`. The runner resolves the supplied `env` and `env.reloved-digital` files from the primary checkout, selects only the required read configuration and refuses to start unless the browser API target is the loopback adapter.

### Live evidence

Shareable evidence is stored under `Docs/admin-control-center-evidence/live-readonly/`. Names, email addresses, phone numbers and full addresses are masked in these captures.

- 1440px: Overview, Notifications, Drops, Wall, Claims, Deliveries, Support and all seven Analytics views.
- Responsive: Overview at 1280, 1024, 768, 390 and 320px; Support and Deliveries at 390px.
- Text pressure: Support at 390px with a 200% root text size.
- Walkthrough: `live-readonly-walkthrough.webm`.
- Machine proof: `network-write-barrier-proof.json`.

The machine proof records zero normal-tour `POST`, `PUT`, `PATCH` or `DELETE` requests, zero unexpected remote browser requests, an empty console/page-error set, and the deliberate local POST probe returning HTTP 405 with `Live review is read-only.`

## Delivered product

- Overview: defensible KPIs, today operations, next 48 hours, waiting-on-people and communication attention.
- Notifications: actionable inbox derived from claims, deliveries, support and notification logs.
- Drops: Give evidence, complete paged inventory, search/filtering, moderation and linked detail.
- Wall: admin catalog with hidden/withdrawn inventory, filters, linked claims, visibility and metadata controls.
- Claims: visible evidence funnel, paged operational states, linked people/item/delivery, real next actions and chat.
- Deliveries: Today, Next 48h, Calendar day/week, overdue, unscheduled, completed, all, coordinate map/fallback, communication audit and existing manual lifecycle actions.
- Support: unified Ask Reloved/contact inbox with Unread, Open, Actioned and All; existing chat and email reply paths remain distinct.
- Analytics: Overview, Traffic, Funnels, Search, Performance, Product and Data Health. Operational/product sections use the live Reloved reads; unavailable third-party sources stay explicit and are never filled with fixtures.
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
- PostHog/browser analytics production behavior is unchanged for normal product builds. Fixture and live-review builds strip and block every browser capture path.
- Public Give, Claim, Wall and public-site presentation were not redesigned.

Relevant environment variable names only:

- Auth/runtime: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `JWT_SECRET`, `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, `FIREBASE_STORAGE_BUCKET`.
- Local QA: `ADMIN_LOCAL_QA`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`, `VITE_ADMIN_LOCAL_QA`, `VITE_API_URL`, `VITE_DEV_API_PROXY`, `VITE_FIREBASE_PROJECT_ID`.
- Communications: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_CONTACT_REPLY_TEMPLATE_ID`, `MSG91_AUTH_KEY`, `MSG91_SMS_TEMPLATE_ID`, `MSG91_OTP_SENDER` and the existing `BREVO_*_TEMPLATE_ID` variables.
- Calls/couriers: `CALL_MASKING_ENABLED`, `EDESY_API_BASE`, `EDESY_API_KEY`, `EDESY_TENANT_ID`, `BORZO_API_BASE`, `BORZO_AUTH_TOKEN`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHADOWFAX_BASE_URL`, `SHADOWFAX_TOKEN`.
- Analytics capture: `VITE_POSTHOG_PROJECT_TOKEN`.
- Analytics reads: `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST`, `GOOGLE_ANALYTICS_PROPERTY_ID` or `GA_PROPERTY_ID`, `GOOGLE_SEARCH_CONSOLE_SITE`, approved `GOOGLE_APPLICATION_CREDENTIALS` or OAuth configuration, `CRUX_API_KEY`, `PAGESPEED_API_KEY`.

Secret values were never copied into this worktree, documentation, evidence or commits.

## Verification

- Backend TypeScript build: passed.
- Backend admin/read-model tests: 50 passed.
- Frontend TypeScript check: passed.
- Frontend admin UI tests: 14 passed.
- Local safety/network/fixture tests: 10 passed.
- Live read-only policy/adapter tests: 17 passed.
- Signed emulator integration: 1 passed.
- Normal frontend production build: passed. Vite retains the existing large-chunk warning.
- Final production-built live browser proof: 22 masked captures across 14 desktop views, seven responsive views and Support at 200% text. The review exercised Overview, Notifications, Drops, Wall, Claims, Deliveries, Support and all seven Analytics sections.
- Browser network gate: zero production browser writes, zero loopback writes during the normal tour, zero unexpected remote requests, zero console/page errors, and the deliberate local POST probe returned HTTP 405 with `Live review is read-only.` The live HTML contains no GTM/GA bootstrap and its compiled bundle contains no admin analytics mirror request path.
- Independent review: the live pass initially found one Critical and four Important issues involving production-origin pinning, privacy redaction, bounded-read coverage, notification filtering and matched-count consistency. Commit `9bfeb2c` fixes each issue with regression coverage. The focused re-review found no remaining Critical or Important findings and assessed the branch ready for review.

The shareable live proof is tracked under `Docs/admin-control-center-evidence/live-readonly/`. The earlier fixture-only proof remains ignored under `frontend/qa-artifacts/admin-control-center/` for local regression work.

- Live screenshots: Overview, Notifications, Drops, Wall, Claims, Deliveries, Support and Analytics Overview/Traffic/Funnels/Search/Performance/Product/Data Health at 1440px.
- Responsive screenshots: Overview at 1280/1024/768/390/320px, plus Support and Deliveries at 390px.
- Text pressure: `support-390-text-200.png`.
- Walkthrough: `live-readonly-walkthrough.webm`.
- Machine proof: `network-write-barrier-proof.json`.

## Local run

1. Use Node 22+ and JDK 21+. Set `JAVA_HOME` to `firebase-backend/.firebase/local-tools/jdk-21.0.12.1+1-jre/Contents/Home` in this checkout.
2. Run `npm --prefix firebase-backend/functions run build`.
3. Run `npm --prefix frontend run admin:local`.
4. In another terminal run `npm --prefix frontend run admin:local:seed`.
5. Open `http://127.0.0.1:3100/admin` and sign in with the documented synthetic local account in `Docs/ADMIN_CONTROL_CENTER_LOCAL_QA.md`.

The runner uses only `demo-reloved-admin`, loopback emulators and a process-sanitized environment. It refuses production origins and provider credentials.

## Remaining limitations

- PostHog query analytics, Google Analytics, Search Console and Chrome field data remain unavailable until the backend-only read credentials/access named in the capability matrix are provided. Live mode does not substitute fixture values.
- The anonymous PageSpeed request exhausted public quota with HTTP 429. Add `PAGESPEED_API_KEY` for a usable lab-data quota; local production bundle measurements remain available.
- Reliable active-user, session, attribution and retention metrics remain unavailable without a query analytics source.
- Existing deployed Admin API list routes are bounded. The local adapter exposes pagination and omits global totals that those deployed reads cannot prove.
- Some historical production item images refer to unavailable objects. The UI keeps the record usable and renders a neutral image fallback.
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
10. `2f93099`, `78b8223` — live read-only safety adapter, operations interface and analytics redesign.
11. `7a4a6a4`, `9bfeb2c` — tracked live evidence and independent-review blocker fixes.
12. `7823f27` — final capture guard, client-facing coverage cleanup and refreshed live evidence.
13. The documentation-only final handoff commit follows.
