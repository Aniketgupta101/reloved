# reloved · cost model

**What reloved costs, and at what point it starts costing more.**

Every paid service behind reloved, what's fixed vs. usage-based, and — for the services billed per request — the exact monthly active user count at which the free allowance runs out and real charges begin.

| | |
|---|---|
| **Prepared for** | Sheetal Ahuja |
| **Prepared by** | Totem Interactive |
| **Status** | Modelled estimate (ranged, not point figures), with two confirmed actuals |
| **Date** | 20 August 2026 (rev. — added MapTiler, previously missing) |
| **Hosting assumption** | Backend, database and item photos run on the cPanel plan — not Google Cloud Run / Cloud SQL |

Issued under Section 4 of the Phase 1 Scope of Work: domain, hosting, OTP/verification, email and similar third-party charges are billed separately (or paid directly by reloved) at approved actuals. Totem design and build fees are not included.

---

## 01 — How to read this document

reloved's live stack is billed across **GoDaddy** (domain + cPanel) and four usage vendors (**Brevo**, **MSG91**, **Gemini**, **MapTiler**). Google Cloud is **not** required for Phase 1 if the Node backend, MySQL/PostgreSQL database and photo uploads all sit on the cPanel account. Two GoDaddy items below are **confirmed actuals**. Everything else is a **planning model**.

- **Fixed subscriptions** — same price every year regardless of how many people use the platform. The cPanel plan is the whole application host: website API, database, disk for photos, and mailbox hosting.
- **Usage-based** — free up to a threshold, then billed per email / SMS actually sent. There is no per-request hosting meter once the backend is on cPanel.

The tables model the usage-based services against monthly-active-user (MAU) counts, using the assumptions listed here. Change the underlying usage pattern once reloved is live and these numbers move — this is a planning model, not a vendor quote.

**Assumptions**

- **1 monthly active user (MAU)** = one donor or one recipient-organisation contact who interacts with the platform at least once that month.
- **~4 emails/user/month** — roughly 3 transactional (submission confirmation, approval, allocation update) plus a share of one monthly broadcast to the full list. Drives the Brevo estimate.
- **1 OTP SMS per 2 users/month** — assumes roughly half of active users submit a donation (which triggers OTP) in a given month, not every visitor. Drives the MSG91 estimate.
- **~300KB per item photo** after the backend's automatic compression (resized, re-encoded WebP). Photos are stored on the cPanel disk, inside the hosting quota — not a separate Google Cloud Storage bill.
- **cPanel capacity** — shared hosting is the right fit for pilot and the first few thousand MAU. A VPS/upgrade is a later conversation (around multi-thousand concurrent traffic), not a Phase 1 line item.
- **~1 AI-processed photo per 2 users/month** — same "half of active users donate" assumption as OTP above; each donated item's photo gets background-removed and auto-categorized once via the Gemini API. Drives the Gemini estimate.
- **~1 map session per MAU/month** — the Local Impact Map sits directly on the homepage (`KindnessMap.tsx`), so a normal homepage visit loads one MapTiler map session — no extra click required, unlike the other three services. Drives the MapTiler estimate.

---

## 02 — Fixed costs — same price regardless of user count

### Domain & cPanel hosting — confirmed actuals

These two lines are the entire application host. The cPanel plan is where the backend API runs, where the database lives, where compressed item photos are stored, and where `sheetal@` / `hello@reloved.digital` mailboxes can be created — so there is no separate Cloud Run, Cloud SQL, Cloud Storage or paid mailbox product in this model.

| Item | Vendor | Billed | Amount |
|---|---|---|---|
| **Domain** — `reloved.digital` (already owned) | GoDaddy | Yearly | **₹398/yr** |
| **Web hosting (cPanel)** — Node API, database, photo disk, mailboxes | GoDaddy / host | Yearly | **₹2,388/yr** |
| **Fixed total (confirmed)** | | | **₹2,786/yr** |

These two are pass-through actuals, not estimates — billed once a year, on the registrar / host anniversary, not monthly. Exclusive of GST if applicable.

Google Workspace / Microsoft 365 is **optional**. If Sheetal prefers Gmail-style mailboxes instead of cPanel email, that would add ~₹2,400–3,120/yr — it is not required for the site to run.

### What the cPanel plan replaces

| Previously modelled (not used) | Now |
|---|---|
| Backend hosting — Cloud Run (~free until ~20,000 MAU, then per-request) | Included in cPanel. No per-request bill. |
| Database — Cloud SQL Sandbox (~₹900/mo, billed whether or not anyone visits) | Included. MySQL is standard on cPanel; PostgreSQL if the host offers it, otherwise the backend uses the cPanel MySQL database. |
| Photo storage — Cloud Storage (5GB free, then ~₹1.7/GB/mo) | Included. Files land on the cPanel disk (`STORAGE_DRIVER=disk`). |
| Business email — separate GoDaddy mailboxes (~₹200–260/mo) | Included. Mailboxes created in cPanel for `@reloved.digital`. |

