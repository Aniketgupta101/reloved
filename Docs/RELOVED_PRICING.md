---
pdf_options:
  format: A4
  margin: 8mm 9mm 8mm 9mm
  printBackground: true
stylesheet:
  - RELOVED_PRICING.pdf.css
---

# reloved · cost model

**Prepared for** Sheetal Ahuja · **By** Totem Interactive · **22 Aug 2026** · *Rev 6 — 27 Aug 2026* · Modelled estimates (ranged). Domain + cPanel = confirmed actuals. Totem build fees excluded. Per SOW §4, third-party charges at approved actuals.

**Stack:** GoDaddy (domain + cPanel: mail, static frontend) · **Firebase** (backend — API, auth, database, storage; Blaze pay-as-you-go plan) · Brevo (email/OTP) · MSG91 + **TRAI DLT** (SMS OTP) · Gemini (AI cataloguing) · MapTiler (map). No separate VPS.

**MAU assumptions** (from actual call patterns in the code, not flat guesses): **~2.5 SMS OTP/user/mo** (donor sessions expire in 7 days — confirmed from the session token, so repeat visits mean repeat OTPs) · **~4–5 emails/user/mo** (every donation sends 2: donor confirmation + admin alert; every claim adds 1) · **~0.6 Gemini calls/user/mo** (billed **per photo uploaded**, not per user/donation — up to 5 photos allowed per donation) · **~1 map load/user/mo**. Email OTP needs **no DLT**.

> **Open item:** AI photo processing (Gemini + background removal) has no confirmed home post-VPS. Code currently relays to an external server for native binaries (sharp/ONNX) a plain Cloud Function can't run. Likely fix is **Cloud Run** (same Firebase billing) — not yet built, not priced below.

## Fixed costs (annual) & Firebase Blaze

| Item | Vendor | Amount |
|---|---|---|
| Domain `reloved.digital` | GoDaddy | **₹398/yr** ✓ |
| Mail + static frontend hosting | GoDaddy cPanel | **₹2,388/yr** ✓ |
| **Subtotal fixed hosting** | | **₹2,786/yr** (~₹232/mo) |

**Firebase Blaze** (Cloud Functions + Firestore + Storage + Hosting) is mandatory pay-as-you-go here — the functions call Brevo/MSG91, and Firebase's free "Spark" plan blocks all outbound networking. No monthly minimum; billed only past the free tier below.

| Component | Free tier (no cost within these) | Overage rate |
|---|---|---|
| Cloud Functions (1 fn, `asia-south1`) | 2M invocations/mo · 400K GB-s/mo · 200K CPU-s/mo · 5GB out/mo | ~₹38/M invocations · compute rate TBC (Tier 2 region, ~10% above US) · ~₹11.45/GB out |
| Firestore | 50K reads/day · 20K writes/day · 20K deletes/day · 1 GiB | ~₹5.72/100K reads · ~₹17.17/100K writes · ~₹1.91/100K deletes |
| Cloud Storage (photos) | 5 GB-months (**cumulative, not monthly**) · 100 GB/mo download | ~₹1.90/GB/mo past free tier |
| Firebase Hosting | 10 GB storage · 360 MB/day transfer | ₹2.50/GB storage · ₹14/GB transfer |

At every modelled MAU (100–10,000), Firestore/Functions/Hosting stay inside the free tier even under generous per-user assumptions (50 reads + 20 writes/user/mo ≈ 16,700 reads/day at 10,000 MAU, vs the 50K/day cap). **Cloud Functions compute time (GB-seconds)** is the one line to actually monitor — photo-relay calls run longer than plain CRUD, and may approach the 400K GB-s/mo free cap at the top end; no confident ₹ figure without real traffic.

### India DLT — required before SMS OTP (not email OTP)

Register via **MSG91's linked partner, SmartPing (STPL)** — `smartping.live` — so the Principal Entity links correctly to MSG91 as Telemarketer. Lead time ~2–7 business days.

| Item | Frequency | Amount |
|---|---|---|
| Principal Entity (PE) registration | Year 1 + renewal | **₹5,900** (₹5,000+GST) |
| Header (Sender ID) + OTP template | Once | Free |
| PE ↔ MSG91 telemarketer binding | Once | Free (mandatory) |
| MSG91 assisted setup (optional) | Once | ~₹1,770 |

**Per SMS:** MSG91 ₹0.15–0.25 + DLT scrub ₹0.025 → **~₹0.23/SMS all-in**. **No-DLT launch path:** MSG91's OTP Widget (already integrated, tested working) needs no DLT — use it while DLT registration runs in parallel. Before first raw-template OTP: PE ID · header · template (Service Implicit) · TM `1302157225275643280` chain-bind (*confirm still current*).

## Usage-based by scale (monthly, excl. fixed hosting & DLT amortisation)

