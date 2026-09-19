# Reloved Digital — User SMS status (verified)

**Scope:** User (Giver / Claimer) SMS only — **no ops / Sheetal SMS**  
**Audit date:** 19 Sep 2026 (verified twice against repo + local env; STPL/MSG91 portal status only from screenshots you shared today)  
**Header:** `RELOVD` · **PE Entity ID (from STPL Profile screenshot):** `1701178826229506096`

### How to read this doc

| Label | Meaning |
|-------|---------|
| **DONE** | Confirmed in code and/or local env, or confirmed by your STPL/MSG91 screenshot |
| **NOT DONE** | Confirmed absent in code/env, or failed in your MSG91 screenshot |
| **UNKNOWN** | Cannot verify from this machine (needs portal check or live prod test) |

We do **not** mark something DONE unless verified. Estimates below are only for **NOT DONE** engineering/QA work.

---

## 1. What is DONE (verified)

### A. Code — email (not SMS)

| Item | Evidence |
|------|----------|
| Claim → giver email function exists | `sendItemClaimNotifyGiver` in `notifications.ts`; called from `donor.ts` |
| Claim → claimer email | `sendClaimConfirmation` |
| Match decision email | `sendClaimDecision` from `matchFlow.ts` / `admin.ts` / `opsActions.ts` |
| Delivery stage emails | `advanceDeliveryStageAndNotify` in `admin.ts` calls rider / picked up / delivered / failed email senders |
| Brevo delivery + claim-giver template IDs set (local functions env) | `.env.reloved-digital` has `BREVO_ITEM_CLAIM_GIVER_TEMPLATE_ID` and all `BREVO_DELIVERY_*` IDs **SET** (non-empty); `BREVO_API_KEY` **SET** |

**Caveat:** Live “email arrives in Gmail” was **not** re-tested in this audit. Code + env IDs = implemented. Prod inbox delivery = **UNKNOWN** without a live send test.

### B. Code — in-app (partial)

| Item | Evidence |
|------|----------|
| Claim / match in-app pushes | `pushUserNotification` in `donor.ts` and `matchFlow.ts` |
| Delivery-stage in-app | **NOT DONE** — `advanceDeliveryStageAndNotify` only sends **email**, no `pushUserNotification` for rider/on-the-way/delivered/failed |

### C. Code — OTP plumbing

| Item | Evidence |
|------|----------|
| Server can call MSG91 OTP API | `sendOtpSms` in `otp.ts` → `https://control.msg91.com/api/v5/otp` |
| Passes `template_id` **if** env set | `if (templateId) payload.template_id = templateId` |
| `MSG91_AUTH_KEY` in local functions env | **SET** |
| MSG91 widget helper in frontend | `msg91Widget.ts` + used by `DonorLogin.tsx` / `DonorDashboard.tsx` |

### D. STPL (from your screenshots only)

| Item | Evidence |
|------|----------|
| `RELOVED_OTP_LOGIN` **Active** | Your STPL Template details modal: Template Id `1777178963509485562`, Header `RELOVD`, Global Status Active |
| Several user templates submitted | Your STPL list: WIP for Failed / Delivered / On the way / Rider coming / Item claimed |

---

## 2. What is NOT DONE (verified)

### A. Product / lifecycle SMS in the app

| Item | Evidence |
|------|----------|
| Any `sendMsg91` / lifecycle SMS helper | **No matches** in `functions/src` |
| SMS on claim / match / delivery | **No code** — only Brevo email at those hooks |
| Env vars for product SMS template IDs | **None** in `.env.reloved-digital` |

### B. Reloved Digital OTP body on MSG91 → Reloved login

| Item | Evidence |
|------|----------|
| `MSG91_SMS_TEMPLATE_ID` in local functions env | **MISSING / not set** (only `MSG91_AUTH_KEY` + `OTP_VENDOR_FALLBACK_LOG` under MSG91/OTP keys) |
| `VITE_MSG91_WIDGET_ID` / `VITE_MSG91_WIDGET_TOKEN` in local `frontend/.env` | **NOT PRESENT** — so `msg91WidgetConfigured` is **false** in local frontend config |
| MSG91 OTP template DLT send working | Your Logs screenshot: **Failed** — *“DLT Entity Id not matched with Header (Sender Id) on DLT”* |
| MSG91 template status | Your Templates screenshot: **Failed** + Re-verify on `RELOVED_OTP_LOGIN` / id `6aaea1b06f6505878a0bc392` |

### C. STPL (from your screenshots)

| Item | Status |
|------|--------|
| WIP templates → **Active** | **NOT DONE** — still “Work In Progress” |
| `RELOVED_CLAIM_MATCHED` on STPL list | **UNKNOWN** — not visible in the WIP screenshot you shared (OTP + 5 others). Confirm on portal. |

### D. Delivery in-app SMS/push

| Item | Status |
|------|--------|
| SMS for delivery stages | **NOT DONE** |
| In-app for delivery stages | **NOT DONE** (email only) |

---

## 3. What depends on vendors (not engineering)

