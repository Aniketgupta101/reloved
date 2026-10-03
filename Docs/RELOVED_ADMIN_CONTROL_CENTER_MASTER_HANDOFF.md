# Reloved Admin Control Center — Master Engineering Handoff

**Project:** Reloved  
**Target branch:** `release/admin-dashboard`  
**Repository:** `Aniketgupta101/reloved`  
**Purpose:** Build a clean, premium, operationally useful admin control center for Reloved without breaking existing public flows, integrations, or production data.

---

## 0. Executive intent

The existing `/admin` should become a **Reloved Control Center**, not merely a collection of database-status screens.

It has four audiences:

1. **Client / external stakeholders**
   - Understand product health quickly.
   - See users, drops, claims, matches, completed Reloved handovers, delivery activity, and growth trends.
   - Understand progress without needing technical context.

2. **Product / founders / Totem team**
   - Understand acquisition, activation, conversion, drop-off, supply/demand, fulfillment, and repeat usage.
   - Diagnose where users get stuck.
   - See whether the product and operational process are working.

3. **Operators**
   - Know exactly what must happen today.
   - See today's and upcoming deliveries.
   - See preferred time, pickup/drop information, people involved, and next action.
   - Know whether email/SMS/contact attempts have already happened.
   - Trigger allowed operational actions from one place.

4. **Developers**
   - See truthful system/integration state.
   - Diagnose failures without exposing technical errors to non-technical users.
   - Extend the dashboard with future integrations and automations without rebuilding the admin.

The dashboard must answer two questions immediately:

> **How is Reloved performing?**  
> **What does someone need to do next?**

---

# 1. Product principles

## 1.1 Human-question-shaped, not database-shaped

Do not organize the interface around raw Firestore state names.

The operator should not need to interpret:

`submitted → schedule_proposed → ready_to_book → booked → out_for_delivery`

Instead, the UI should answer:

- What happened?
- Who is involved?
- What is the current state?
- What is the one next action?
- Has Reloved already contacted the user?
- Is something late, failed, stale, or missing?

Raw technical state may still be available inside detail drawers for developers.

## 1.2 Operational truth before decoration

The dashboard must never display a believable zero when the underlying request failed.

Use distinct states:

- Loading
- Loaded
- Empty
- Partial / stale
- Error
- Unavailable

Example:

**Bad:** `Deliveries today: 0` after an API error.  
**Correct:** `Deliveries unavailable — last successful refresh 4 min ago.`

## 1.3 Existing integrations are preserved

Do not rewrite or relocate the existing integrations unless required by an evidenced defect.

The new dashboard must sit on top of the existing backend.

Expected existing integration families include:

- Brevo transactional email
- MSG91 OTP / lifecycle SMS
- Edesy call masking
- courier/logistics integration paths
- support/contact messaging
- Firestore operational data
- admin notification logs
- PostHog / GA4 / mirrored analytics counters

No third-party secret belongs in browser code.

## 1.4 Premium, calm, data-dense

The public Reloved redesign is editorial and product-first.

The admin should feel related to the same brand but optimized for operations:

- warm ivory / white base
- ink black typography
- selective pink / green status accents
- Bricolage Grotesque for headings
- Manrope for dense operational copy
- thin neutral dividers
- restrained borders
- no neo-brutalist hard offset shadows
- no giant empty panels
- no tiny illegible uppercase labels
- no decorative motion
- strong information hierarchy
- useful density without clutter

This is a professional operations product, not a marketing landing page.

---

# 2. Git and branch strategy

## 2.1 Never work directly on production branches

Do not edit:

- `main`
- `client-handover`
- `release/design-fixes`
- `feature/ux-copy-polish`
- `design/public-experience`
- `hotfix/photo-upload`

Create an isolated worktree and branch:

`release/admin-dashboard`

## 2.2 Base selection

Before creating the branch:

1. Fetch all remotes.
2. Determine Aniket's latest intended integration baseline.
3. Prefer the latest `client-handover` or its confirmed successor.
4. Do **not** assume `main` is current.
5. If `release/design-fixes` has already been accepted into the normal integration baseline, use the updated baseline.
6. If not, keep the admin implementation independent from public redesign history.

