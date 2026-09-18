# Reloved — Overview Product Test Cases

**Purpose:** High-level cases covering the whole product for F&F / release QA.  
**Level:** Overview (journeys + critical rules) — not deep UI step scripts.  
**Pass rule:** Each case has clear expected result; mark Pass / Fail / Blocked.

| Priority | Meaning |
|---|---|
| P0 | Must pass before Friends & Family share |
| P1 | Should pass before wider pilot |
| P2 | Nice / observe |

---

## A. Auth & Identity

| ID | Priority | Case | Steps (overview) | Expected |
|---|---|---|---|---|
| OV-01 | P0 | New user — phone OTP login | Open Account → enter mobile → OTP → session | Logged in; onboarding if new |
| OV-02 | P0 | New user — email OTP login | Enter email → OTP → session | Logged in; same as phone path |
| OV-03 | P0 | Google sign-in | Sign in with Google (verified email) | Session created; lands on existing profile if email already linked |
| OV-04 | P0 | Onboarding once | Complete name, username, gender, phone, building/landmark | Profile saved; Wall reachable; not asked again |
| OV-05 | P0 | Same person — email or phone | Login with email then later with same phone (same account) | Same profile / account shown |
| OV-06 | P0 | Phone uniqueness | Account B tries to save phone already used by Account A | Error: *"This number already exists. Use another number for further process."* |
| OV-07 | P0 | Second Google email + same phone | Google email-2 onboards with phone already on email-1 account | Lands on **first** account; email-2 linked; no duplicate profile |
| OV-08 | P0 | Email uniqueness | Try to attach an email already on another account | Blocked with clear unique-email error |
| OV-09 | P1 | Logout / re-login | Logout → login again | Session cleared then restored cleanly |

---

## B. Give (Giver journey)

| ID | Priority | Case | Steps (overview) | Expected |
|---|---|---|---|---|
| OV-10 | P0 | Create listing — photos | Give → add multiple photos → continue | Photos accepted; AI/analyze does not hard-block |
| OV-11 | P0 | Kids / Boys / Girls fields | Select kids/boys/girls | Age band used; size **not** forced |
| OV-12 | P0 | Adult size where needed | Men/Women clothing needing size | Size available/required as designed |
| OV-13 | P0 | Delivery preference | Choose collect / giver sends / courier | Preference saved and shown later to claimer |
| OV-14 | P0 | Locality privacy on Give | Enter building/landmark (no flat) | Public listing shows broad locality only |
| OV-15 | P0 | Submit for QC | Submit listing | Pending review; appears in giver Giving tab |
| OV-16 | P1 | Remove incomplete listing | Delete own unfinished / rejected listing | Listing removed; matched items cannot be deleted |
| OV-17 | P1 | Sensitive photo warn (not block) | Upload sensitive-looking photo | Warning shown; Give still allowed |
| OV-18 | P1 | Mobile gallery upload | Mobile: pick several gallery photos | Upload succeeds without quota crash |

---

## C. Admin QC

| ID | Priority | Case | Steps (overview) | Expected |
|---|---|---|---|---|
| OV-19 | P0 | Admin approve donation | Admin opens pending → Approve | Item goes live on Wall (Available); giver notified |
| OV-20 | P0 | Admin reject donation | Admin rejects with reason | Giver notified; item not on Wall |
| OV-21 | P1 | Admin branding / nav | Open admin shell | Reloved branding; key queues usable |

---

## D. Wall & Discovery

| ID | Priority | Case | Steps (overview) | Expected |
|---|---|---|---|---|
| OV-22 | P0 | Wall loads inventory | Open Drop / Wall | Live items with photos; statuses Available / Claimed / Reloved |
| OV-23 | P0 | Nearby-first (~3 km) | Logged-in user with location; giver-sends items | In-radius items prioritized where applicable |
| OV-24 | P0 | Public locality only | Inspect card + detail | Area/neighbourhood only — **no flat / exact address** |
| OV-25 | P0 | Map reflects inventory | Open kindness map | Pins by locality; no exact addresses |
| OV-26 | P0 | Item detail | Open any Available item | Photos swipe/browse; claim CTA; delivery preference visible |
| OV-27 | P0 | Cannot claim own item | Giver opens their own live listing | CTA blocked: *This is your listing* / API rejects self-claim |
| OV-28 | P1 | Filters / categories | Filter gender/category | Results update without crash |
| OV-29 | P1 | No junk test listings | Scan Wall titles | No ASASAS / Tempmail / UAT demo titles |

---

## E. Claim lifecycle

