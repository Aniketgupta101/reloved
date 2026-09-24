# 24/09 | Aniket Gupta
## Today's Priorities & Updates - Reloved

### Test links (hard-refresh / clear cache)
- **Primary test:** https://test.reloved.digital
- **Firebase mirror:** https://reloved-digital.web.app
- Login to check Google button: `/login`

---

### 1. SMS & Email
- Trimmed notification noise: ops SMS removed; mid-stage rider “picked up / on the way” email+SMS removed.
- Kept lean user matrix (drop confirm, claim, match, delivery start/done/fail).
- Verified core Brevo transactional templates against live account.
- MSG91 SMS wiring reviewed for quieter live sends.

### 2. Shadowfax360 / logistics
- Shadowfax + Shiprocket client libs and admin/order surfaces in codebase for follow-up with Shadowfax360 payment-flow feedback (pending their response).

### 3. Mobile UI — tested & fixed
- Google login: logo restored + shorter **Continue with Google** label; text no longer flush to button edge.
- Claim “Request Sent” modal: stacked CTAs, no overflow on narrow phones.
- Schedule / share-availability CTA: shorter mobile label, stays inside panel.
- Shared Button: tighter padding / wrap so long labels stay inside.
- Giving history: Open-only list behavior; Edit hidden once matched/claimed/reloved/pending.
- Login card / Give flows: tighter mobile padding.

### 4. Claimed items & Wall of Kindness
- Batch 0 (closet seed): kept **Claimed** + still **visible** on Wall; Claim disabled.
- Wall status/visibility synced through claim → Being Matched → Claimed → Reloved.
- **Available** stamp restored on free items.
- Batch 1 / Batch 2 visibility checked (claimed can stay visible with Claimed tag).
- Pink Corduroy Jacket unclaimed → Available when requested.
- H&M chino cutout: white background fix for claimed card.
- Reject drops with **no photos** (was causing invisible Wall items).
- Removed Massimo Dutti test shirt from Wall.
- Profile notifications: fan-out across identities + **collapse to one card per claim/thread** (latest step wins).

### 5. Sheetal / ops email
- Confirmed Sheetal is **ops email only** (not admin login); inbox audit for today.
- Em-dashes stripped from email subjects + code fallbacks; Brevo templates 4 & 27 updated.
- Sent 14 giver+claimer user-flow test emails to `sheetalahuja99@gmail.com` (30s gaps).
- Real email screenshots saved under `Docs/sheetal-email-ss/screenshots/`.
- All Sheetal Wall items location standardized to **Bandra West, Mumbai**.

### 6. Deployed today
- Frontend + functions to Firebase Hosting (`reloved-digital.web.app`).
- Same frontend build uploaded to cPanel for `test.reloved.digital`.
- Full done-checklist: `Docs/TODO_DONE_2026-09-24.md`.

### Suggested retest checklist
1. Mobile `/login` — Google logo + padded button.
2. Drop with photos → appears on Wall; drop without photos → rejected.
3. Claim → Wall shows Being Matched / Claimed; Claim button disabled when claimed.
4. Profile notifications — one card per claim thread, updates to latest stage.
5. Giving history — Edit gone after match; Open list only for open gifts.
6. Claim modal + schedule panel — no text overflow on phone widths.