The admin must be visually compatible with the new public design without requiring the entire public redesign branch to cherry-pick cleanly.

## 2.3 Commit strategy

Keep commits small and dependency-ordered.

Suggested series:

1. `chore(admin): establish control-center contracts and safe local harness`
2. `feat(admin): add control-center shell and navigation`
3. `feat(admin): rebuild overview and attention inbox`
4. `feat(admin): rebuild drops and wall management`
5. `feat(admin): rebuild claims and delivery operations`
6. `feat(admin): rebuild support and communication audit`
7. `feat(admin): rebuild analytics views`
8. `test(admin): add integrated operator journeys`
9. `docs(admin): add control-center handoff`

Avoid unrelated backend refactors.

---

# 3. Existing implementation to audit before changing

The current repository already contains useful admin capabilities.

Audit the latest versions of at least:

### Frontend

- `frontend/src/components/layout/AdminLayout.tsx`
- `frontend/src/pages/admin/AdminDashboard.tsx`
- `frontend/src/pages/admin/AdminAnalytics.tsx`
- `frontend/src/pages/admin/AdminDonations.tsx`
- `frontend/src/pages/admin/AdminItems.tsx`
- `frontend/src/pages/admin/AdminItemRequests.tsx`
- `frontend/src/pages/admin/AdminOrders.tsx`
- `frontend/src/pages/admin/AdminMessages.tsx`
- `frontend/src/pages/admin/AdminLogin.tsx`
- other `/admin` pages discovered from routing
- `frontend/src/lib/api.ts`
- `frontend/src/lib/analytics.ts`
- `frontend/src/lib/posthog.ts`
- relevant shared status and locality helpers

### Backend

- `firebase-backend/functions/src/routes/admin.ts`
- notification logging helpers
- email notification helpers
- MSG91 helpers
- call masking helpers
- analytics daily aggregation
- tester filtering
- courier/logistics adapters
- Firestore collection definitions
- auth/session middleware

Do not redesign from screenshots alone.

Map every existing page to:

- route
- purpose
- backend endpoint
- data returned
- mutations/actions
- third-party side effects
- current weaknesses
- keep / merge / replace / retire decision

Create:

`Docs/ADMIN_CONTROL_CENTER_AUDIT.md`

before implementation.

---

# 4. Information architecture

The target navigation is:

```text
RELOVED CONTROL CENTER

Overview
Notifications
Drops
Wall
Claims
Deliveries
Support
Analytics
Automations
```

`Automations` is an architecture placeholder in this release unless an existing feature can be surfaced safely. Do not invent an automation engine in this workstream.

Developer-only integration/system information may live in a secondary `System` panel or inside an admin settings/detail drawer rather than cluttering the primary navigation.

---

# 5. Overview — the default admin home

## 5.1 Purpose

The Overview must work for a client, founder, operator, and developer without becoming four dashboards.

Use progressive disclosure:

### Layer 1 — executive health
Immediately understandable.

### Layer 2 — today's operations
Actionable.

### Layer 3 — problems / alerts
Needs attention.

### Layer 4 — drill-down
Links into specialist pages.

## 5.2 Global controls

Top-right:

- timeframe selector
  - Today / 24h
  - Last 7 days
  - Last 30 days only when the dataset meaningfully supports it
  - custom range later
- refresh
- `Last updated X ago`
- stale/error indicator

Never imply a time window is available if the backend cannot correctly compute it.

## 5.3 KPI strip

Recommended initial metrics:

- Users
- Active users
- New users
- Drops
- Claims
- Matched
- Reloved / completed
- Claim acceptance rate

Do not overload the first row.

Every metric must have:

- precise definition
- source
- time scope
- loading/error state
- drill-down destination

## 5.4 Today Operations

This is the highest-priority operational area.

Show:

### Deliveries today
For each:

- time
- item photo
- item name
- dropper
- claimer
- pickup locality/address according to admin permissions
- destination
- logistics method
- current status
- email state
- SMS state
- last notification
- preferred/agreed time
- next operator action

