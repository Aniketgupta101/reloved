# Admin production parity audit

Date: 2026-09-30  
Local branch: `release/admin-dashboard`  
Production implementation reviewed: `aniket/client-handover` at `962d9f3010d33e26d57475f8f7ff0cac90276c23`

## Review method

The authenticated production admin at `https://reloved.digital/admin` was inspected read-only in the user's existing browser session. The matching `client-handover` source was audited for every control and endpoint. No production action button was clicked. The local production-built Control Center was then exercised at `http://127.0.0.1:3200/admin` against the existing production read APIs through the loopback-only live adapter.

Private production captures and the full-data walkthrough are stored under ignored `frontend/qa-artifacts/admin-live-private/`. They are deliberately excluded from Git because they contain authenticated operational records. Shareable captures continue to use the optional privacy mode.

## Control and workflow mapping

| Production surface | Existing control or status | Control Center location | Operational behavior | Live review behavior |
|---|---|---|---|---|
| Overview | Refresh | Overview | Reloads the typed overview snapshot. | Enabled read. |
| Overview | Sync statuses from claims | Overview header | Reuses `POST /api/admin/sync-wall-statuses`; confirmation explains reconciliation. | Visible as `Sync Wall statuses · Read-only`; disabled and also blocked by both write barriers. |
| Overview | Open Wall items | Wall navigation and KPI drill-down | Opens current Wall inventory. | Enabled read. |
| Overview | Open in Claims / Deliveries | Delivery and attention row links | Opens the linked operational view and detail. | Enabled read. |
| Overview | Call giver / claimer | Matched claim detail | Reuses Edesy masking status and the three existing call modes. | Named call controls visible with actual readiness; disabled and POST blocked. |
| Overview | Chat | Claim detail | Uses the existing claim conversation. | Named conversation control visible; replies disabled. |
| Drops | Submitted / review / approved / declined filters | Drops filters | Preserves the review state filters with All as the useful default. | Enabled read. |
| Drops | Approve, mark reviewing, decline | Drop drawer | Reuses the existing submission PATCH workflow and its side effects. | Every action remains named with `· Read-only`; disabled and PATCH blocked. |
| Drops | Message dropper and internal notes | Drop drawer | Uses the existing donation conversation and submission notes. | Both controls remain named; disabled. |
| Wall | Submitted / approved / declined / all | Wall filters | Preserves moderation filters and adds visibility, availability and search. | Enabled read. |
| Wall | Publish, restore, hide, decline, edit | Wall item drawer | Reuses existing item PATCH behavior. | Every action remains named; disabled and PATCH blocked. |
| Claims | Pending / matched / couldn't match | Claims status views | Preserves the production queues and adds cancelled/all. | Enabled read. |
| Claims | Accept / couldn't match | Claim detail | Reuses the existing claim decision PATCH and notification workflow. | Named controls visible; disabled and PATCH blocked. |
| Claims | Ops ↔ claimer, Ops ↔ giver, claimer ↔ giver | Matched claim detail | Reuses `/api/admin/calls/masking-status` and `/api/admin/calls/mask`. | Actual Edesy readiness visible; call controls disabled and POST blocked. |
| Claims | Message user | Claim detail | Uses the existing claim thread. | Named conversation control visible; replies disabled. |
| Deliveries | Ready / in process / out for delivery / delivered | Delivery detail and operational views | Reuses the existing order lifecycle PATCH and notification logging. | Current status and next stage are visible; update disabled and PATCH blocked. |
| Deliveries | Copy pickup / drop / all | Delivery detail | Copies the same operational address/contact blocks. | Enabled because clipboard copy has no production side effect. |
| Deliveries | Notification preview and history | Communication audit | Reads the actual template catalog and notification log; provider-rendered preview remains a POST route. | Catalog and recorded outcomes visible; preview action named but disabled and POST blocked. |
| Support | Reply in popup chat | Support inbox detail | Uses the existing Ask Reloved thread identity. | Named control visible; reply disabled. |
| Support | Email reply | Support inbox detail | Reuses the existing Brevo-backed contact reply route. | Named control visible; disabled and POST blocked. |
| Support | Mark done | Support inbox detail | Reuses the contact status PATCH as `Mark actioned`. | Named control visible; disabled and PATCH blocked. |

## Live integration visibility

