# Admin action and integration parity plan

**Date:** 2026-09-30
**Branch:** release/admin-dashboard
**Spec authority:** User's 2026-09-30 final action parity request, plus Docs/RELOVED_ADMIN_CONTROL_CENTER_MASTER_HANDOFF.md

## Global constraints

- Keep production and LIVE READ-ONLY review technically incapable of writes.
- Do not trigger calls, email, SMS, courier bookings, claim decisions, support replies, or analytics writes against production.
- Do not expose or commit secrets, auth state, production PII screenshots, or environment values.
- Preserve deterministic fixture mode for exercising mutation controls.
- Reuse existing backend integrations and semantics. Do not invent unsupported vendor actions.
- Do not push, merge, deploy, or change production.

## Task 1 — Production parity and capability audit

Audit the authenticated production admin UI, the client-handover source, current local UI, backend admin routes, notification templates/logs, and environment variable names. Produce an evidence-based mapping for every production action and status, including masked calls, Brevo, MSG91, manual/Porter operations, Borzo, Shiprocket, Shadowfax, claim decisions, support, moderation, lifecycle transitions, and analytics capabilities. Record gaps and precise endpoint semantics without invoking mutations.

## Task 2 — Implement shared operational actions and notification clarity

Add any missing supported actions and statuses to the relevant Overview, Notifications, Claims, Deliveries, Drops, Wall, and Support views. Actions must use shared typed definitions, show approved notification copy or preview when available, and surface integration readiness. In LIVE READ-ONLY, every mutation must be disabled or replaced with a clear read-only state and still be blocked by both API barriers. In fixture/local writable mode, controls must call the existing endpoints with existing validation. Add focused tests.

## Task 3 — Analytics parity and responsive finish

Preserve every useful capability from the production/client-handover analytics page, ensure real source availability is honestly displayed, and refine information hierarchy. Verify primary operational views and action drawers at desktop and mobile widths, including keyboard/focus and overflow. Add or update focused tests.

## Task 4 — Integrated verification and handoff

Run full typecheck, lint, builds, admin UI/live-readonly/local safety tests, fixture action tests, and an authenticated browser tour. Prove zero write requests in LIVE READ-ONLY and verify supported fixture actions reach only local endpoints. Capture private ignored screenshots with PII minimized, update parity/handoff docs, and perform independent whole-branch review.