Actions may include, where existing APIs support them:

- open delivery
- masked call giver
- masked call claimer
- message
- preview email/SMS
- send/re-send an approved notification
- advance delivery state
- open courier action

Do not add buttons that cannot perform a real existing action.

### Next 48 hours
Compact upcoming schedule.

### Waiting on people
Examples:

- giver response
- claimer response
- missing address
- schedule not set
- confirmation pending

### Messaging failures
Failed/skipped email or SMS attempts from existing notification logs.

## 5.5 Needs Attention

One normalized attention feed.

Each attention item should carry:

- severity
- type
- title
- short description
- linked entity type/id
- occurred/due time
- next action label/link

Prefer deriving this server-side from operational truth.

---

# 6. Notifications — unified attention inbox

## 6.1 Purpose

One place for:

- unread support
- failed outbound email
- failed outbound SMS
- delivery due soon
- overdue delivery
- claim waiting too long
- missing address
- missing schedule
- system/integration issue

## 6.2 Views

- Needs attention
- Messaging
- Delivery
- Claims
- Support
- History

## 6.3 Behavior

- actioning an item removes it from active attention when the underlying condition is resolved
- history remains auditable
- do not create a second independent status system
- attention state must be derived from source-of-truth entities

---

# 7. Drops

## 7.1 Top section — Give funnel

The page should first explain behavior, not moderation states.

Target funnel:

```text
Drop started
→ Photos added
→ Details completed
→ Authentication / identity completed
→ Submitted
→ Visible on Wall
```

Where event coverage is incomplete, show only defensible steps.

Useful outputs:

- starts
- completions
- conversion %
- drop-off %
- median completion time if supported
- failures by step
- trend versus selected previous period only when statistically meaningful

## 7.2 Drop list

Default: recent / all meaningful drops.

Columns or card fields:

- item
- dropper
- username
- email
- phone
- area
- created date
- wall state
- claim state
- communication state
- processing state
- actions

Do not default to an empty `Submitted` filter.

## 7.3 Detail drawer/page

Show:

- all photos
- title/category/size/condition
- dropper identity
- relevant submission metadata
- lifecycle timeline
- notification audit
- linked claim(s)
- linked delivery
- support/chat thread where relevant
- raw technical IDs inside a developer/details section

Allowed existing actions may include:

- edit listing metadata
- change visibility
- replace/add image if backend supports it safely
- open linked claim
- message dropper

---

# 8. Wall

## 8.1 Purpose

This is the admin version of the Wall of Kindness.

Default to the entire relevant Wall catalog.

## 8.2 Filters

Mirror useful public filters where applicable:

- audience / For
- category
- size
- area
- status
- availability
- date added
- dropper
- claimer
- active/hidden

Use filters supported by real data.

## 8.3 Item card/table

Must answer:

### Item
- image
- title
- category
- size
- current public status
- visibility

### Dropper
- name
- username
- locality
- date

### Claimer
- name if any
- current claim state

### Communications
- relevant drop receipt
- claim notifications
- last SMS/email where available

### Admin
- edit
- hide/unhide
- correct metadata
- open linked drop
- open linked claim

Do not silently delete a listing whose URL may have been shared publicly.

Prefer a clear hidden/unavailable state so existing deep links can degrade gracefully.

---

# 9. Claims

## 9.1 Top section — claim funnel

Target:

```text
Item viewed
→ Claim started
→ Claim submitted
→ Giver decision
→ Matched
→ Delivery scheduled
→ Delivered / Reloved
```

Use only events/data that can be proven.

## 9.2 Claim list

Each claim must visually connect:

```text
ITEM
DROP / GIVER
CLAIMER
CURRENT STATE
NEXT ACTION
COMMUNICATION
DELIVERY
```

Show:

- item photo/title
- giver
- claimer
- phone/email
- areas
- claim date
- acceptance state
- handover state
- proposed/agreed time
- last contact
- email/SMS state
- unread chat state

## 9.3 Operator actions

