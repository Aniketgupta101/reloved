# Admin Control Center release notes

Date: 2026-09-30

## Release summary

`release/admin-dashboard` delivers Reloved's production-quality Admin Control Center. It replaces the fragmented legacy admin information architecture with a single operational surface for Overview, Notifications, Drops, Wall, Claims, Deliveries, Support and Analytics.

The release uses the existing Reloved Admin API, Firestore records, notification logs and provider adapters. It does not introduce a second backend, a new courier system or browser-held vendor credentials.

## Operator-facing changes

- Overview now answers current performance and next operational actions through date-scoped KPIs, today's deliveries, upcoming work, waiting people and communication issues.
- Notifications groups operational attention by urgency, today, messaging, claims, support and system signals. Rows show stored email/SMS context when available and link to the underlying entity.
- Drops and Wall provide scalable operational lists with filters, details, linked lifecycle records and concise action surfaces.
- Claims and Deliveries combine item, people, schedule, communication history, provider state and next action in one detail view.
- Support unifies Ask Reloved and contact-form requests while preserving their different reply mechanisms.
- Analytics retains useful legacy operational reporting and adds source-aware Overview, Traffic, Funnels, Search, Performance, Product and Data Health sections.

## Integration and safety changes

- Existing Brevo, MSG91, Edesy, Borzo, Shiprocket and Shadowfax adapter routes remain the side-effect boundary.
- Edesy call modes, courier actions, claim decisions, delivery transitions, support reply actions and notification previews are represented on the relevant operational views.
- Live production review runs through a loopback adapter in `PRODUCTION · READ ONLY` mode. Both browser and adapter reject every write before it reaches production.
- Notification audits distinguish recorded sent, failed, skipped, unavailable and bounded-history states. A failed read cannot become a false zero.
- Cursor pagination preserves Firestore timestamp and document-ID ordering, including nanosecond and mixed-case tie cases.
- Confirmation dialogs bind to the current entity/action version; stale claim, delivery and courier confirmations are invalidated before a mutation can be sent.

## Integration status at release review

| Capability | Evidence available in live read-only review | What staging must still prove |
|---|---|---|
| Firestore/Admin API | Actual operational records across all primary pages | Read load and latency under staging volume |
| Brevo and MSG91 | Template configuration and recorded outcomes | Controlled send, provider delivery/bounce behavior |
| Edesy | Current masking readiness | Controlled masked-call completion/failure behavior |
| Borzo, Shadowfax, Shiprocket | Current provider status/readiness | Estimate, booking, webhook/sync and cancellation behavior |
| PostHog, GA4, Search Console, CrUX | Explicit unavailable state; no fabricated data | Backend-only query credentials and access |

## Verified on the release branch

- Frontend typecheck and production build passed.
- Admin UI/browser suite: 25/25 passed.
- Live read-only safety suite: 30/30 passed.
- Local safety suite: 10/10 passed.
- Backend Control Center model suites: 66/66 passed.
- Live browser tour: 14 desktop pages, seven responsive views, 200% text pressure, zero normal-tour writes, zero unexpected remote requests and zero browser errors.
- Independent whole-branch review closed all Critical and Important findings.

The production build retains a large-chunk warning. The final shell did not have JDK 21 available to repeat the optional emulator integration run; its earlier controlled emulator result was 1/1.

## Known constraints

- PostHog, GA4, Search Console and CrUX remain unavailable until their server-side read credentials are supplied. Browser tokens are never treated as query credentials.
- Deployed legacy list endpoints are bounded, so live review intentionally avoids unprovable global totals and rates.
- Cross-entity notification History is deferred; authoritative detailed attempt history is available per Claim or Delivery.
- Provider readiness is not proof of a real booking, call, delivery or callback. Validate those against controlled staging recipients.

## Integration references

- [Aniket's live-integration guide](ANIKET_ADMIN_CONTROL_CENTER_LIVE_INTEGRATION.md)
- [Full handoff](ADMIN_CONTROL_CENTER_HANDOFF.md)
- [Production parity audit](ADMIN_PRODUCTION_PARITY_AUDIT.md)
- [Approved architecture](RELOVED_ADMIN_CONTROL_CENTER_MASTER_HANDOFF.md)
