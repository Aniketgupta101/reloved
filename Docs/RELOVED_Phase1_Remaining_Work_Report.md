# reloved · Phase 1 remaining work report

**Prepared for:** Totem Interactive (internal) / reloved project leadership  
**Date:** 8 September 2026  
**Live site:** https://reloved-digital.web.app  
**SOW reference:** Phase 1 Scope of Work, 12 August 2026 (Sheetal Ahuja signature on the two-page SOW in this repo)

---

## How to read this document

This report answers three questions:

1. What did the **signed Phase 1 SOW** actually include?
2. What is **done vs remaining**, realistically?
3. When did work **start and stop**, from GitHub and Cursor logs?

**Important:** The signed Phase 1 SOW **does not contain a developer-day total**. It states that the commercial proposal is issued separately after scope approval. There is **no exact day count in the signed PDF** available in this repository (`Docs/Re loved Scope_of_Work.pdf`). A file named `Scope_of_Work SIGNED.pdf` was not found in the repo; the signed two-page SOW above is what was used.

---

## 1. Signed SOW — what Phase 1 promised

### Engagement objective

Design and launch the Phase 1 reloved digital experience: a premium Digital Wall of Kindness with working donor intake, partner enquiries, pilot records, and launch-ready communications.

### Approval gates

| Target | Accepted outcome |
|---|---|
| 14–15 August 2026 | Branding and logo options presented for approval |
| 20 August 2026 | Website live on the **main domain**, with email/verification, core launch journeys, initial inventory capability, technical SEO/indexing, and basic analytics |

### Phase 1 complete when

- Agreed brand is applied
- Core journeys work end to end
- Site is live on the **main domain**
- Email / verification are active
- Initial inventory can be managed
- Basic SEO / analytics are configured

### Workstreams in scope

| Workstream | Included in Phase 1 |
|---|---|
| Brand & Design | Logo options and final lockup; colours, typography; premium fashion/graffiti visual system; responsive website UI; core launch artwork |
| Public Website | Interactive landing, Digital Wall of Kindness, item pages, donor benefits, Wall of Love, map/local discovery, Our Story, key policy/contact pages |
| Give + Partner Journeys | Photo-first Give flow, partner/contact forms, confirmation/tracking, image uploads, success/error states |
| Verification + Email | OTP via a third-party provider; transactional email for submissions, enquiries, confirmations, status updates |
| Pilot Operations | Database-backed inventory; minimum internal tools to review, organise, **match**, and record completed donations |
| Launch, SEO + Analytics | Main-domain deployment, email setup, responsive/browser QA, Search Console, sitemap/indexing, metadata, basic traffic/conversion analytics |

### Explicitly out of Phase 1 (SOW §4)

- Daily operations, physical logistics/distribution, NGO/ashram acquisition, social posting, ongoing content, paid marketing
- Legal trademark filing and physical print/vinyl
- Third-party service charges (domain, hosting, OTP, email, mapping, storage) billed separately
- Material additions after approval — to be quoted before execution

**Client inputs still required by the SOW:** timely approvals; ~50-item inventory; partner path (ashram leads / at least one distribution partner); domain/DNS and account access; one operating owner.

---

## 2. Status vs SOW (as of 8 September 2026)

| Workstream | Status | Remaining |
|---|---|---|
| Brand & Design | **Done** | Client polish only. Logo, colours, T&C/Privacy copy already iterated after handover. |
| Public Website | **Done** | Home, Wall, item pages, Wall of Love, map, Our Story, policies, contact. |
| Give + Partner Journeys | **Done** | Photo-first Give (AI assist), Claim, partner/contact forms, tracking, uploads. |
| Verification + Email | **Done, with SMS caveat** | OTP + transactional email live. Production SMS **DLT registration** still client-side. |
| Pilot Operations | **Mostly done** | Admin can review, approve, decline. **Matching a donation to a named NGO/partner is not built.** |
| Launch, SEO + Analytics | **Mostly done** | Live at Firebase Hosting. **`reloved.digital` is not yet the production app** (DNS / GoDaddy vs Firebase). |

### Extra shipped beyond the original SOW (from 31 Aug handover)

- Google Sign-In
- Unified account across email/phone
- FAQ + AI-answer structured content
- On-site help widget
- Faster admin photo suggestions
- Follow-up emails on approve/decline

### Not Phase 1 (recent client request)

Borzo auto-book from Maps building, gate-only pickup privacy popup, rider/donor automated messages, masked calling (Twilio India / Exotel). Physical logistics are **client-led / separate scope** in the SOW.