Reuse existing approved actions:

- accept/decline where admin is allowed
- masked call
- message
- open delivery
- inspect notification history

Do not change lifecycle semantics in a UI redesign.

---

# 10. Deliveries

## 10.1 Modes

Top tabs:

```text
Today
Next 48h
Calendar
Map
Completed
```

At early product scale, Today and Next 48h are primary.

## 10.2 Delivery card

Show:

- scheduled time
- item
- dropper
- claimer
- pickup
- destination
- logistics method
- current ops state
- email status
- SMS status
- latest contact
- notification history
- next action

Actions should use the existing integration layer.

## 10.3 Calendar

Day/week view sufficient for v1.

Display:

- deliveries by agreed/proposed time
- overdue
- unconfirmed
- booked
- out for delivery
- completed

## 10.4 Map

Use the existing map integration if available.

Purpose:

- operational visualization of today's pickup/drop geography
- not a decorative map

Requirements:

- do not expose private data outside authenticated admin
- avoid placing exact private addresses into third-party client code if existing architecture does not already permit it
- fall back gracefully if map provider unavailable
- list view must remain fully usable without the map

## 10.5 Communication controls

The UI must show:

- last email
- last SMS
- sent / failed / skipped
- timestamp
- template name/key
- recipient/audience

Manual actions may include:

- preview message
- send/re-send an approved template
- masked call

Do not build arbitrary free-form SMS sending unless explicitly approved later.

---

# 11. Support

Unify:

- Ask Reloved support chat
- website contact form

For each conversation show:

- user
- email/phone
- latest message
- unread state
- timestamp
- linked item/claim/drop if discoverable from existing IDs
- reply method
- resolved/actioned status

The goal is an inbox, not a wall of independent cards.

Views:

- Unread
- Open
- Actioned
- All

Do not mix Drop/Claim operational chats into general support unless the existing data model clearly supports a unified conversation abstraction.

---

# 12. Analytics

## 12.1 Audience

This is the client/product dashboard.

The default analytics view must be understandable by a non-technical stakeholder.

## 12.2 Sections

```text
Overview
Acquisition
Activation
Drop Funnel
Claim Funnel
Fulfillment
Retention
Supply & Demand
```

## 12.3 Core product model

### Acquisition
- visitors/session data if available
- signups
- source/UTM if available
- direct/social/referral when reliable

### Activation
- account created
- onboarding complete
- first Drop or first Claim

### Drop Funnel
- started
- photos
- details
- auth
- submitted
- visible

### Claim Funnel
- item viewed
- claim started
- submitted
- accepted
- delivered

### Fulfillment
- matched
- scheduled
- booked
- out for delivery
- delivered
- median time to match
- median time to Reloved

### Retention
Only show if the data supports it:
- return visitors/users
- repeat droppers
- repeat claimers
- users who both drop and claim

### Supply & Demand
- items dropped vs claims
- category
- audience
- locality
- size when meaningful

## 12.4 Data source hierarchy

1. Firestore lifecycle records = operational truth.
2. notification logs = communication truth.
3. `analyticsDaily` / mirrored events = product funnel counters.
4. PostHog = behavior/event exploration when securely accessible.
5. GA4 = secondary acquisition validation.

Do not pull private PostHog admin credentials into the frontend.

If PostHog query access is added later, use a backend-only read adapter.

## 12.5 Honest metrics

Never invent:

- DAU/WAU
- retention
- conversion rate
- attribution
- funnel completion

when source events are missing or historically incomplete.

Show:

`Not enough reliable data yet`

instead.

---

# 13. Automations

This navigation slot exists so the architecture has a home for future:

- delivery reminders
- morning email/SMS confirmations
- pre-delivery call reminders
- lifecycle messaging
- comment/DM automation
- scheduled operational workflows

For this branch:

- inventory existing automations/integration triggers
- design the empty/coming-later shell if useful
- do not create a new automation engine without a separate approved spec

---

# 14. Backend architecture

## 14.1 UI never joins the world itself

Avoid fetching multiple huge collections into the browser and reconstructing the operation there.