| Integration | Actual live signal used | Current review result |
|---|---|---|
| Firestore / Reloved Admin API | Authenticated production GET endpoints | Healthy. Actual Overview, Notifications, Drops, Wall, Claims, Deliveries and Support records are shown. |
| Brevo | Template configuration plus actual email notification outcomes in the loaded production history | Visible in Data Health and per-record communication audits. Sends remain blocked. |
| MSG91 | Template configuration plus actual SMS notification outcomes in the loaded production history | Visible in Data Health and per-record communication audits. Sends and OTP remain blocked. |
| Edesy | Existing masking-status GET endpoint | Actual readiness visible in Data Health and matched claim detail. Calls remain blocked. |
| Borzo | Existing status GET endpoint | Actual readiness visible in Data Health. No estimates, bookings, syncs or cancellations were invoked. |
| Shiprocket | Existing status GET endpoint | Actual current readiness visible in Data Health. No booking or cancellation was invoked. |
| Shadowfax | Existing status GET endpoint | Actual readiness visible in Data Health. No booking or cancellation was invoked. |
| PostHog | None: the capture token is not a query credential | Not configured. Requires backend-only `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` and `POSTHOG_HOST`. |
| Google Analytics | None | Not configured. Requires the property ID and approved backend read credentials. |
| Search Console | None | Not configured. Requires the site property and approved service-account or OAuth read access. |
| CrUX / PageSpeed | PageSpeed anonymous read and local production bundle data | External report unavailable at review time; bundle data remains available. A restricted API key is required for dependable quota. |

## Verification evidence

- Browser tour: 14 desktop pages, seven responsive views and 200% text pressure.
- Full-data identity check: authenticated item and claim detail fields contain complete stored email/phone/address values without bullet masking.
- Action parity checks: named moderation, decision, Edesy, support, copy and preview controls are present.
- Integration checks: Firestore, Brevo, MSG91, Edesy, Borzo, Shiprocket and Shadowfax statuses were read from the existing production GET routes and rendered in Data Health.
- Browser requests during the normal tour: zero `POST`, `PUT`, `PATCH` or `DELETE`.
- Unexpected remote browser requests: zero.
- Deliberate local mutation probe: HTTP 405 with `Live review is read-only.`
- Console errors: zero. Page errors: zero.

No production mutation, message, call, OTP, courier booking, analytics capture or deployment occurred during this audit.

## Task 4 integrated recheck — 2026-09-30

**Local source:** `release/admin-dashboard` at `2822a2605393044a4030a3f94c9e387067626ab4` before this documentation commit. The production source comparison remains `aniket/client-handover` at `962d9f3010d33e26d57475f8f7ff0cac90276c23`; the deployed Shadowfax button's exact frontend handler and backend revision remain unverified. The new control center endpoints and analytics aggregation are local code, not deployed production capabilities.

**Live review:** a fresh production-built `LIVE READ-ONLY · PRODUCTION DATA` preview at [http://127.0.0.1:3200/admin](http://127.0.0.1:3200/admin), using authenticated existing production GET reads through the loopback adapter. The server was left running for review. The browser visited Overview, Notifications, Drops, Wall, Claims, Deliveries, Support, and all seven Analytics sections at 1440px; Overview at 1280, 1024, 768, 390 and 320px; Support and Deliveries at 390px; and Support at 390px under 200% root text pressure. Reduced motion was enabled. The authenticated records and screenshots remain only in ignored `frontend/qa-artifacts/admin-live-private/`. No fresh shareable capture was produced because masking of free text cannot be certified by the current privacy script.

**Direct interaction evidence:** the 390px pass verified the skip link, mobile menu, Escape focus return, read-only Overview sync control, Notification metadata and category filtering, a populated matched Claim detail, Edesy call modes, Borzo/Shiprocket/Shadowfax controls, and Porter's explicit offline payment state. The named call, booking and subsidy controls were disabled. Analytics 7/14/30 range switching, Product pipeline/roles/aged work, Funnels and unavailable Traffic were rendered. This is browser control/read verification, not execution of any action. The source and mounted fixture tests cover the conditional claim decisions, delivery lifecycle, recorded communication copy and remaining action contracts; those were not invoked against production.

**Fresh proof:** `frontend/qa-artifacts/admin-live-private/network-write-barrier-proof.json` records 14 desktop pages, seven responsive views, 200% text pressure, zero normal-tour browser writes, zero unexpected remote requests, zero console/page errors, and a deliberate loopback-only POST returning HTTP 405 with `Live review is read-only.` A separate ignored `task4-interaction-proof.json` records 92 same-origin GET/HEAD requests, zero writes and all interaction checks true. The live HTML had no GTM/GA/PostHog bootstrap; runtime browser capture emitted no remote request. The first walkthrough recording process stalled after screenshots/video generation, so its earlier proof file was not reused; the fresh no-video browser run generated this proof. No production/vendor write, call, send, booking, reply, decision, preview POST, deployment or push occurred.

**Automated verification:** frontend lint and production build passed; UI 22/22, live-readonly safety 26/26, local safety 10/10, signed demo-emulator integration 1/1. Backend TypeScript build and the relevant admin control center, inventory, operations and support analytics tests passed 62/62. The existing large-bundle advisory remains.

**Data limits:** deployed list and analytics reads remain bounded and cannot certify complete operational totals or historical delivery success. Operational live analytics therefore suppresses unsupported exact counts and rates. PostHog, GA4, Search Console and CrUX query evidence is unavailable in this review; PageSpeed quota/access can also be unavailable. UTC event mirrors cannot become IST user cohorts. The live UI shows unavailable states rather than inferred zeros. Provider readiness is a GET signal only; real booking/cancel/sync behavior requires approved staging vendor accounts. The direct deployed Shadowfax implementation discrepancy remains open.
