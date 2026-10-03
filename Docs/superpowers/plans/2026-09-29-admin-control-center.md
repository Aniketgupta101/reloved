# Reloved Admin Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current admin presentation with a truthful, actionable Control Center across Overview, Notifications, Drops, Wall, Claims, Deliveries, Support, Analytics, and an Automations placeholder.

**Architecture:** Keep `requireAdmin`, the existing Firebase API, Firestore collections, and all vendor adapters. Add focused server-side admin read models with explicit coverage and cursor pagination, then render them through a scoped admin design system and resource-state hook. Existing mutation endpoints remain the only write paths.

**Tech Stack:** React 19, TypeScript, Vite 6, Firebase Functions/Firestore emulators, existing Playwright and Node test runners.

**Spec:** `Docs/RELOVED_ADMIN_CONTROL_CENTER_MASTER_HANDOFF.md`; factual baseline: `Docs/ADMIN_CONTROL_CENTER_AUDIT.md`.

**Base:** `aniket/client-handover` at `5381ecb6eec7d0173cce163acb4430d2423223ee`. `release/design-fixes` is not an ancestor; keep this branch independent. Work only on `release/admin-dashboard`.

## Global Constraints

- No live Firebase, Brevo, MSG91, Edesy, courier, PostHog, GA4, GTM, or analytics writes during local QA. Never copy supplied secrets into the worktree.
- The existing auth and mutation routes retain their semantics. The new read endpoints must be behind `requireAdmin`.
- Every server list has stable page size, cursor, `hasMore`, and a query/index strategy; the browser never downloads full collections to join them.
- Every read model records `asOf`, source/definition/time scope, and unavailable/partial coverage where data cannot support a claim. API failure cannot become `[]` or `0`.
- Admin styles are scoped; no public website redesign. Use ivory/white, ink, Bricolage headings, Manrope text, thin borders and semantic accents.
- Keep secondary real admin tools reachable. Partner needs/allocations remain visibly unavailable; no new automation engine or arbitrary SMS sender.
- Do not push, create PR, merge, or deploy. Keep local commits dependency ordered and preserve the worktree.

## Review Focus

1. Missing/old timestamps must not silently drop an operational record or count it in the wrong date window; test an undated record.
2. A page refresh failure with prior data must render a dated stale state, never an empty result; test this in the resource hook and browser.
3. A hidden Wall item must remain findable and restorable under All; test its read row and real patch action.
4. A failed or skipped notification must be distinguishable from sent and from no attempt; test server mapping and delivery UI.
5. Local visual QA must make zero requests to production origins or vendor capture endpoints; enforce this in a browser network assertion.

---

### Task 1: Safe local harness and synthetic fixtures

**Files:** `firebase-backend/firebase.json`; `firebase-backend/functions/src/scripts/seedAdminControlCenter.ts`; `frontend/vite.config.ts`; `frontend/scripts/admin-local-*.mjs`; `Docs/ADMIN_CONTROL_CENTER_LOCAL_QA.md`; relevant tests.

**Interfaces:** Local runner starts only `demo-reloved-admin` emulators and a local API/frontend with no secret files. Seed uses deterministic visibly fake identities and covers all lifecycle, communication, support and delivery states in the spec. `ADMIN_LOCAL_QA=1` removes remote tracking/preload tags from the local HTML build only.

- [ ] Write failing safety/fixture tests: reject a non-demo project or missing emulator host; assert representative fixture records include all specified states and fake identities.
- [ ] Run targeted tests and confirm the intended failure.
- [ ] Add the ignored-override/process-env harness, emulator ports and seed script; keep normal production build behavior unchanged.
- [ ] Run the tests green, build frontend/backend, and document exact local startup and origin guard.
- [ ] Commit only task files with a structured, bulleted message.

### Task 2: Overview and attention read contracts

**Files:** `shared/adminControlCenter.d.ts`; `firebase-backend/functions/src/lib/adminControlCenter.ts`; `firebase-backend/functions/src/routes/adminControlCenter.ts` or a focused admin router mount; backend tests.

**Interfaces:** `GET /api/admin/control-center/overview?range=24h|7d|30d` returns `AdminOverviewSnapshot`; `GET /api/admin/control-center/attention?category=all|messaging|delivery|claims|support&cursor=&limit=` returns `Page<AttentionItem>`. Each KPI has value or unavailable state, definition/source/scope and drill-down. Delivery rows include identity, timing, logistics, next action, and per-channel notification audit. Attention is derived from claims/delivery, support/contact and notification log, not stored as a second status.

- [ ] Write failing backend tests for IST day and next 48h boundaries, honest KPI coverage, overdue/missing fields, notification sent/failed/skipped, and an undated record.
- [ ] Confirm the tests fail for missing behavior.
- [ ] Implement typed server aggregation using bounded/indexed queries and existing notification helpers; return explicit partial/unavailable coverage if a source cannot be trusted.
- [ ] Run tests, backend build, and emulator fixture API checks with local signed admin auth.
- [ ] Commit only task files with a structured, bulleted message.

### Task 3: Admin shell, Overview and Notifications

**Files:** `frontend/src/components/layout/AdminLayout.tsx`; `frontend/src/App.tsx`; `frontend/src/pages/admin/AdminDashboard.tsx`; `frontend/src/pages/admin/AdminNotifications.tsx`; `frontend/src/components/admin/*`; `frontend/src/lib/adminResource.ts`; scoped admin CSS and frontend tests.