The ~₹900/mo Cloud SQL instance was the old floor's largest single line. Running the backend on cPanel removes it.

---

## 03 — Usage-based costs, by user count

Modelled at five MAU tiers, using the assumptions in Section 01. **Free** = still inside the provider's free allowance. **Paid** = estimated volume once the free allowance is exhausted.

Hosting, database and photos do not appear here — they are already paid for in the cPanel subscription.

| | 100 MAU | 500 MAU | 1,000 MAU | 5,000 MAU | 10,000 MAU |
|---|---|---|---|---|---|
| **Backend / database / photos (cPanel)** | included | included | included | included | included* |
| **Email (Brevo)** — ~4 emails/user/mo, free ≤9,000/mo | free | free | free | ~₹1,800/mo | ~₹3,500/mo |
| **SMS/OTP (MSG91)** — no free tier, ~₹0.20/SMS | ~₹10–20/mo | ~₹50–100/mo | ~₹100–200/mo | ~₹500–1,000/mo | ~₹1,000–2,000/mo |
| **AI photo processing (Gemini API)** — token cost only** | free | ~₹15/mo | ~₹25/mo | ~₹125/mo | ~₹250/mo |
| **Maps (MapTiler)** — ~1 map session/MAU/mo, free ≤5,000 sessions/mo*** | free | free | free | ~₹2,490/mo | ~₹2,490/mo |
| **Usage-based subtotal** | **~₹10–20** | **~₹65–115** | **~₹125–225** | **~₹4,915–5,415** | **~₹7,240–8,240** |

\*Shared cPanel is modelled as sufficient through pilot. At sustained 5,000–10,000 MAU, the host may recommend a VPS — that would be a later upgrade quote, not this year's ₹2,388 plan.

\*\*"Free" here means token cost is ₹0 on a free API key — it does **not** mean unlimited requests. The free key's rate limit (~10–15 requests/minute, project-dependent) can throttle a burst of concurrent uploads well before 5,000–10,000 MAU is reached on paper — that's why this table shows a small paid estimate starting at 500 MAU rather than staying "free" until 5,000. See "AI photo processing (Gemini API)" below.

\*\*\*MapTiler's key (`VITE_MAPTILER_API_KEY`) is **already live in production today** — unlike Brevo/MSG91, which are switched off until email/OTP go live. The free tier is 5,000 map sessions/month; this table shows the paid Flex tier ($30/mo flat, ~₹2,490/mo, includes 25,000 sessions) starting at 5,000 MAU rather than exactly at the boundary, since the free tier **pauses the map entirely** once exceeded — too risky to leave right at the edge. See "Maps (MapTiler)" below.

The SMS/OTP row is a **range**, not a point estimate — see "SMS/OTP (MSG91): what a heavy user actually costs" below for why.

### Photo storage (cPanel disk)

Lifetime cumulative, inside the hosting quota. At ~300KB/photo, **~15,000–17,000 item photos** is roughly 5GB. Typical cPanel disk allowances are well above that for Phase 1. Cost does not meter per user the way email and SMS do. Keep a backup of the `uploads/` folder — on cPanel the disk *is* the source of truth.

### SMS/OTP (MSG91): what a heavy user actually costs

The ~1-OTP-per-2-users/month assumption is a blended average — it doesn't hold for every user. Donor accounts are **passwordless**: every login is an OTP, and a session token lasts 7 days (`TOKEN_TTL` in `auth.ts`). A casual user who checks in once a month re-verifies about as often as the base model assumes. A **heavy user** — someone actively giving or taking multiple items, checking back weekly, or switching between phone and laptop — can re-verify several times a month, not once.

Worked example: if ~10% of MAU are heavy users averaging **4 OTP logins/month** (roughly weekly re-verification) instead of the base ~0.5/month, the blended average across all users roughly **doubles**, from ~0.5 to ~1 OTP/user/month. That's the **upper end of the range** used in the table above and totals below — MSG91 spend could reasonably land anywhere in that ₹10–20 to ₹1,000–2,000/mo band depending on how many people actually behave that way, not a single fixed number. Real usage data after launch will narrow this quickly.

### AI photo processing (Gemini API)

Every item photo — whether uploaded by a donor on Give or bulk-loaded by admin — gets its background removed to white and its category/title/condition auto-suggested by Google's Gemini API (`gemini-2.5-flash`). Background removal itself runs locally on the backend server (no API cost); only the categorization call is billed.