| | 100 MAU | 500 | 1,000 | 5,000 | 10,000 |
|---|---:|---:|---:|---:|---:|
| Firebase Blaze — Functions/Firestore/Hosting | PAYG, in-tier* | PAYG, in-tier* | PAYG, in-tier* | PAYG, in-tier* | PAYG, in-tier* |
| Firebase Storage | PAYG, in-tier** | PAYG, in-tier** | PAYG, in-tier** | PAYG, in-tier** | PAYG, in-tier** |
| Email (Brevo) | free | free | free | ~₹1,800 | ~₹3,500 |
| SMS/OTP (MSG91+DLT) | ₹60–125 | ₹300–600 | ₹575–1,150 | ₹2,875–5,750 | ₹5,750–11,500 |
| AI photos (Gemini) | ~₹4 | ~₹18 | ~₹30 | ~₹150 | ~₹300 |
| Maps (MapTiler) | free | free | free | ~₹2,490 | ~₹2,490 |
| **Usage subtotal** | **₹64–129** | **₹318–618** | **₹605–1,180** | **₹7,315–10,190** | **₹12,040–17,790** |

**PAYG = pay-as-you-go** — billed automatically past the free tier, no plan upgrade or resizing needed. \*"In-tier" means modelled usage at this MAU stays inside the free allowance, so this month's bill is ₹0 — not that the service is free. Cloud Functions compute is the one line to recheck post-launch. \*\*Storage's free allowance is cumulative, not monthly — revisit a few months post-launch regardless of MAU. **Excludes AI photo processing (Gemini/bg-removal) hosting — see open item above; likely a small usage-based Cloud Run line once built.**

## Total estimated monthly cost

| | 100 MAU | 500 | 1,000 | 5,000 | 10,000 |
|---|---:|---:|---:|---:|---:|
| Fixed hosting | ₹232 | ₹232 | ₹232 | ₹232 | ₹232 |
| DLT PE amortised | ₹492 | ₹492 | ₹492 | ₹492 | ₹492 |
| Usage (above) | ₹64–129 | ₹318–618 | ₹605–1,180 | ₹7,315–10,190 | ₹12,040–17,790 |
| **Total — live today** | **₹788–853** | **₹1,042–1,342** | **₹1,329–1,904** | **₹8,039–10,914** | **₹12,764–18,514** |
| + Borzo pickup* | ₹3,000 | ₹3,000 | ₹3,000 | ₹3,000 | ₹3,000 |

\*Not live — ~₹40–60/delivery, ~₹3,000/mo at ~50 deliveries; scales with bookings, not MAU.

## Edge cases (real, code-grounded — not generic risk boilerplate)

| Scenario | Trigger | Cost/timeline impact |
|---|---|---|
| Max-photo donation | App allows up to 5 photos/donation vs ~2 modelled | Gemini calls per donation up to 2.5× modelled — ₹ impact tiny, real risk is hitting free-key rate limits, not cost |
| Admin bulk-upload burst | Up to 20 items in one commit, each with photos | Gemini + Firestore writes spike in seconds — provision a **billed** Gemini key before the first bulk run, not the free one |
| Abandoned donation | Donor's photos get analyzed (step 1) but they never submit (step 5) | Gemini/processing cost is incurred with **no live item created** — real leakage not visible in the MAU tables above |
| Single viral-traffic day | Press mention or spike concentrated in one day | Firestore's free tier resets **daily** (50K reads/day), not monthly — a spike day can exceed it even if the monthly average looks fine; tables above assume even spread |
| DLT PE rejected/resubmitted | Incomplete application on first pass | No extra cash cost, just delay beyond the 2–7 day estimate — affects only the non-Widget SMS path |
| FX movement on USD-billed lines | Firebase overage (if any) + future Cloud Run are USD-denominated | All ₹ figures here use today's rate (~₹95.4/$1); a rupee move shifts those lines only, not the INR-native ones (DLT, MSG91) |
| Vendor free-tier/pricing changes | Any of Brevo/MapTiler/Gemini/Firebase changes published rates | Every usage row in this doc shifts — recheck live pricing pages before renewal or ~6 months post-launch |

---

> **Year-one cash (besides usage):** ₹2,786 hosting + **₹5,900 DLT PE** (+ optional ₹1,770 MSG91 help) + Firebase Blaze usage (₹0 at modelled scale, no minimum) + **AI processing hosting (not yet priced — see open item)**. Email OTP and Widget phone OTP both launch without DLT; raw-template phone OTP needs DLT first.
>
> **Pilot ~₹790–850/mo** at 100 MAU (excl. AI processing) · **~₹12,800–18,500/mo** at 10,000 MAU.

*Full assumptions: `RELOVED_PRICING_FULL.md`. Confirm live rates before budget sign-off. GST as applicable.*