Use typed server-side admin view models.

Recommended contracts:

- `AdminOverviewSnapshot`
- `AttentionItem`
- `AdminKpi`
- `DropAdminRow`
- `WallAdminItem`
- `ClaimAdminRow`
- `DeliveryAdminRow`
- `CommunicationAudit`
- `SupportThreadSummary`
- `AnalyticsSnapshot`

Place contracts in an existing shared/types location following repository conventions.

## 14.2 Reuse before adding

Before creating a new endpoint, inspect whether the existing endpoint already provides the data.

Existing endpoint families likely include:

- `/api/admin/overview`
- `/api/admin/analytics`
- `/api/admin/submissions`
- `/api/admin/items`
- `/api/admin/item-requests`
- `/api/admin/orders`
- `/api/admin/orders/:id/notifications`
- `/api/admin/notification-templates`
- `/api/admin/contact-messages`
- `/api/admin/support-chats`
- `/api/admin/calls/masking-status`
- `/api/admin/calls/mask`

Verify latest code before relying on these exact paths.

## 14.3 Add small read models, not another backend

When existing APIs cannot answer a required admin question, add a focused admin read endpoint or service.

Prefer a repository-consistent equivalent of:

`adminControlCenterService.ts`

Responsibilities:

- server-side aggregation
- source-of-truth mapping
- pagination
- data completeness state
- normalization for UI

Do not move third-party integration implementation into this service.

## 14.4 Pagination

All potentially growing admin lists must be designed for pagination/cursors.

At minimum:

- drops
- wall items
- claims
- deliveries history
- support
- notifications/history

Do not assume current low volume will remain low.

## 14.5 Integration adapters remain isolated

Architecture:

```text
Admin UI
  ↓
Reloved Admin API
  ↓
Domain/admin services
  ↓
---------------------------------
Firestore
Notification log
Brevo adapter
MSG91 adapter
Edesy adapter
Courier adapters
Analytics adapters
---------------------------------
```

The admin UI does not know vendor secrets.

Future vendors can be added behind the backend contract.

## 14.6 Analytics and operations remain separate

A product event is not the same as an operational state.

Example:

- `claim_started` is analytics.
- an approved item request is operational truth.

Never infer fulfillment truth from analytics events.

---

# 15. Scalability constraints

Design for growth without premature infrastructure work.

## Required now

- cursor pagination
- typed contracts
- server-side filters
- server-side aggregations for summary views
- no unbounded collection reads
- no client-side joins across large datasets
- no secrets in browser
- clear error/stale states
- integration adapters
- testable view models

## Add later when proven necessary

- materialized summary documents
- scheduled aggregation jobs
- warehouse/BI pipeline
- complex RBAC
- event streaming
- automation engine

Do not add these just to sound scalable.

---

# 16. Local environment and secret safety

The user has supplied:

- frontend `.env`
- backend `.env.reloved-digital`

Treat both as secret-bearing files.

## Hard rules

1. Never print their contents.
2. Never paste values into chat/output.
3. Never commit them.
4. Never include them in screenshots, logs, docs, bundles, diffs, or evidence.
5. Never expose backend keys as `VITE_*`.
6. Never use production integrations for local QA unless explicitly approved.

## Before running anything

Codex must identify:

- what Firebase project the backend would connect to
- what API host the frontend would call
- whether PostHog would receive events
- whether Brevo/MSG91 could send
- whether courier integrations can spend money
- whether call masking could place a real call

Do not perform the side effect to discover the answer.

## Local execution model

Preferred:

```text
Local frontend
      ↓
Local Firebase Functions emulator
      ↓
Firestore/Auth/Storage emulators
      ↓
synthetic seeded data

External side effects:
mocked / disabled
```

Use the project's existing emulator setup where available.

Explicit local overrides should disable:

- live PostHog capture
- live Brevo send
- live MSG91 send
- live masked calls
- live courier booking
- production analytics writes

Do not modify the real `.env.reloved-digital` file just to accomplish this.

Use shell/environment overrides or an ignored local test env according to repository conventions.