\*\*Gemini's Standard (paid) tier is **$0.30 per 1M input tokens, $2.50 per 1M output tokens** (Aug 2026 published pricing). One photo + prompt ≈ 700 input tokens, one JSON suggestion ≈ 150 output tokens → **~$0.0006/photo (~₹0.05/photo)** — negligible at any realistic volume. **Cost was never the constraint here — the free API key's rate limit is.**

Google doesn't publish one fixed free-tier number any more (quotas are assigned per project and cut ~50–80% in Dec 2025); what's currently reported for `gemini-2.5-flash` free tier is in the range of **~10–15 requests/minute and ~250–1,500 requests/day** — check the live number for our project in the AI Studio console before relying on it. That's a *request-rate* ceiling, not a monthly cap. **Concretely, in this codebase:** admin bulk-upload accepts up to 20 photos in one batch and sends all 20 to Gemini at once, unthrottled — a single bulk-upload session alone can exceed the free tier's per-minute limit, independent of MAU. Past pilot scale, this needs a **billed API key**, not the free one — which, per the math above, costs a few rupees a month even at 10,000 MAU. The fix here is switching keys, not the free tier "running out" the way Brevo's does.

### Maps (MapTiler)

The homepage's "Local Impact Map" (`KindnessMap.tsx`, via `react-map-gl`/MapLibre) renders live tiles from MapTiler Cloud using a real API key already set in `frontend/.env` (`VITE_MAPTILER_API_KEY`) — **this one is already running in production, right now**, not a feature waiting to be switched on like Brevo or MSG91. It was missing from earlier drafts of this document; it's now included.

MapTiler's free tier is **5,000 map sessions/month** (a "session" ≈ one map load), plus far higher caps on raw API requests (100k/mo) and storage that aren't the binding constraint here. The paid **Flex tier is $30/month flat** (~₹2,490/mo), including 25,000 sessions/month — comfortably covers up to 10,000 MAU under the ~1-session/user assumption with no overage. Confirm current rates at MapTiler's pricing page before committing budget — like the other lines here, this is Aug 2026 published pricing, not a quote.

Unlike Brevo/MSG91/Gemini, MapTiler's free tier **pauses the map** (doesn't just throttle or bill overage) once the monthly quota is exceeded — the practical risk is the map going blank on the homepage, not a surprise invoice. That's why this document shows the paid Flex tier starting at 5,000 MAU rather than assuming the free 5,000-session cap holds exactly at that boundary.

---

## 04 — Total estimated monthly cost, by scale

Fixed + usage-based combined. The fixed line below is a monthly-equivalent of Section 02's confirmed **₹2,786/yr** (domain + cPanel) — it's actually billed once a year, not monthly; shown per-month here only so it can be added to the usage-based lines, which genuinely are monthly.

| | 100 MAU | 500 MAU | 1,000 MAU | 5,000 MAU | 10,000 MAU |
|---|---|---|---|---|---|
| Fixed (domain + cPanel, ₹2,786/yr) | ₹232 | ₹232 | ₹232 | ₹232 | ₹232 |
| Usage-based (Brevo, MSG91, Gemini, MapTiler) | ₹10–20 | ₹65–115 | ₹125–225 | ₹4,915–5,415 | ₹7,240–8,240 |
| **Estimated total — live today** | **~₹242–252** | **~₹297–347** | **~₹357–457** | **~₹5,147–5,647** | **~₹7,472–8,472** |
| + Borzo, roadmap placeholder (flat, see Section 07) | ₹3,000 | ₹3,000 | ₹3,000 | ₹3,000 | ₹3,000 |
| **Grand total, incl. Borzo** | **~₹3,242–3,252** | **~₹3,297–3,347** | **~₹3,357–3,457** | **~₹8,147–8,647** | **~₹10,472–11,472** |

Live-today: roughly **$3 at pilot scale**, rising to **~$90–102 at 10,000 monthly active users**. This is a **correction from an earlier revision** of this document, which quoted ~$60–72 at 10,000 MAU — that number omitted MapTiler entirely (see Section 03). The jump from 1,000 to 5,000 MAU is now driven by two things crossing their free tiers at once: Brevo (email) and MapTiler (maps), not email alone.

Incl. Borzo: **~$39/mo** at pilot, rising to **~$126–138/mo** at 10,000 MAU. The Borzo row is flat across every column on purpose — it scales with pickups booked, not MAU (see Section 07) — so it's a placeholder for an unbuilt feature, not a per-tier estimate like the rows above it.

---

## 05 — Exactly where the free tiers run out