---

## 3. Timeline — started and stopped

### Contract calendar

| Date | Event |
|---|---|
| 12 Aug 2026 | Phase 1 SOW signed (Sheetal Ahuja) |
| 14–15 Aug 2026 | Branding approval target |
| 20 Aug 2026 | “Live on main domain” target |

### GitHub (this clone: `Aniketgupta101/reloved`)

- **First commit:** 21 August 2026  
- **Last commit:** 3 September 2026  
- **Total commits (all branches on this clone):** 28  

**Days with commits (10):**

21, 22, 24, 26, 27, 29, 31 August · 1, 2, 3 September 2026

**Days with no commits in that window:** 23, 25, 28, 30 August · **4–7 September** (and no commit yet on 8 September)

### Cursor agent transcripts (this workspace) — rebuilt 9 Sep 2026 from logs

- **Source:** 406 timestamped user messages in agent transcripts  
- **First session:** 19 August 2026, 19:53 IST  
- **Active Cursor days (15):** 19, 20, 21, 22, 24, **25**, 26, 27, 29, 31 August · 1, 2, 3, 8, 9 September  
- **Last heavy build day:** 3 September 2026 (12:11–12:52 IST)  
- **Off / no Cursor in window (7):** 23, 28, 30 August · **4–7 September**  
- **Resumed:** 8–9 September 2026 (DLT / launch vs Phase 2 planning)

**Interpretation:** **15 active Cursor days** (not 4). The old “4” referred only to pause days (4–7 Sep) or a partial off-day count. Git starts two days later than Cursor (21 Aug), which is normal if early work was committed later. Day-by-day CSV: `Docs/RELOVED_Tab3_Days_Worked.csv`.

---

## 4. Remaining work — realistic developer days

These are **Totem build days**, not calendar days. Client DNS, DLT, inventory, and vendor accounts are additional elapsed time.

### A. Still inside Phase 1 SOW (to close the document honestly)

| Item | Owner | Realistic Totem days | Notes |
|---|---|---|---|
| Point `reloved.digital` at Firebase Hosting | Client DNS + Totem | **0.5–1** | SOW “main domain” gap |
| Confirm ~50 wall items live | Client + Totem | **0–0.5** | Seed/help only if asked |
| Partner matching (donation → NGO handoff) | Totem | **5–8** | Named in SOW (“match and close”) |
| DLT / production SMS header | Client (TRAI) | **0 build** | App already has OTP fallback; DLT is days–weeks of process |

**Close Phase 1 without NGO matching:** about **1–2 developer days** (domain + inventory check).  
**Close Phase 1 as written (including match):** about **6–10 developer days**.

### B. New / Phase 2 (quote separately — not leftover Phase 1)

| Item | Realistic Totem days |
|---|---|
| Privacy popup (no flat/wing; bag + security) | **0.5–1** |
| Borzo deep-link + Maps building autofill + rider note + donor SMS | **5–8** (needs Borzo business account) |
| Hidden numbers (Twilio India / Exotel + 3-digit patch-through) | **3–5** plus vendor KYC |

**If the client wants Borzo + masked calling now, on top of remaining SOW:** about **12–20 developer days** total, not a same-day add-on.

---

## 5. Bottom line

1. **Exact SOW developer days:** not in the signed PDF.  
2. **Implied launch window in the SOW:** 12 → 20 August (~**8 calendar days** to the live-on-domain gate).  
3. **What actually happened:** Cursor logs show **15 active days** (19 Aug → 9 Sep, with pause 4–7 Sep); **10 git commit days** / 28 commits (21 Aug → 3 Sep).  
4. **Product:** Phase 1 journeys are **live on Firebase**. Remaining SOW wording gaps: **custom domain**, **NGO match workflow**, **client inventory / partners / DLT**.  
5. **Borzo + masked calls:** extra scope.

---

## 6. Live URLs

| What | URL | Status |
|---|---|---|
| Production app | https://reloved-digital.web.app | Live |
| Registered domain | https://reloved.digital | Registered; not fully the production app |
| API | https://asia-south1-reloved-digital.cloudfunctions.net/api | Live (backend) |

---

*reloved × Totem Interactive · Confidential · 8 September 2026*  
*Sources: signed Phase 1 SOW (12 Aug 2026); Docs/HANDOVER.md (31 Aug 2026); git log on this clone; Cursor agent-transcript timestamps in this workspace.*