Verify network requests during tests. Any unexpected production origin is a test failure.

---

# 17. Synthetic test dataset

Create a deterministic local seed covering:

## Users

- new user
- dropper only
- claimer only
- both dropper and claimer
- user with unread support
- user with failed notification

## Drops

- just submitted
- live available
- being matched
- hidden
- claimed
- Reloved
- processing image
- item with multiple photos

## Claims

- pending giver
- declined
- matched
- awaiting address
- awaiting schedule
- proposed schedule
- ready to book
- booked
- out for delivery
- delivered
- cancelled

## Communications

- email sent
- email failed
- SMS sent
- SMS failed
- SMS skipped
- unread support thread

## Deliveries

- due today
- due within one hour
- overdue
- tomorrow
- completed
- receiver collects
- giver sends
- Reloved-arranged/courier flow

Synthetic fixture identities must be visibly fake and safe.

---

# 18. Visual system

## Shell

Desktop-first but responsive.

Sidebar:

- compact
- icon + label
- badge only when meaningful
- no separate information icon beside every navigation item
- current page obvious

Header:

- page title
- short purpose sentence
- date range where relevant
- refresh / last updated

## Cards

Use:

- white surface
- subtle 1px neutral border
- restrained radius
- no hard offset shadow
- 16–24px internal spacing
- clear hierarchy

## Tables/lists

Operational data should often be table/list based rather than giant cards.

Use:

- sticky headers where helpful
- compact rows
- readable row actions
- expandable detail drawer

## Status

Use color as reinforcement, not the only signal.

Suggested semantic mapping:

- green = completed/healthy/available
- pink = action/attention/brand emphasis
- amber = waiting/warning
- red = failure/overdue
- blue = in progress
- gray = neutral/inactive

Do not allow brand green/pink to overwhelm the data surface.

---

# 19. Error, loading, and freshness behavior

Every data block must distinguish:

- loading
- ready
- empty
- partial
- stale
- error

Rules:

- never convert network failure to `[]`
- never convert unavailable metrics to `0`
- preserve previous known data where safe and label it stale
- provide retry
- log technical detail server-side
- show user-safe message in admin UI

---

# 20. Implementation phases

## Phase 0 — audit and contracts

Deliver:

- route map
- API map
- integration map
- current data model
- current action map
- keep/replace decisions
- proposed typed admin contracts

No UI implementation yet.

## Phase 1 — shell + overview + notifications

Build:

- new admin shell
- Overview
- attention feed
- today deliveries
- next 48h
- KPI summary
- integration/communication status summaries

This becomes the proving slice.

## Phase 2 — Drops + Wall

Build:

- Drop funnel
- drop list/detail
- Wall management catalog
- filters
- admin item detail drawer
- links between drop ↔ item ↔ claim

## Phase 3 — Claims + Deliveries

Build:

- Claim funnel
- claim operations
- delivery today board
- next 48h
- calendar
- map if existing integration can be reused safely
- communication audit/actions

## Phase 4 — Support + Analytics

Build:

- unified support inbox
- analytics overview
- acquisition
- activation
- drop funnel
- claim funnel
- fulfillment
- retention when reliable
- supply/demand

## Phase 5 — integration hardening

- full regression
- accessibility
- responsiveness
- pagination
- error states
- stale data
- integration status
- code review
- handoff

---

# 21. Testing strategy

## 21.1 Unit / contract

Test:

- status normalization
- metric definitions
- attention derivation
- date range logic
- IST date grouping
- communication status
- stale/error handling
- pagination cursors

## 21.2 API

Test admin read models against emulator data.

Verify:

- correct counts
- no test data leakage into production metrics
- filtering
- date range
- pagination
- partial data
- errors

## 21.3 Browser E2E

At minimum:

### Overview
- loads metrics
- changes date range
- opens today's delivery
- shows stale/error correctly

### Notifications
- filters
- opens target entity
- resolved source removes active attention

### Drops
- funnel
- search/filter
- open dropper
- open item
- communication audit

### Wall
- all items default
- public status filter
- edit/hide path
- linked claim

