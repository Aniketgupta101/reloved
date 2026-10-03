# RELOVED — Project Roadmap & Consolidated Patch Notes

**Final handover edition · Combines every patch-notes update, client fix log, and status report issued to date into one document.**

*Prepared by Aniket Gupta / Totem Interactive · For Sheetal Ahuja & the Reloved team · 21 August – 3 October 2026*

---

## Executive Summary

Reloved went from a blank repo to a live, publicly-used donation platform at **reloved.digital** in six weeks. The build ran in two halves:

1. **21 Aug – 26 Sep: Product build-out and live Friends & Family testing.** Homepage, Wall of Kindness, Give/Claim flows, email + SMS notifications, privacy/handover logistics, AI photo processing, and two full rounds of real-user QA (18–19 Sep and ongoing) drove the bulk of the user-facing feature work and bug-fixing. This is the period covered day-by-day in `RELOVED_PATCH_NOTES.md`.
2. **27 Sep – 3 Oct: Admin Control Center rebuild, security/scale hardening, multi-courier booking, and final feature polish.** The admin side was rebuilt from a fragmented set of pages into a single operational surface (Overview, Notifications, Drops, Wall, Claims, Deliveries, Support, Analytics), backed by a production PostHog analytics integration. In parallel, an independent security/concurrency audit closed race-condition, idempotency, and data-exposure gaps, and Borzo/Shadowfax/Shiprocket courier booking was wired directly into Admin. The most recent ship (3 Oct) added donor-side instant schedule confirmation, widened item-matching radius from 3km to 15km, and FREE badges on item detail pages.

**Where things stand today:**

