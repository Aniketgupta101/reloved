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
- [x] Merge `aniket/client-handover` with a merge commit.
- [x] Resolve analytics capture and Overview conflicts semantically.
- [x] Inspect every auto-merged security, provider, route, index and dependency change.
- [x] Run current live security/concurrency tests plus all Control Center regression suites.
- [x] Commit the reviewed merge without pushing.

### Task 2: Establish current provider and action parity

- [x] Complete the 13-commit backend and frontend audits.
- [x] Update the endpoint/control/test matrix for Borzo, Shadowfax, Shiprocket, Porter/manual, Brevo, MSG91, masked calls, support, notifications, Wall and Claims.
- [x] Add failing contract/UI tests for every current live action missing from the new Control Center.
- [x] Add the smallest shared action components and typed fields needed to close those gaps.
- [x] Prove stale-action checks, readiness, payment state and duplicate-booking protection on desktop and mobile.

### Task 3: Add a backend-only PostHog read adapter

- [x] Inspect local environment variable names only and classify capture versus historical-read capability.
- [x] Verify current official PostHog query requirements and minimum read scopes.
- [x] Add failing adapter tests for configuration, auth failures, timeouts, rate limits, normalization, privacy and 60–120 second caching.
- [x] Implement the server-only adapter and typed analytics contracts without exposing credentials.
- [x] Confirm production schema sampling is unavailable without a backend read key; expose only the exact current event/property query contract and do not substitute fixtures.
- [x] Render explicit connected, misconfigured, unauthorized, rate-limited and unavailable states.

### Task 4: Rebuild Analytics from compatible source scopes

- [x] Add contract and funnel-math tests for 24-hour, 7-day and 30-day ranges.
- [x] Implement Overview, Acquisition, Behavior, Drop Funnel, Claim Funnel, Device & Geo, Fulfillment, Product and Data Health views.
- [x] Keep PostHog behavioral cohorts and Firestore operational lifecycle results separate when they cannot be cohort-aligned.
- [x] Show only allowlisted aggregate dimensions and exclude analytics PII; live property presence awaits the missing read key.
- [x] Add useful charts, drill-down controls, source labels and honest insufficient-data states.
- [x] Verify all views at 1440, 1280, 1024, 768, 390 and 320 pixels.

### Task 5: Complete Wall editing and mobile operational parity

- [x] Characterize the current live item edit, image, visibility and linked-entity behavior.
- [x] Add failing tests for editable fields, hide/unpublish safety, mutation confirmations and live-read-only blocking.
- [x] Implement the detail drawer/route using the existing backend mutation contract.
- [x] Ensure claims and deliveries expose state-valid call, message, email, SMS, provider, tracking and transition actions.
- [x] Verify every action remains reachable and understandable at 390 and 320 pixels with keyboard and 200% text.

### Task 6: Profile and improve Control Center performance

- [x] Record before measurements for the browser waterfall, route transitions, API durations, Firestore reads, payloads, PostHog calls, provider status calls, duplicate requests and render duration.
- [x] Add focused performance regression assertions for the measured bottlenecks.
- [x] Apply only evidence-backed changes such as parallel reads, bounded joins, caching, deduplication, pagination and route-level lazy loading.
- [x] Ensure Overview operational content renders independently of analytics and provider health.
- [x] Record after measurements and remaining limits in `Docs/ADMIN_PERFORMANCE_AUDIT.md`.

### Task 7: Verify live read-only review and handoff

- [x] Run the complete frontend, backend, browser, live-read-only, provider, concurrency, PostHog, funnel, Wall and responsive test matrix.
- [x] Run the production build locally with real authenticated production reads and zero production mutations.
- [x] Assert zero POST, PUT, PATCH or DELETE requests to production during review.
- [x] Capture PII-minimized screenshots for every requested operational and analytics view plus mobile action surfaces.
- [x] Record a short local walkthrough.
- [x] Run independent whole-branch code review and close every Critical/Important finding.
- [x] Update the parity audit, handoff, live integration guide and performance audit with exact final evidence.
- [x] Commit locally, stop before push and wait for approval.

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
