# reloved · cost model

**What reloved costs, and at what point it starts costing more.**

Every paid service behind reloved, what's fixed vs. usage-based, and — for the services billed per request — the exact monthly active user count at which the free allowance runs out and real charges begin.

| | |
|---|---|
| **Prepared for** | Sheetal Ahuja |
| **Prepared by** | Totem Interactive |
| **Status** | Modelled estimate (ranged, not point figures), with two confirmed actuals |
| **Date** | 22 August 2026 (rev. — added India DLT registration & per-SMS charges) |
| **Hosting assumption** | Backend, database and item photos run on the cPanel plan — not Google Cloud Run / Cloud SQL. *Production pilot is currently on AWS Lightsail (~$3.50/mo); hosting line items below still reflect the GoDaddy cPanel model from the SOW.* |

Issued under Section 4 of the Phase 1 Scope of Work: domain, hosting, OTP/verification, email and similar third-party charges are billed separately (or paid directly by reloved) at approved actuals. Totem design and build fees are not included.

---

## 01 — How to read this document

reloved's live stack is billed across **GoDaddy** (domain + cPanel), four usage vendors (**Brevo**, **MSG91**, **Gemini**, **MapTiler**), and — for **SMS/OTP to Indian mobile numbers** — mandatory **TRAI DLT** registration on a telecom-operator portal. Google Cloud is **not** required for Phase 1 if the Node backend, MySQL/PostgreSQL database and photo uploads all sit on the cPanel account. Two GoDaddy items below are **confirmed actuals**. DLT and usage-vendor figures are a **planning model** based on published operator/aggregator rates (Aug 2026).

- **Fixed subscriptions** — same price every year regardless of how many people use the platform. The cPanel plan is the whole application host: website API, database, disk for photos, and mailbox hosting.
- **Usage-based** — free up to a threshold, then billed per email / SMS actually sent. There is no per-request hosting meter once the backend is on cPanel.

The tables model the usage-based services against monthly-active-user (MAU) counts, using the assumptions listed here. Change the underlying usage pattern once reloved is live and these numbers move — this is a planning model, not a vendor quote.

**Assumptions**

- **1 monthly active user (MAU)** = one donor or one recipient-organisation contact who interacts with the platform at least once that month.
- **~4 emails/user/month** — roughly 3 transactional (submission confirmation, approval, allocation update) plus a share of one monthly broadcast to the full list. Drives the Brevo estimate.
- **1 OTP SMS per 2 users/month** — assumes roughly half of active users submit a donation (which triggers OTP) in a given month, not every visitor. Drives the MSG91 estimate. **Email OTP (Brevo) does not use DLT** — only the phone/SMS channel does.
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

### India DLT (SMS compliance) — registration & recurring charges

Under **TRAI** rules, every commercial SMS to an Indian mobile number — including **OTP** — must be sent from a **DLT-registered Principal Entity (PE)**, using an approved **6-character Header (Sender ID)** and an approved **Content Template**. reloved uses **MSG91** as the SMS aggregator; MSG91 does **not** charge a platform setup fee, but **DLT registration is paid directly to a telecom operator**, not to MSG91.

**Register on one operator only** (Jio TrueConnect, Airtel, Vi, or BSNL). Once approved, your PE ID, headers and templates sync across operators. Typical lead time: **2–7 business days** for entity approval, plus **24–48 hours** for header/template approval and PE↔Telemarketer chain binding.