| | |
|---|---|
| **Live production site** | [reloved.digital](https://reloved.digital) (Firebase Hosting + Cloud Functions, `asia-south1`) |
| **Core user journey** | Donate → AI photo processing → publish to Wall → claim → courier pickup/delivery → confirmation — fully built, tested, and live |
| **Admin Control Center** | Rebuilt end-to-end; released 30 Sep with 28/28 UI tests, 32/32 live-safety tests, 65/65 backend tests passing |
| **Tracked feature checklist** (per `Reloved_Status_Report.pdf`) | 34 done · 2 in progress · 1 not started |
| **Known open items** | Phone autofill reliability on signup, delivery/chat screen scoping — carried from 25 Sep log, status needs a fresh pass (see [Pending Work](#pending-work--phase-2-roadmap)) |
| **Biggest external blocker** | Edesy call-masking full automation and additional MSG91 SMS template approvals — both are sitting in third-party vendor queues, not engineering work |

Nothing in the list below is a surprise introduced in this document — every line ships from a dated commit or a client-facing note already sent. This document's job is to put the whole timeline, and what's left, in one place.

---

## Development Timeline (Roadmap)

Seven working weeks, 21 Aug – 3 Oct 2026, plus the Phase 2 backlog. Each row is a workstream; the shaded span is when it was actively worked. ✅ = shipped and live today · ⏳ = in progress / partially shipped · ⬜ = not started.

| Workstream | W1<br>21–27 Aug | W2<br>28 Aug–3 Sep | W3<br>4–10 Sep | W4<br>11–17 Sep | W5<br>18–24 Sep | W6<br>25 Sep–1 Oct | W7<br>2–3 Oct | Phase 2 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1. Foundation & brand (homepage, Wall, OTP auth) | ✅ | | | | | | | |
| 2. Give & Claim core flow + email notifications | | ✅ | ✅ | | | | | |
| 3. Privacy & handover logistics (building-gate protocol) | | | ✅ | ✅ | | | | ⏳ call masking |
| 4. Matching logic, notification copy, lighter onboarding | | | | ✅ | | | | |
| 5. Live Friends & Family testing + rapid-fix cycles | | | | | ✅ | | | |
| 6. Photo AI rebuild & multi-item drop | | | | | ✅ | ✅ | | |
| 7. Mobile polish & public launch (reloved.digital live) | | | | | | ✅ | | |
| 8. Admin Control Center rebuild (8 modules) | | | | | | ✅ | ✅ | |
| 9. PostHog product analytics integration | | | | | | ✅ | ✅ | |
| 10. Security & concurrency hardening (audit fixes) | | | | | | ✅ | ✅ | |
| 11. Multi-courier booking (Borzo/Shadowfax/Shiprocket) + live tracking | | | | | | | ✅ | |
| 12. Donor schedule confirmation, 15km radius, FREE badges | | | | | | | ✅ | |
| 13. Scalability Phase 0 hotfix (timeouts, polling, health checks) | | | | | | | | ⏳ |
| 14. Partner/NGO bulk-match workflow | | | | | | | | ⬜ |
| 15. Branded SMS sender ID — full DLT template approval | | | | | | | | ⏳ |
| 16. Load testing & 1,000+ concurrent-user verification | | | | | | | | ⬜ |

*A fully visual version of this chart, with proportional bars, is in the rendered PDF (`RELOVED_PROJECT_ROADMAP_FINAL.pdf`).*

---

## Phase-by-Phase Narrative

### 21 Aug – 26 Sep: Product build and live testing

This stretch is documented day-by-day, with the exact client feedback that drove each fix, in **`RELOVED_PATCH_NOTES.md`**. Headlines:

- **21–29 Aug** — Built and shipped the first version of the site: hero, Wall of Kindness, OTP sign-in, item categories, Impact Map.
- **31 Aug** — First client feedback round: button colours, hero copy, real delivery-method choices. Also the point of the formal **Phase 1 handover** (`HANDOVER.md`): 5 of 6 Phase 1 workstreams fully live, 1 live with a piece pending, 6 extras shipped beyond scope.
- **2 Sep** — Hero visual fixes, Privacy Policy rewritten to exact client wording.
- **8–10 Sep** — Building-gate privacy protocol locked in (no flat numbers, security-desk handoff only); Edesy call-masking KYC submitted.
- **9–12 Sep** — Give, Claim, and email flows connected end to end; admin claim view shipped; two-way chat added.
- **13–16 Sep** — 3km radius matching built; every notification rewritten to exact client copy; decline-reason flow added.
- **17 Sep** — Dashboard stats reworked (Time Saved, Kindness Streak, Items Reloved); multi-photo swipe gallery.
- **18–19 Sep** — Live Friends & Family testing on `go.reloved.digital/test` surfaces the single largest batch of real-usage fixes in one evening: persistent drop forms, optional description, username field, signup-before-drop ordering, instant Wall publishing, claim cancellation, and more.
- **19 Sep (evening) – 21 Sep** — Deeper tester pass (Waseem/Jass): AI photo auto-fill, address-search fixes, 3km filter correction. Photo-AI speed became the top priority; fixed same evening with a rebuilt multi-item upload flow (`item1-pics` / `item2-pics` / … exactly as briefed).
- **22–23 Sep** — Full site QA audit (no privacy leaks, auth holds up); logout and claim-link bugs fixed; post-handover success/celebration popup shipped.
- **24 Sep** — Mobile polish, Wall status lifecycle sync (Being Matched → Claimed → Reloved), notification noise reduction, **went live on reloved.digital**.
- **25–26 Sep** — Instagram/in-app-browser handoff fixed, claimer identity shown on Accept/Decline, Drop wording rollout, Admin Overview board shipped, Wall status-stamp fix (Pink Corduroy bug), Jass's ~43-item batch restored, MSG91 SMS templates (5) went Active and live-tested on a real Indian number.

Full detail, bullet-by-bullet with the exact client quote that triggered each fix: `Docs/RELOVED_PATCH_NOTES.md`. Technical/vendor-level detail for the 26 Sep release: `Docs/PATCH_NOTES_2026-09-26.md`.

### 27 Sep – 3 Oct: Admin Control Center, security hardening, and final feature push

This stretch isn't in the day-by-day patch notes doc — it's reconstructed here from the commit history and the companion engineering docs written alongside it.

**27 Sep — Stabilizing the live site.** Fixed a storage-bucket misconfiguration and a "Null Island" (0,0 coordinate) bug that were breaking live Drop/Claim; fixed Wall grey-box photos by enabling studio cutouts end-to-end; updated claimer thank-you copy to "Wall of Love." A parallel UX pass (tracked in commits tagged `fix(ux)`) made drop outcomes explicit and recoverable, separated write failures from status-refresh failures, and stopped the product from promising immediate Wall publication when it couldn't guarantee it.

**28–30 Sep — Two work-streams in parallel:**

- **Scalability planning.** `SYSTEM_DESIGN_1000_USERS.md` and `SCALABILITY_ROADMAP_1000_PLUS.md` were written (28 Sep), followed by `SCALABILITY_PHASE_0_HOTFIX.md` — a scoped, no-architecture-change plan to make the live API safe under concurrent load (vendor-call timeouts, smarter polling, a real health check) before any bigger redesign. This is planning + a few shipped hotfixes, not a full capacity guarantee — see [Pending Work](#pending-work--phase-2-roadmap).
- **Admin Control Center rebuild.** Replacing the fragmented legacy admin pages with one operational surface: typed Overview/Attention data contracts, a local QA harness, paginated Drops and Wall operations, rebuilt Claims and Delivery operations, Support and Analytics workspaces, and courier/communication actions with proper eligibility checks. Released 30 Sep (`ADMIN_CONTROL_CENTER_RELEASE_NOTES.md`) with:
  - Frontend typecheck/build: passing
  - Admin UI suite: 28/28
  - Live read-only safety suite: 32/32
  - Backend suite: 65/65; provider safety suite: 17/17
  - Independent whole-branch review: all Critical/Important findings closed

  In parallel, a dedicated security/concurrency audit (tracked as `security-core`) closed production audit issues, concurrency race conditions, and logistics data-safety gaps — courier actions are now fenced to confirmed orders, claim decisions are serialized, cancellations and lease completions are fenced against double-processing.

**1 Oct — Courier and photo-pipeline work ships.** Borzo and Shadowfax admin booking controls shipped; a misrouted-claim-notification bug was fixed (the one affecting the 26-item/2-donor/17-thread batch documented in `report.md`); multi-item drop emails were consolidated into one summary per drop; a live tracking link was added to rider-coming and order-dispatched SMS/email. Alongside this, the AI photo-analysis backend and Wall of Kindness frontend were substantially reworked: product image normalization, background-cutout utilities, batch cutout scripts, and a new `WallOfKindnessCard` component.

**2–3 Oct — Admin dashboard merges into the handover branch; final feature ship.** `release/admin-dashboard` was merged into `client-handover`, making the rebuilt Admin Control Center the live baseline. Follow-up fixes corrected a PostHog HogQL query error, raised PostHog query timeouts to absorb cold-start latency, and raised the Overview read budget for production-scale cohorts. The same day, the most recent feature ship ("donor instant schedule confirmation flow, 15km matching radius, item detail FREE badges") went out — widening the matching radius from the original 3km to **15km** (more Wall items become visible to each claimer), letting donors confirm a handover schedule instantly instead of waiting on an admin round-trip, and adding explicit FREE badges to item detail pages.

Full before/after detail on the admin rebuild: `ADMIN_ANALYTICS_BEFORE_AFTER.md`, `ADMIN_CONTROL_CENTER_HANDOFF.md`, `ADMIN_PRODUCTION_PARITY_AUDIT.md`. Everything grouped by feature area instead of date (donating/claiming, photos, delivery, notifications, privacy/security, stability, admin tools): `Docs/report.md`.

---

## Pending Work / Phase 2 Roadmap

Nothing below blocks the platform from running day-to-day. This is what moves Reloved from "live and working" to "fully finished and scaled."

| Item | Status | Why it's not done | Blocked on |
|---|---|---|---|
| **Edesy call-masking, full automation** | ⏳ In progress | KYC application submitted 8–10 Sep; number provisioning is a vendor-side queue | Edesy (external, 4–6 business days quoted, has run longer) |
| **Branded SMS sender ID — remaining DLT templates** | ⏳ In progress | 5 of the active-flow templates are live and verified on a real number; the rest are in carrier approval | MSG91/DLT carrier approval (external) |
| **Scalability Phase 0 hotfix — full execution** | ⏳ In progress | Plan is written and scoped (`SCALABILITY_PHASE_0_HOTFIX.md`); some hotfixes (PostHog timeouts, read-budget increases) have shipped, but the full list (vendor-call timeouts across all providers, visibility-aware polling, warm-instance health check) is not fully rolled out | Engineering time |
| **Load testing & 1,000+ concurrent-user verification** | ⬜ Not started | Phase 0 hotfixes need to land first — load numbers before Phase 0 would just measure the known problems, not real capacity | Phase 0 completion |
| **Direct-to-storage photo uploads** | ⬜ Not started | Uploads currently proxy through the function before hitting storage; fine at current volume, a scale item for headroom | Engineering time |
| **Deep dual-courier integration (automatic status sync across providers)** | ⬜ Not started | Deliberately deferred since 8–10 Sep so it didn't hold up launch; Borzo/Shadowfax/Shiprocket are bookable from Admin today, but cross-provider automatic status reconciliation is not built | Scoping + engineering time |
| **Partner/NGO bulk-match workflow** | ⬜ Not started | NGOs can apply and be approved; the workflow to actually match a bulk donation to the right partner and hand it off is a real feature, not a quick patch | Scoping + engineering time |
| **Structured defects picker, 1–10 condition scale, liability-waiver copy, in-app photo guide** | ⬜ Not started | Good ideas from the 19 Sep deep-test session; need design thought, not a quick patch | Design + engineering time |
| **Dashboard loading-state polish (all admin screens)** | ⏳ In progress | Smooth loading placeholders exist on the Wall; rollout to every dashboard screen is next | Engineering time |
| **Donor dashboard data-fetch efficiency** | ⏳ In progress | Partially optimized; a further pass will cut down repeated lookups | Engineering time |
| **Point `reloved.digital` DNS fully + Google Business Profile** | ✅ / Client action | Domain is live and mapped; a Google Business Profile is still a client-side setup task (~15 min), not engineering | Client |

**Closed out 3 Oct (evening):**

- ✅ **Phone autofill on signup** — root cause was a missing `autoComplete` hint on the signup phone field (the Give form's equivalent field already had it and worked fine). Fixed on signup, the claim modal, contact/partner forms, and the account phone field for consistency.
- ✅ **Delivery/chat screen scoped to the active claim only** — confirmed each claim and donation has its own dedicated detail page and chat thread (`/account/claims/:id`, `/account/gives/:id`); re-verified against the rebuilt Admin Control Center's Claims/Deliveries views, which use the same single-record scoping.

---

## Reference: Source Documents

This document synthesizes, rather than replaces, the following. Each stays the authoritative source for its own level of detail:

| Document | What it covers |
|---|---|
| `RELOVED_PATCH_NOTES.md` | Day-by-day narrative, 21 Aug – 26 Sep, with the exact client feedback behind each fix |
| `PATCH_NOTES_2026-09-26.md` | Technical/vendor detail for the 26 Sep release |
| `report.md` | Every fix grouped by feature area (not date), covering the full project to date |
| `Reloved_Status_Report.pdf` | The 6-step user journey + 4 supporting pillars, with a Done/In-Progress/Not-Started tally |
| `HANDOVER.md` | Formal Phase 1 handover document (31 Aug) |
| `RELOVED_END_OF_PROJECT_FEATURES_AND_SERVICES.md` | Full feature and third-party-service inventory (as of 12 Sep) |
| `ADMIN_CONTROL_CENTER_RELEASE_NOTES.md` | Admin Control Center release summary and test results (30 Sep) |
| `SCALABILITY_PHASE_0_HOTFIX.md` / `SCALABILITY_ROADMAP_1000_PLUS.md` / `SYSTEM_DESIGN_1000_USERS.md` | Scale planning and the pending hardening work |

---

*RELOVED · Project Roadmap & Consolidated Patch Notes · Last updated 3 October 2026*