**Interfaces:** Navigation is Overview, Notifications, Drops, Wall, Claims, Deliveries, Support, Analytics, Automations. Existing secondary routes remain accessible. `useAdminResource` distinguishes loading, ready, empty, partial, stale and error, retaining the last successful snapshot. Overview uses Task 2 contracts and only executable actions; Notifications links to the source entity.

- [ ] Write failing resource-state and route/render tests, including refresh error with prior data and keyboard/mobile navigation.
- [ ] Confirm red tests, then implement the calm operational shell, 10-second KPI/Today hierarchy, refresh/range/as-of controls, attention categories and empty/error states.
- [ ] Run tests and frontend build/typecheck. Start the isolated production-built local app, verify browser→API→Firestore→UI, and capture Phase 1 Overview/Notifications visual proof; inspect at 1440 and 390 before proceeding.
- [ ] Commit only task files with a structured, bulleted message.

### Task 4: Drops and Wall with paged server views

**Files:** backend admin read service/router and tests; `frontend/src/pages/admin/AdminDonations.tsx`; `AdminItems.tsx`; shared admin row/detail components; frontend tests.

**Interfaces:** `GET /api/admin/control-center/drops` and `/wall` accept validated filters, `limit` and opaque cursor; return `Page<DropAdminRow>` and `Page<WallAdminItem>`. Detail loads linked submission→item→claim/delivery/communications without a browser-wide join. Existing `/submissions/:id` and `/items/:id` perform all mutations. Funnel shows only defensible `analyticsDaily`/document steps and clearly marks unsupported steps.

- [ ] Write failing tests for page boundaries, filter semantics, hidden Wall inventory under All, linked detail, and missing funnel event coverage.
- [ ] Confirm red tests, implement server reads, then build compact list/table, useful filters, drawer, existing approved actions and live result state.
- [ ] Run tests, both builds, and local browser flows for Drops/Wall including hide/unhide against emulator only.
- [ ] Commit only task files with a structured, bulleted message.

### Task 5: Claims and delivery operations

**Files:** backend admin read service/router and tests; `frontend/src/pages/admin/AdminItemRequests.tsx`; `AdminOrders.tsx`; delivery/calendar/map components and frontend tests.

**Interfaces:** Paged `/claims`, `/deliveries`, and `/deliveries/:id/communications` return linked item/giver/claimer state and the one real next action. Claims expose defensible funnel stages. Deliveries defaults to Today and offers Next 48h, day/week Calendar, Map only if existing safe geocoded data supports it (otherwise an explicit unavailable panel with the full list still usable), and Completed. Existing claim, stage, preview, masked-call and courier endpoints remain the only actions; do not invent resend.

- [ ] Write failing tests for claim and delivery grouping, IST boundaries, all logistics methods, failed/skipped communication, cursor history and map-unavailable fallback.
- [ ] Confirm red tests, implement read models and operational UI; show action only when its backend capability/status allows it.
- [ ] Run backend/frontend tests/builds and emulator browser journeys for pending→matched→delivery, preview and mocked calls/courier safety.
- [ ] Commit only task files with a structured, bulleted message.

### Task 6: Support, Analytics and Automations shell

**Files:** backend read service/router and tests; `frontend/src/pages/admin/AdminMessages.tsx`; `AdminAnalytics.tsx`; `AdminAutomations.tsx`; frontend tests.

**Interfaces:** `/support` is a paged, visually unified Ask Reloved/contact inbox with distinct reply channels and unread/open/actioned/all views. `/analytics?range=24h|7d|30d` returns source-labelled Firestore operational counts and mirrored-event counters; no fabricated DAU, retention, attribution or funnel conversion. Automations inventories the existing 09:00 ops digest and lifecycle triggers, without controls that imply a new engine.

- [ ] Write failing tests for mixed-source inbox sort and distinct replies, analytics unavailable coverage and no false zero, and the placeholder's truthful copy.
- [ ] Confirm red tests, implement server models and client views with existing reply/status endpoints.
- [ ] Run tests/builds and local browser flows for unread support, contact reply through the mocked/local adapter, and incomplete analytics history.
- [ ] Commit only task files with a structured, bulleted message.

### Task 7: Hardening, evidence, independent review and handoff

**Files:** focused regression/accessibility tests; screenshots/video under `frontend/qa-artifacts/admin-control-center/` (ignored); `Docs/ADMIN_CONTROL_CENTER_HANDOFF.md`; any targeted fixes.

**Interfaces:** Production-built frontend and local emulator remain live at a clickable `127.0.0.1` URL. Automated browser run rejects every unexpected production/vendor origin. Capture each target page, responsive 1440/1280/1024/768/390/320 states, keyboard/focus, 200% text, dialogs and reduced motion; record one short walkthrough video. Handoff records base/final SHA, commit order, new contracts/endpoints/indexes, env variable **names only**, test results, limitations, staging validation and rollback.

- [ ] Write/extend failing integration regressions for any discovered bug, then verify red→green.
- [ ] Run full frontend/backend builds and tests, browser flow and origin guard. Capture actual-app proof, not a mock.
- [ ] Request Superpowers independent full-branch code review against the base SHA. Fix every Critical/Important finding, re-run covering checks, and re-review.
- [ ] Write handoff and commit locally; verify clean branch and final SHA. Stop without push, PR, merge or deployment.