| ID | Priority | Case | Steps (overview) | Expected |
|---|---|---|---|---|
| OV-30 | P0 | Claim Available item | Claimer claims | Status → Being Matched / Claimed; giver notified |
| OV-31 | P0 | Weekly 3-claim limit | Claimer already at 3 this week | Claim blocked; counter shown (x/3) |
| OV-32 | P0 | Giver Accept | Giver Accepts claim | Matched; claimer soft success copy |
| OV-33 | P0 | Giver Decline + reason | Decline with reason (e.g. too far) | Soft “Couldn't match” to claimer — **never Rejected**; item Available again |
| OV-34 | P0 | Second claimer after decline | User B claims same item | New claim works |
| OV-35 | P0 | Out-of-zone giver-sends | Claim outside ~3 km on giver-sends | Blocked or soft distance messaging as designed |
| OV-36 | P0 | Status consistency | Check Wall, detail, account, admin | Available / Claimed / Reloved vocabulary consistent |

---

## F. Match → Handover → Reloved

| ID | Priority | Case | Steps (overview) | Expected |
|---|---|---|---|---|
| OV-37 | P0 | Platform chat primary | After match open chat | In-app thread works; no personal phone forced in chrome |
| OV-38 | P0 | Exact address only when needed | After Accept / delivery path | Exact address not on public Wall; handover path can collect building |
| OV-39 | P0 | Direct handover | Giver taps Handed Over → claimer Received | Stages update; ends Reloved |
| OV-40 | P0 | Courier prepaid / no COD | Open Borzo path / FAQ | Prepaid only; no COD language + booking path |
| OV-41 | P1 | Giver/claimer courier book | Book courier where supported | Order created or clear wallet/ops error |
| OV-42 | P1 | Email on critical events | Claim / Accept / Decline / handover | Email arrives (Brevo); soft decline copy |
| OV-43 | P1 | In-app notifications | Trigger claim / match | Notification list updates |

---

## G. Privacy & Safety

| ID | Priority | Case | Steps (overview) | Expected |
|---|---|---|---|---|
| OV-44 | P0 | Peer chat PII scrub | Try send phone/email/flat in peer chat | Blocked or scrubbed with soft warning |
| OV-45 | P0 | Reloved support / ops chat | Support thread | Presets allowed; escalation path works |
| OV-46 | P1 | Privacy / Terms wording | Open Privacy & Terms | Authenticity / no-guarantee platform wording present |
| OV-47 | P1 | Masked calling | Admin / ops initiate masked call | Reloved number shown; both sides connect (ops) |

---

## H. Support

| ID | Priority | Case | Steps (overview) | Expected |
|---|---|---|---|---|
| OV-48 | P0 | Preset support questions | Open help FAB | Preset Qs only — not open AI chatbot |
| OV-49 | P0 | Human escalation | Escalate unanswered question | Email reaches support/admin |

---

## I. Account & Surfaces

| ID | Priority | Case | Steps (overview) | Expected |
|---|---|---|---|---|
| OV-50 | P0 | Giver dashboard | Account → Giving / claims on my items | Correct statuses + actions |
| OV-51 | P0 | Claimer dashboard | Account → my claims | Pending / Matched / Reloved visible |
| OV-52 | P1 | Home metrics | Home/account stats | Time saved / streak / Reloved cards sensible |
| OV-53 | P1 | Mobile + desktop smoke | Wall, Give, Account on mobile & desktop | Usable; no layout crash |

---

## J. Full E2E smoke (run last)

| ID | Priority | Case | Covers | Expected |
|---|---|---|---|---|
| OV-54 | P0 | **Giver full path** | Login → Give → QC approve → Receive claim → Accept → Handover | Completes to Reloved |
| OV-55 | P0 | **Claimer full path** | Login → Wall → Claim → Match → Chat → Received | Completes to Reloved |
| OV-56 | P0 | **Decline path** | Claim → Decline → soft message → item Available → new claimer | Soft copy; no harsh rejection |
| OV-57 | P0 | **Self-claim blocked** | Same user tries to claim own drop | Blocked UI + API |
| OV-58 | P1 | **Regression gate** | Re-run OV-22, OV-27, OV-30–34, OV-39, OV-48 | Zero P0 fails |

---

## Suggested run order (½ day)

1. **Auth** OV-01 → OV-08  
2. **Give + Admin** OV-10 → OV-20  
3. **Wall** OV-22 → OV-27  
4. **Happy claim** OV-30 → OV-32 → OV-37 → OV-39  
5. **Decline** OV-33 → OV-34  
6. **Privacy / Support** OV-44, OV-48, OV-49  
7. **E2E** OV-54 → OV-57  

---

## Results log (fill during run)

| ID | Result | Tester | Date | Notes |
|---|---|---|---|---|
| OV-01 | | | | |
| OV-02 | | | | |
| … | | | | |

*(Copy table or mark inline Pass/Fail/Blocked.)*

---

## Out of scope (Phase 2 — observe only)

- Auto Borzo status sync without Handed Over tap  
- Full returns / no-show engine  
- Permanent delivery subsidy rules  
- Native app / SEO / advanced ops console  
