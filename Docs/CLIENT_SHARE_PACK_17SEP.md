# Reloved — Client share pack (with recordings)

**Date:** 17 Sep 2026  
**Branch:** `client-handover`  
**How to share:** send this list + the video files below (or zip the folders).

---

## A. Primary pack — Sep 17 client / CEO Friday fixes

Use these first when sharing with the client.

| # | Client ask / bug fix | Status | Recording to share |
|---|---|---|---|
| 1 | **Time saved** metric accuracy (45 min × Reloved) | Done | `frontend/recordings/ceo-friday-fixes/RELOVED-Friday-Fixes.mp4` |
| 2 | **🔥 Kindness streak** indicator | Done | same video (caption FIX 1–2) |
| 3 | Replace **enhances** → **Items Reloved** | Done | same video |
| 4 | **Notifications:** remove location / delete — Open only | Done | same video (caption FIX 3) |
| 5 | **Weekly 3-item claim limit** (not monthly) — enforced + copy | Done (verified) | same video (caption FIX 4) + optional `ff-user-flows/TC19-weekly-limit.webm` |
| 6 | **Multi-photo gallery / swipe** on item detail | Done | **Dedicated:** `frontend/recordings/multi-photo-swipe/RELOVED-Multi-Photo-Swipe.mp4` |
| — | Black interface background | **Reverted** (not brand-confirmed; cream paper kept) | — |

### Share paths (copy/paste)

```
frontend/recordings/ceo-friday-fixes/RELOVED-Friday-Fixes.mp4
frontend/recordings/ceo-friday-fixes/CEO-SHARE.md

frontend/recordings/multi-photo-swipe/RELOVED-Multi-Photo-Swipe.mp4
frontend/recordings/multi-photo-swipe/SHARE.md
```

### Screenshots (optional extras)

| Shot | File |
|---|---|
| Home metrics | `ceo-friday-fixes/ceo-01-home-metrics.png` |
| Account profile / weekly | `ceo-friday-fixes/ceo-02-account-profile.png` |
| Notifications | `ceo-friday-fixes/ceo-03-notifications.png` |
| Weekly claim copy | `ceo-friday-fixes/ceo-04-weekly-copy.png` |
| Give multi-upload | `multi-photo-swipe/01-give-multi-upload.png` |
| Gallery 2/3 swipe | `multi-photo-swipe/02-gallery-arrows.png` |

---

## B. Also shipped (ops / logistics — mention in email, may not need video)

| Item | Status | Note |
|---|---|---|
| Borzo-only courier (Porter CTAs removed) | Done (code) | Setup steps: `Docs/RELOVED_Borzo_Setup.md` |
| Prepaid / no COD | Done (code) | `payment_method: balance` |
| First **500** rides Reloved-paid subsidy | Done (code) | Firestore `config/borzoSubsidy` |
| Borzo estimate / book / sync / cancel + webhook | Done (code) | Needs live Borzo token + wallet for ops QA |

---

## C. Supporting F&F recordings (optional if client wants deeper QA)

Only share if they ask for full Friends & Family proof.

| Topic | Recording |
|---|---|
| Claim lifecycle | `ff-categories/03-claim-lifecycle.webm` |
| Accept / decline / handover → Reloved | `ff-deep-qa/D03-accept-handover-received-reloved.webm` |
| Locality + claim prefs | `ff-deep-qa/D01-claimer-locality-pref-claim.webm` |
| Soft decline copy | `ff-deep-qa/D02-decline-reason-soft-copy-available.webm` |
| Kids size optional | `ff-deep-qa/D04-give-kids-size-optional-gemini.webm` |
| Support + privacy FAQ | `ff-deep-qa/D05-support-privacy-faq-limits.webm` |
| Mobile multi-upload | `ff-deep-qa/D07-mobile-multi-upload-ai.webm` |
| Weekly limit (standalone) | `ff-user-flows/TC19-weekly-limit.webm` |
| Location matching | `ff-categories/01-location-matching.webm` |
| Delivery privacy | `ff-categories/04-delivery-privacy.webm` |

Matrices: `ff-user-flows/MATRIX.md`, `ff-deep-qa/DEEP_QA_MATRIX.md`

---

## D. Suggested client message (short)

> Hi — sharing the Sep 17 Friday fix recordings:
>
> 1. **RELOVED-Friday-Fixes-CEO.webm** — Time saved, 🔥 streak, Items Reloved, notifications (no location/delete), weekly 3-claim limit  
> 2. **RELOVED-Multi-Photo-Swipe.webm** — One Item + 3 photos upload, then gallery arrows / swipe (`2/3 · swipe`)
>
> Black full-page background was **not** kept (cream paper / courtyard brand).  
> Borzo prepaid + first-500 Reloved cover is in code; live booking needs Borzo Business token + wallet top-up (setup doc attached if useful).

---

## E. Still open (don’t claim as done)

- QA-01…QA-04 / REL-01…REL-04 — release / share F&F build
- CEO-06 — full project doc + GST / credentials review (Partial)
- Live Borzo production token + wallet (ops)
- Call masking live wallet test (Partial)