### Claims
- pending
- matched
- delivery-linked
- masked call button uses mocked local adapter
- message thread

### Deliveries
- today
- next 48h
- calendar
- map fallback
- notification preview
- state transition using local emulator only

### Support
- unread support
- contact form
- reply via mocked local adapter
- mark actioned

### Analytics
- 24h
- 7d
- empty history
- incomplete event coverage
- no fabricated metric

## 21.4 Viewports

Primary admin:

- 1440
- 1280
- 1024
- 768

Mobile should remain usable:

- 390
- 320

Do not make phone the primary data-dense experience, but do not break it.

## 21.5 Accessibility

- keyboard navigation
- visible focus
- semantic headings
- form labels
- status not color-only
- dialogs trap/restore focus
- target sizes
- 200% text layout stress
- reduced motion

---

# 22. Acceptance criteria

The branch is ready for user review only if:

1. No production environment was modified.
2. No production data was written during QA.
3. No real SMS/email/call/courier side effect occurred.
4. All existing integrations remain behind backend APIs.
5. Overview answers today's operational questions immediately.
6. Today's deliveries show people, timing, contact state, and next action.
7. Drop/Claim funnels show defensible data.
8. Wall defaults to useful inventory rather than an empty status filter.
9. Support is understandable as an inbox.
10. Analytics is comprehensible to a client.
11. Errors do not masquerade as empty/zero.
12. Backend lists are pagination-ready.
13. Existing public flows still pass regression tests.
14. Admin auth remains intact.
15. The UI is clearly more polished than the existing screenshots.
16. The branch is clean and isolated.
17. An independent code review reports no Critical or Important blockers.

---

# 23. Local visual review deliverable

Before any remote deployment, provide a local review URL.

Example:

`http://127.0.0.1:<port>/admin`

Show the actual application running against isolated synthetic local data.

Produce:

- Overview screenshot
- Notifications screenshot
- Drops screenshot
- Wall screenshot
- Claims screenshot
- Deliveries screenshot
- Support screenshot
- Analytics screenshot
- mobile/sidebar behavior
- short interaction video

Label fixture data clearly in the review environment, but keep that label outside normal customer/client layout where possible.

---

# 24. Handoff to Aniket

When complete, create:

`Docs/ADMIN_CONTROL_CENTER_HANDOFF.md`

Include:

- base SHA
- final SHA
- branch
- exact commits
- files changed
- new endpoints/contracts
- migrations/indexes if any
- env variable names used, never values
- integrations reused
- integration behavior preserved
- test results
- local run instructions
- staging instructions
- remaining limitations
- known production-only validations
- rollback approach
- cherry-pick order

Push only:

`release/admin-dashboard`

Do not merge or deploy unless separately approved.

---

# 25. Non-goals for this branch

Do not:

- redesign the public website again
- rebuild Brevo/MSG91/Edesy
- create a new courier platform
- create a full automation engine
- replace Firebase
- add a warehouse
- implement speculative RBAC
- “fix” unrelated product flow issues
- change legal/policy behavior
- use live customer data as local fixtures
- silently change business statuses

Log unrelated issues separately.

---

# 26. Final operating model

```text
                    RELOVED CONTROL CENTER
                              │
             ┌────────────────┴────────────────┐
             │                                 │
        PRODUCT HEALTH                    OPERATIONS
             │                                 │
        Analytics                         Today board
        Acquisition                       Notifications
        Funnels                           Drops / Wall
        Retention                         Claims
        Supply/Demand                     Deliveries
                                           Support
             │                                 │
             └────────────────┬────────────────┘
                              │
                       RELOVED ADMIN API
                              │
      ┌───────────────┬───────┼────────┬──────────────┐
      │               │       │        │              │
   Firestore      Notification Brevo   MSG91        Edesy
                     logs                           masking
      │
   Courier adapters / analytics adapters / future automations
```

The dashboard becomes the operational layer.

Integrations remain replaceable backend capabilities.

The UI remains a stable control surface even as vendors, delivery systems, and analytics sources evolve.