| Service | Free allowance | Runs out at |
|---|---|---|
| **Brevo (email)** | 300 emails/day (~9,000/month) | **~2,250 MAU** |
| **MSG91 (SMS/OTP)** | No free tier — billed from message one | **day one** |
| **Gemini (AI photo processing)** | Free key: ~10–15 requests/min, ~250–1,500/day (project-dependent, check AI Studio) | **first burst of concurrent uploads** — a rate ceiling, not a MAU count |
| **MapTiler (maps)** | 5,000 map sessions/month, at ~1 session/MAU/mo | **~5,000 MAU** |
| **GoDaddy domain + cPanel** (API, database, photos, mailboxes) | Fixed annual subscription, not usage-metered | **day one** |
| **Cloud Run / Cloud SQL / Cloud Storage** | Not used in this model | **—** |

**The practical read:** reloved stays close to its **~₹232/month floor** (~₹2,786/year) through pilot and well into a genuine multi-hundred-user rollout — but three different things stop being free at three different points. **Cost-wise**, the first real jumps land at **~5,000 MAU** (MapTiler's session cap) and **~2,250 MAU** (Brevo's email cap) — both usage-based, both driven by real per-user activity, not hosting. **Reliability-wise**, Gemini needs a paid key much sooner than either: admin bulk-upload sends up to 20 photos to Gemini at once, unthrottled, so a single bulk-upload session can exceed the free tier's per-minute limit regardless of MAU — that's a request-*rate* problem, not a volume one, and it's budgeted from 500 MAU in this document as a precaution. None of these three are expensive in isolation (Gemini stays under ₹250/mo, MapTiler is a flat ~₹2,490/mo once triggered) — the point of tracking them separately is knowing *which* service needs attention first, not a single dollar figure.

---

## 06 — What's already free today / what is committed

The **domain (₹398/yr)** and **cPanel hosting (₹2,388/yr)** are the only confirmed annual commitments in this note.

Brevo is unused until transactional mail is switched on. MSG91 is unused until OTP is switched on. Gemini is wired in but runs on a free API key today. There is no Google Cloud invoice in this model.

**MapTiler is the one exception — it's live right now.** The Local Impact Map on the homepage renders with a real MapTiler key already, consuming free-tier map sessions on every visit, whether or not this pricing document has been reviewed. It's not a future toggle like the other three; it's already metering usage. Worth confirming the free-tier quota isn't already being approached before this document was even revised to include it.

None of this is a locked-in contract beyond those two annual GoDaddy subscriptions. If adoption later outgrows shared hosting, the move is a one-time plan upgrade (VPS), not a per-user Google Cloud meter.

---

## 07 — Later development: delivery-partner pickup (Borzo)

**Not live yet.** The product already has a "delivery partner pickup" option in the Give flow, shown as **Coming soon** — it records donor interest but doesn't book anything. It's excluded from the "live today" row in Section 04, but folded into that section's "Grand total, incl. Borzo" row as a placeholder, using the numbers below — so switching it on later isn't a surprise line item.

| | |
|---|---|
| **Vendor** | Borzo (formerly WeFast) — same-day courier, active in Mumbai |
| **Fixed cost** | **₹0/month.** No subscription — Borzo is pay-per-delivery, not a platform fee. |
| **Per-delivery cost** | Starts at **~₹40**, scales up with distance, parcel size, and urgency (standard vs. same-day). Get an exact quote per pickup via their API before booking. |
| **API access** | Requires a Borzo **business account** — apply directly with Borzo for API credentials; not self-serve like Brevo/MSG91/Gemini. Sales-assisted onboarding, no published self-signup pricing page. |
| **Who pays per delivery** | Business decision, not a technical one: reloved can absorb it as an operating cost, pass it to the requesting partner, or a mix. Not decided in this document. |

**Why it's excluded from Sections 03–05:** those tables assume a fixed cost-per-photo/email/SMS that scales cleanly with MAU. Delivery cost instead scales with **number of pickups actually booked** — a business/logistics number, not a user-count number — so it can't be folded into the same MAU-tier table without a real pickup-volume assumption, which doesn't exist yet pre-launch. Once the feature ships and pickup volume is observed for a month or two, this section gets a proper per-tier table like the others.

**Rough sense of scale, for planning only:** at 50 deliveries/month and ~₹60 average (mid-range distance), that's **~₹3,000/month** — bigger than every other usage-based line in this document combined, which is expected for a physical logistics cost vs. a software API cost. This is a placeholder estimate, not a quote — confirm real per-delivery pricing with Borzo once the integration is being built.

---

*reloved · cost model, prepared for internal & client review*  
Domain (₹398/yr) and cPanel hosting (₹2,388/yr) are confirmed actuals. Brevo, MSG91, Gemini and MapTiler figures are modelled estimates based on the assumptions in Section 01 — not vendor quotes. MapTiler is the only usage-based vendor already live in production as of this revision. Borzo figures (Section 07) are placeholder estimates for an unbuilt feature — confirm real rates with Borzo before committing budget. Confirm all figures against live pricing pages before committing budget. Exclusive of GST if applicable.
