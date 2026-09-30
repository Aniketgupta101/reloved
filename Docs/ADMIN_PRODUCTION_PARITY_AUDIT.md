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
