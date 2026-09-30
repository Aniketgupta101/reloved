# Final Live Parity, Analytics and Performance Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Integrate the latest live branch into the Admin Control Center, preserve every current operational safety rule and action, add defensible backend-only product analytics, and prove a fast, mobile-capable, production-read-only local review without changing production.

**Architecture:** The existing authenticated Admin API remains the single operational boundary. Control Center read services compose Firestore and notification truth; provider mutations continue through the current provider routes. A backend-only PostHog adapter supplies short-lived cached, privacy-safe analytics contracts. The frontend renders operational data progressively and never waits for analytics or provider readiness.

**Tech Stack:** React 19, TypeScript, Vite, Express, Firebase Admin/Firestore, Node 22 test runner, Playwright, PostHog Query API.

---

### Task 1: Merge and characterize the latest live branch

- [x] Fetch all remotes and verify source SHA, merge base and commit count.
- [x] Record the semantic conflict ledger before resolving conflicts.
- [x] Run the pre-merge admin typecheck, safety, browser and backend characterization suites.
- [ ] Merge `aniket/client-handover` with a merge commit.
- [ ] Resolve analytics capture and Overview conflicts semantically.
- [ ] Inspect every auto-merged security, provider, route, index and dependency change.
- [ ] Run current live security/concurrency tests plus all Control Center regression suites.
- [ ] Commit the reviewed merge without pushing.

### Task 2: Establish current provider and action parity

- [ ] Complete the 13-commit backend and frontend audits.
- [ ] Update the endpoint/control/test matrix for Borzo, Shadowfax, Shiprocket, Porter/manual, Brevo, MSG91, masked calls, support, notifications, Wall and Claims.
- [ ] Add failing contract/UI tests for every current live action missing from the new Control Center.
- [ ] Add the smallest shared action components and typed fields needed to close those gaps.
- [ ] Prove stale-action checks, readiness, payment state and duplicate-booking protection on desktop and mobile.

### Task 3: Add a backend-only PostHog read adapter

- [ ] Inspect local environment variable names only and classify capture versus historical-read capability.
- [ ] Verify current official PostHog query requirements and minimum read scopes.
- [ ] Add failing adapter tests for configuration, auth failures, timeouts, rate limits, normalization, privacy and 60–120 second caching.
- [ ] Implement the server-only adapter and typed analytics contracts without exposing credentials.
- [ ] Sample only safe event/property metadata to establish the actual production schema.
- [ ] Render explicit connected, misconfigured, unauthorized, rate-limited and unavailable states.

### Task 4: Rebuild Analytics from compatible source scopes

- [ ] Add contract and funnel-math tests for 24-hour, 7-day and 30-day ranges.
- [ ] Implement Overview, Acquisition, Behavior, Drop Funnel, Claim Funnel, Device & Geo, Fulfillment, Product and Data Health views.
- [ ] Keep PostHog behavioral cohorts and Firestore operational lifecycle results separate when they cannot be cohort-aligned.
- [ ] Show only dimensions present in the sampled schema and exclude analytics PII.
- [ ] Add useful charts, drill-down controls, source labels and honest insufficient-data states.
- [ ] Verify all views at 1440, 1280, 1024, 768, 390 and 320 pixels.

### Task 5: Complete Wall editing and mobile operational parity

- [ ] Characterize the current live item edit, image, visibility and linked-entity behavior.
- [ ] Add failing tests for editable fields, hide/unpublish safety, mutation confirmations and live-read-only blocking.
- [ ] Implement the detail drawer/route using the existing backend mutation contract.
- [ ] Ensure claims and deliveries expose state-valid call, message, email, SMS, provider, tracking and transition actions.
- [ ] Verify every action remains reachable and understandable at 390 and 320 pixels with keyboard and 200% text.

### Task 6: Profile and improve Control Center performance

- [ ] Record before measurements for the browser waterfall, route transitions, API durations, Firestore reads, payloads, PostHog calls, provider status calls, duplicate requests and render duration.
- [ ] Add focused performance regression assertions for the measured bottlenecks.
- [ ] Apply only evidence-backed changes such as parallel reads, bounded joins, caching, deduplication, pagination and route-level lazy loading.
- [ ] Ensure Overview operational content renders independently of analytics and provider health.
- [ ] Record after measurements and remaining limits in `Docs/ADMIN_PERFORMANCE_AUDIT.md`.

### Task 7: Verify live read-only review and handoff

- [ ] Run the complete frontend, backend, browser, live-read-only, provider, concurrency, PostHog, funnel, Wall and responsive test matrix.
- [ ] Run the production build locally with real authenticated production reads and zero production mutations.
- [ ] Assert zero POST, PUT, PATCH or DELETE requests to production during review.
- [ ] Capture PII-minimized screenshots for every requested operational and analytics view plus mobile action surfaces.
- [ ] Record a short local walkthrough.
- [ ] Run independent whole-branch code review and close every Critical/Important finding.
- [ ] Update the parity audit, handoff, live integration guide and performance audit with exact final evidence.
- [ ] Commit locally, stop before push and wait for approval.

## Global constraints

- Stay on `release/admin-dashboard`; do not modify or push another branch.
- Do not deploy, write production data, invoke paid providers or expose secrets.
- Live review permits authenticated production reads only; both frontend and local backend barriers reject mutations.
- Do not fabricate analytics, aggregate incompatible time scopes or silently substitute fixture data.
- Preserve all newer client-handover business, security, concurrency, courier, lifecycle and notification semantics.

## Review focus

- Security and production write isolation.
- Booking duplication, stale confirmations and provider readiness.
- Analytics cohort correctness, privacy and source labels.
- Firestore bounds, pagination, N+1 reads and failure-state honesty.
- Full action parity across desktop and mobile.