| Item | Who bills | Frequency | Amount (Aug 2026) |
|---|---|---|---|
| **Principal Entity (PE) registration** | Telecom DLT portal (Jio / Airtel / Vi / BSNL) | One-time at signup | **₹5,900** (₹5,000 + 18% GST) — [MSG91 DLT FAQ](https://msg91.com/help/dlt-registration-in-india/dlt-faqs) |
| **PE annual renewal** | Same operator | Yearly from year 2 | **₹5,900/yr** (operator-published; confirm on portal) |
| **Header (Sender ID) registration** | DLT portal | Per 6-alpha header | **Free** |
| **Content template registration** | DLT portal | Per template (OTP → **Service Implicit** category) | **Free** |
| **PE ↔ Telemarketer chain binding** | DLT portal — bind MSG91 as TM (`1302157225275643280`) | One-time setup | **Free** (mandatory — SMS blocked without it) |
| **MSG91 assisted DLT onboarding** (optional) | MSG91 support | One-time | **~₹1,770** (₹1,500 + GST, if you want them to walk through registration) |

**Documents typically required:** company PAN, GSTIN (if registered), certificate of incorporation / LLP deed, authorised-signatory ID, board resolution or authority letter, company letterhead upload. Sole proprietors can register but may need extra brand-to-entity proof if the Sender ID doesn't match the legal name (see MSG91 FAQ Q.10).

**What reloved needs on DLT before SMS OTP goes live:**

1. PE registration → 19-digit **Entity ID**
2. One **6-letter Header** (e.g. `RELOVD` — must correlate with reloved brand; operators reject mismatched names without proof)
3. At least one **OTP template** with 1–2 `{#var#}` slots, e.g. `Your reloved verification code is {#var#}. Valid for 10 minutes.`
4. Chain binding to **MSG91** as telemarketer
5. Copy **PE ID + Template ID** into `MSG91_SMS_TEMPLATE_ID` / MSG91 dashboard

**Per-SMS charges (usage — on top of registration above):**

| Component | Rate | Notes |
|---|---|---|
| **MSG91 transactional / OTP SMS** | **₹0.15–0.25/SMS** | Volume-tiered; no MSG91 setup fee. Prepaid wallet. |
| **TRAI DLT scrubbing fee** | **₹0.025/SMS** | Levied on every SMS submitted to the DLT network; often **excluded** from the headline MSG91 quote — budget as an add-on. |
| **All-in SMS/OTP (modelled)** | **~₹0.20–0.28/SMS** | Midpoint **~₹0.23/SMS** used in the tables below (= ₹0.20 MSG91 + ₹0.025 DLT scrub + GST rounding buffer). |

**2Factor (dev fallback only):** The backend can fall back to **2Factor** when `MSG91_AUTH_KEY` is unset — useful for local testing without DLT. It is **not** a substitute for production SMS compliance in India; live phone OTP for donors should run through **MSG91 + DLT** once registered.

**Email OTP (Brevo):** Donor login via email uses Brevo templates — **no DLT**, no per-SMS charge. Brevo free tier covers early volume (see Section 03).

---

## 03 — Usage-based costs, by user count

Modelled at five MAU tiers, using the assumptions in Section 01. **Free** = still inside the provider's free allowance. **Paid** = estimated volume once the free allowance is exhausted.

Hosting, database and photos do not appear here — they are already paid for in the cPanel subscription.

| | 100 MAU | 500 MAU | 1,000 MAU | 5,000 MAU | 10,000 MAU |
|---|---|---|---|---|---|
| **Backend / database / photos (cPanel)** | included | included | included | included | included* |
| **Email (Brevo)** — ~4 emails/user/mo, free ≤9,000/mo | free | free | free | ~₹1,800/mo | ~₹3,500/mo |
| **SMS/OTP (MSG91 + DLT scrub)** — no free tier, ~₹0.23/SMS all-in* | ~₹12–25/mo | ~₹60–120/mo | ~₹115–230/mo | ~₹575–1,150/mo | ~₹1,150–2,300/mo |
| **AI photo processing (Gemini API)** — token cost only** | free | ~₹15/mo | ~₹25/mo | ~₹125/mo | ~₹250/mo |
| **Maps (MapTiler)** — ~1 map session/MAU/mo, free ≤5,000 sessions/mo*** | free | free | free | ~₹2,490/mo | ~₹2,490/mo |
| **Usage-based subtotal** | **~₹12–25** | **~₹75–135** | **~₹140–255** | **~₹4,990–5,540** | **~₹7,390–8,490** |

\*All-in SMS assumes **~₹0.20 MSG91 + ₹0.025 TRAI DLT scrub fee** per message. MSG91's published quote often shows only the aggregator portion — see "India DLT" in Section 02.

\*Shared cPanel is modelled as sufficient through pilot. At sustained 5,000–10,000 MAU, the host may recommend a VPS — that would be a later upgrade quote, not this year's ₹2,388 plan.

\*\*"Free" here means token cost is ₹0 on a free API key — it does **not** mean unlimited requests. The free key's rate limit (~10–15 requests/minute, project-dependent) can throttle a burst of concurrent uploads well before 5,000–10,000 MAU is reached on paper — that's why this table shows a small paid estimate starting at 500 MAU rather than staying "free" until 5,000. See "AI photo processing (Gemini API)" below.

\*\*\*MapTiler's key (`VITE_MAPTILER_API_KEY`) is **already live in production today** — unlike Brevo/MSG91, which are switched off until email/OTP go live. The free tier is 5,000 map sessions/month; this table shows the paid Flex tier ($30/mo flat, ~₹2,490/mo, includes 25,000 sessions) starting at 5,000 MAU rather than exactly at the boundary, since the free tier **pauses the map entirely** once exceeded — too risky to leave right at the edge. See "Maps (MapTiler)" below.

The SMS/OTP row is a **range**, not a point estimate — see "SMS/OTP (MSG91 + DLT): what a heavy user actually costs" below for why.

### SMS/OTP (MSG91 + DLT): what a heavy user actually costs

The ~1-OTP-per-2-users/month assumption is a blended average — it doesn't hold for every user. Donor accounts are **passwordless**: every login is an OTP, and a session token lasts 7 days (`TOKEN_TTL` in `auth.ts`). A casual user who checks in once a month re-verifies about as often as the base model assumes. A **heavy user** — someone actively giving or taking multiple items, checking back weekly, or switching between phone and laptop — can re-verify several times a month, not once.

**Per-message math (phone channel):** at the modelled **~₹0.23/SMS all-in** (MSG91 ~₹0.20 + DLT scrub ~₹0.025), 50 OTPs/month ≈ **₹11.50**, 500 OTPs/month ≈ **₹115**, 5,000 OTPs/month ≈ **₹1,150**. These are **in addition to** the fixed DLT PE registration (**₹5,900** year one, **₹5,900/yr** renewal) in Section 02 — that fee buys compliance, not message credits.

Worked example: if ~10% of MAU are heavy users averaging **4 OTP logins/month** (roughly weekly re-verification) instead of the base ~0.5/month, the blended average across all users roughly **doubles**, from ~0.5 to ~1 OTP/user/month. That's the **upper end of the range** used in the table above and totals below — MSG spend could reasonably land anywhere in that ₹12–25 to ₹1,150–2,300/mo band depending on how many people actually behave that way, not a single fixed number. Real usage data after launch will narrow this quickly.

**Reducing SMS spend:** Email OTP (Brevo) is already wired in the app and avoids DLT per-message fees entirely — worth steering donors toward email login during pilot if DLT registration is still in progress.

### Photo storage (cPanel disk)

Lifetime cumulative, inside the hosting quota. At ~300KB/photo, **~15,000–17,000 item photos** is roughly 5GB. Typical cPanel disk allowances are well above that for Phase 1. Cost does not meter per user the way email and SMS do. Keep a backup of the `uploads/` folder — on cPanel the disk *is* the source of truth.

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

Fixed + usage-based combined. The fixed lines below are monthly-equivalents of Section 02 — domain + cPanel (**₹2,786/yr**) and DLT PE registration (**₹5,900/yr** from year one) are actually billed annually, not monthly; shown per-month here only so they can be added to the usage-based lines.

| | 100 MAU | 500 MAU | 1,000 MAU | 5,000 MAU | 10,000 MAU |
|---|---|---|---|---|---|
| Fixed (domain + cPanel, ₹2,786/yr) | ₹232 | ₹232 | ₹232 | ₹232 | ₹232 |
| Fixed (DLT PE registration, ₹5,900/yr amortised) | ₹492 | ₹492 | ₹492 | ₹492 | ₹492 |
| Usage-based (Brevo, MSG91+DLT, Gemini, MapTiler) | ₹12–25 | ₹75–135 | ₹140–255 | ₹4,990–5,540 | ₹7,390–8,490 |
| **Estimated total — live today** | **~₹736–749** | **~₹799–859** | **~₹864–979** | **~₹5,714–6,264** | **~₹8,114–9,214** |
| + Borzo, roadmap placeholder (flat, see Section 07) | ₹3,000 | ₹3,000 | ₹3,000 | ₹3,000 | ₹3,000 |
| **Grand total, incl. Borzo** | **~₹3,736–3,749** | **~₹3,799–3,859** | **~₹3,864–3,979** | **~₹8,714–9,264** | **~₹11,114–12,214** |

Live-today: roughly **~₹740/mo at pilot scale** (includes amortised DLT registration), rising to **~₹8,100–9,200/mo at 10,000 MAU**. The **~₹492/mo DLT line** is not MSG credits — it is the annual PE registration spread across 12 months; message spend is in the usage-based row above.

Incl. Borzo: **~₹3,740/mo** at pilot, rising to **~₹11,100–12,200/mo** at 10,000 MAU. The Borzo row is flat across every column on purpose — it scales with pickups booked, not MAU (see Section 07).

**Year-one cash outlay (DLT + hosting):** besides monthly usage, budget **₹5,900** once for DLT PE registration (plus optional **~₹1,770** for MSG91-assisted setup) before the first SMS OTP can legally send. Email OTP via Brevo can go live without this step.

---

## 05 — Exactly where the free tiers run out

| Service | Free allowance | Runs out at |
|---|---|---|
| **Brevo (email)** | 300 emails/day (~9,000/month) | **~2,250 MAU** |
| **MSG91 (SMS/OTP)** | No free tier — billed from message one | **day one** (requires DLT PE registration first) |
| **TRAI DLT scrubbing fee** | ₹0.025/SMS on every Indian SMS | **day one** (added to MSG91 per-SMS rate) |
| **DLT Principal Entity registration** | One PE per legal entity; renews annually | **before first SMS** — **₹5,900** (₹5,000 + GST) |
| **Gemini (AI photo processing)** | Free key: ~10–15 requests/min, ~250–1,500/day (project-dependent, check AI Studio) | **first burst of concurrent uploads** — a rate ceiling, not a MAU count |
| **MapTiler (maps)** | 5,000 map sessions/month, at ~1 session/MAU/mo | **~5,000 MAU** |
| **GoDaddy domain + cPanel** (API, database, photos, mailboxes) | Fixed annual subscription, not usage-metered | **day one** |
| **Cloud Run / Cloud SQL / Cloud Storage** | Not used in this model | **—** |

**The practical read:** reloved's **cash floor** is higher than hosting alone once SMS is in scope: **₹2,786/yr** (domain + cPanel) **+ ₹5,900/yr** (DLT PE registration) ≈ **₹8,686/yr** (~₹724/mo) before a single OTP sends. Email-only OTP (Brevo) avoids the DLT line entirely. After DLT is live, per-SMS spend stays modest at pilot scale (**~₹12–25/mo** at 100 MAU) but has **no free tier**. Cost-wise, the first large usage jumps still land at **~2,250 MAU** (Brevo email) and **~5,000 MAU** (MapTiler maps). Reliability-wise, Gemini needs a paid key much sooner than either — see Section 03.

---

## 06 — What's already free today / what is committed

The **domain (₹398/yr)** and **cPanel hosting (₹2,388/yr)** are confirmed annual commitments. **DLT PE registration (₹5,900)** is a separate one-time/annual compliance cost — required before **phone** OTP via MSG91, not before **email** OTP via Brevo.

Brevo email OTP is live-capable today (subject to Brevo account + IP allowlist). MSG91 SMS is wired but needs DLT PE + Header + Template + PE↔MSG91 chain binding before Indian mobile OTP delivers. Gemini runs on a free API key today.

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
Domain (₹398/yr) and cPanel hosting (₹2,388/yr) are confirmed actuals. **DLT PE registration (₹5,900, ₹5,000 + GST)** is per [MSG91's published DLT FAQ](https://msg91.com/help/dlt-registration-in-india/dlt-faqs) and telecom-operator portals — confirm on the operator you choose before paying. Per-SMS DLT scrub fee (~₹0.025/SMS) is TRAI-mandated and billed in addition to MSG91's quoted rate. Brevo, MSG91, Gemini and MapTiler usage figures are modelled estimates — not vendor quotes. MapTiler is already live in production. Borzo figures (Section 07) are placeholders for an unbuilt feature. Exclusive of GST where not already included.