| Vendor | What we need | Blocks | Status |
|--------|--------------|--------|--------|
| **STPL** | Approve WIP templates → Active | Mapping + product SMS go-live | Waiting (WIP) |
| **STPL** | Entity/header relationship for `RELOVD` if they reject again | Resubmit cycle | OTP Active; others pending |
| **MSG91** | Entity ID `1701178826229506096` correctly linked to Sender `RELOVD` + PE–TM Active | Test DLT / Re-verify | **Broken today** (your Failed log) |
| **MSG91** | After fix: Verified template + widget bind | Branded OTP SMS | Not done |

Engineering **cannot** mark OTP DLT or STPL Active as done — those are portal/vendor.

---

## 4. Remaining work — effort (only NOT DONE items)

| # | Work | Vendor gate? | Eng days | QA days |
|---|------|--------------|----------|---------|
| **A** | Fix MSG91 Entity ID / PE–TM / Sender `RELOVD` until Test DLT **Delivered** | Yes — MSG91/STPL | 0.5 | 0.5 |
| **B** | Set `MSG91_SMS_TEMPLATE_ID`, bind widget (and add `VITE_MSG91_*` to the **deployed** frontend build if missing), redeploy, prove Reloved OTP SMS text | Yes — needs A | 0.5 | 0.5 |
| **C** | STPL: WIP → Active (ops follow-up / email Diksha) | Yes — STPL | 0* | 0* |
| **D** | Confirm or submit `RELOVED_CLAIM_MATCHED` on STPL | Yes — STPL | 0.25 | 0 |
| **E** | Map each Active STPL template in MSG91 + Test DLT each | Yes — needs C | 1.0 | 0.5 |
| **F** | Build `sendMsg91TemplateSms` + env keys for 6 product templates | No code gate; needs E IDs to go live | 1.0 | 0.5 |
| **G** | Wire SMS at claim / match / `advanceDeliveryStageAndNotify` | Needs F | 1.0 | 1.0 |
| **H** | E2E QA real Indian numbers | Soft — SMS credits | 0 | 1.0 |

\*STPL approval = calendar wait (often 1–5 business days), not eng coding days.

| Total | Days |
|-------|------|
| **Engineering** | **~4.25** |
| **QA** | **~4.0** |
| **Critical path** | A→B can finish OTP branding first; C→E→F→G→H for product SMS. Calendar often **1–1.5+ weeks** if STPL is slow. |

---

## 5. Explicit “do not claim”

Do **not** tell stakeholders any of these are done:

1. Product SMS (claim / match / delivery) — **no code**  
2. MSG91 Reloved OTP DLT send — **Failed** in your logs  
3. Frontend MSG91 widget in **this** `frontend/.env` — **not configured**  
4. `MSG91_SMS_TEMPLATE_ID` — **not set** locally  
5. STPL WIP templates — **not Active** yet  
6. Delivery in-app notifications — **not implemented**

---

## 6. What we could not verify from this machine

| Item | Why UNKNOWN |
|------|-------------|
| Production Hosting build has `VITE_MSG91_*` | Not in local `.env`; would need Firebase Hosting env / built JS check |
| Production Functions secrets match local `.env.reloved-digital` | Deploy secrets not inspected |
| Live Brevo emails arriving | No live send in this audit |
| Exact STPL list includes Claim Matched | Not in your last WIP screenshot |
| PE–TM Active on MSG91 right now | No fresh portal screenshot after Entity fix attempt |

---

## Appendix — Target templates (copy for STPL; not “done”)

| Template | To | When |
|----------|----|------|
| `RELOVED_OTP_LOGIN` | User | Login — **STPL Active**; MSG91 send **not working** yet |
| `RELOVED_ITEM_CLAIMED` | Giver | Claim — STPL WIP |
| `RELOVED_CLAIM_MATCHED` | Claimer | Match — submit/confirm on STPL |
| `RELOVED_DELIVERY_RIDER_COMING` | Giver | Rider — STPL WIP |
| `RELOVED_DELIVERY_ON_THE_WAY` | Claimer | Picked up — STPL WIP |
| `RELOVED_DELIVERY_DELIVERED_CLAIMER` | Claimer | Delivered — STPL WIP |
| `RELOVED_DELIVERY_FAILED` | Giver/Claimer | Failed — STPL WIP |

### Bodies (for STPL / MSG91 registration only)

**OTP (STPL Active)**  
`Your Reloved Digital verification code is {#num#}. Valid for 10 minutes. Do not share this OTP with anyone.`  
`- Reloved Digital`

**ITEM_CLAIMED**  
`Hi {#var#}, someone wants your Reloved Digital item {#var#}. Open your account to accept or decline.`  
`- Reloved Digital`

**CLAIM_MATCHED**  
`Hi {#var#}, you are matched for {#var#} on Reloved Digital. Next step is delivery — check your account.`  
`- Reloved Digital`

**RIDER_COMING**  
`Hi {#var#}, a Reloved Digital rider is coming for {#var#}. Bag it and leave it with building gate security now.`  
`- Reloved Digital`

**ON_THE_WAY**  
`Hi {#var#}, your Reloved Digital item {#var#} has been picked up and is on the way to you.`  
`- Reloved Digital`

**DELIVERED_CLAIMER**  
`Hi {#var#}, {#var#} has been delivered. Enjoy — thanks for choosing Reloved Digital.`  
`- Reloved Digital`

**FAILED**  
`Hi {#var#}, delivery of {#var#} could not be completed. Reloved Digital will contact you to reschedule.`  
`- Reloved Digital`
