# Admin production parity audit

Date: 2026-10-01
Branch: `release/admin-dashboard`

## Integrated live baseline

- Original common ancestor: `5381ecb6eec7d0173cce163acb4430d2423223ee`
- Integrated `aniket/client-handover`: `70047f275c4a2585eaef514dce44308ec4dfc019`
- Semantic merge: `bece18e7d3c4cd8d943aafca0796523c54ecc763`

The 13 live commits after the common ancestor were audited before merge. `client-handover` owns current product, security, concurrency, courier, lifecycle and notification behavior. The admin branch owns the Control Center information architecture, read models, presentation and local live-read-only boundary. No production mutation, provider call, deployment or credential change was made.

## Current action and provider parity

`Present` means the operator can discover the control or recorded state in the Control Center. `Safe` includes stale-state, provider-readiness and live-review write-barrier behavior.

| Control / integration | Current backend/API | Present | Wired | Tested | Mobile | Safe |
| --- | --- | :---: | :---: | :---: | :---: | :---: |
| Drop review / approve / decline | `PATCH /api/admin/submissions/:id` | Yes | Yes | Yes | Yes | Yes |
| Wall metadata / visibility | `PATCH /api/admin/items/:id` | Yes | Yes | Yes | Yes | Yes |
| Verified-original Wall recovery | `POST /api/admin/items/:id/attach-original` | Existing live route | Existing live workflow | Backend characterization | Existing live workflow | Yes |
| Claim accept / decline | `PATCH /api/admin/item-requests/:id` | Yes | Yes | Yes | Yes | Yes, transactional |
| Delivery state | `PATCH /api/admin/orders/:id`, `PATCH /api/admin/item-requests/:id/delivery` | Yes | Yes | Yes | Yes | Yes |
| Email/SMS copy and history | templates + notification log | Yes | Read only | Yes | Yes | Yes |
| Brevo lifecycle/contact sends | existing lifecycle and contact routes | Yes where supported | Yes | Characterized | Yes | Existing guards |
| MSG91 OTP/lifecycle sends | existing lifecycle routes | Yes where supported | Yes | Characterized | Yes | Existing guards |
| Edesy masked calls | masking status + call route | Yes | Yes | Yes | Yes | Readiness + live barrier |
| Borzo readiness / estimate / book / sync / cancel / tracking | existing Borzo admin routes | Yes | Yes | Yes | Yes | Cross-provider lock + fenced completion |
| Shiprocket readiness / estimate / book / cancel / AWB | existing Shiprocket admin routes | Yes | Yes | Yes | Yes | Cross-provider lock + fenced completion |
| Shadowfax readiness / book / cancel / AWB | existing Shadowfax admin routes | Yes | Yes | Yes | Yes | Confirmed cancel before rebook + fenced completion |
| Porter/manual paid record | `courier/mark-reloved-paid` | Yes | Yes | Yes | Yes | Confirmation + live barrier |
| Ask Reloved / contact support | current thread and contact routes | Yes | Yes | Yes | Yes | Source-specific + stale guards |

## Provider safety invariants

- Borzo, Shiprocket and Shadowfax share one atomic claim booking lock.
- An active order from any provider blocks another provider booking.
- Booking leases have unique ownership tokens; an expired owner cannot release a newer lock.
- Shadowfax cancellation failure stops rebooking before subsidy release, claim mutation or a second booking.
- Confirmed provider cancellation makes the explicit cancel-then-book path available again without erasing audit fields. Pickup and completed handover states remain irreversible.
- Provider confirmations carry the displayed order identity to the server; a stale confirmation for order A cannot call the vendor for, cancel or sync replacement order B. Borzo sync and webhook writes re-check identity plus terminal/cancelled state in the transaction.
- Shiprocket and Shadowfax booking flags default off. Provider readiness appears before cost-incurring controls are enabled.
- A provider status GET is not evidence that a real booking, call or recipient delivery succeeded; those need controlled staging verification.
- Successful provider responses are committed only by the current booking-lease owner. A late owner receives `409` and cannot overwrite current Firestore state or consume subsidy. A provider could still accept a remote request that completes after its local lease expires; this provider-side orphan edge needs staging monitoring because no universal compensation API is safe to call automatically.
- Claim decisions now re-read claim and item state inside one Firestore transaction. A second or stale decision returns `409`, and lifecycle notifications run only after the winning transaction commits.

Intentional retirements: no generic Brevo/MSG91 resend, no unsupported arbitrary Wall image mutation, and no one-click Shadowfax force-rebook in the Control Center. The compatibility force request is fail-closed on cancellation error. `POST /api/admin/threads/open` marks read and is treated as a mutation. Shiprocket and Shadowfax have no authoritative per-order sync route in the current backend.

## PostHog and analytics truth

The branch adds a backend-only PostHog adapter at `GET /api/admin/control-center/analytics/posthog`. It accepts `24h`, `7d` or `30d`, uses server-owned aggregate HogQL, strips unsafe labels, times out after 8 seconds, coalesces identical requests and caches for 90 seconds. It returns `connected`, `misconfigured`, `unauthorized`, `rate-limited` or `unavailable` without exposing credentials.

The supplied environment is **capture-only**. It has browser capture configuration but no historical read credential/project ID, so PostHog currently reports `misconfigured`. No actual Reloved PostHog dataset was used as acceptance evidence. Required backend-only names:

- `POSTHOG_PERSONAL_API_KEY`
- `POSTHOG_PROJECT_ID`
- `POSTHOG_HOST`

`VITE_POSTHOG_PROJECT_TOKEN` is a public capture token and is never accepted as a query credential.

When connected, the adapter returns aggregate page/session/user activity, acquisition dimensions, event-property availability, exact Give-step reach, Claim journey reach, Wall-filter use and device conversion reach. These are unique-user stage reach aggregates; the UI intentionally leaves transition rates unavailable rather than representing unordered reach as a cohort funnel.

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

## Final local verification

- Verified implementation SHA before evidence/docs finalization: `bec43c1d15a63bed17e88a75050a1bcd5f638d36`.
- Frontend: typecheck passed, 26/26 unit tests passed, production build passed, 28/28 admin UI/browser tests passed.
- Safety: 32/32 live read-only tests and 10/10 emulator/network safety tests passed.
- Backend: build passed, 65/65 tests passed and the focused provider safety suite passed 17/17.
- Live review: real production Firestore reads, privacy masking enabled for evidence, 31 fresh screenshots and walkthrough captured, zero browser writes, zero unexpected remote requests, and the local mutation probe returned `405 Live review is read-only.` The evidence directory contains 33 PNGs because two earlier comparison views are retained.
- PostHog: `misconfigured` because the three backend read names above are absent. No capture token was misused and no synthetic behavior data is presented as live.
