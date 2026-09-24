# Reloved email & SMS flows

Living map of transactional notifications: **when** they fire, **who** gets them, and which ops emails include **no-login action buttons**.

## Product rule (user SMS / email)

Keep user-facing lifecycle pings lean:

1. Item dropped → giver email  
2. Someone claims → claimer email + giver email + giver SMS  
3. Matched / scheduled → claimer match email; address-shared email to giver; schedule steps stay **in-app**  
4. Delivery initiated → giver email + SMS (rider dispatched) — or peer “handed over” email  
5. Delivery completed → claimer + giver emails (+ claimer SMS on courier path)

**Ops SMS removed.** Ops triage is **email only** (drop / claim / chat / contact still email Us + Sheetal with action links). Mid-stage “picked up / on the way” SMS+email removed.

OTP (email + SMS) stays for auth.

---

## Roles

| Role | Meaning |
|------|---------|
| **Giver** | Person who dropped clothes |
| **Claimer** | Person who requested an item |
| **Us (ops)** | `aniketgupta83003@gmail.com`, `totemistaken@gmail.com` |
| **Sheetal** | `sheetalahuja99@gmail.com` — same ops triage alerts as Us |

`ADMIN_NOTIFY_EMAIL` (env) is merged into ops To when set.

---

## Flow overview

```text
Drop → Wall live → ops email (Remove + Contact) + giver confirmation email
Claim → ops email (Decline + Contact) + claimer confirmation + giver email + giver SMS
Decision → claimer matched / soft-decline email
Schedule → in-app (+ address-shared email to giver)
Delivery start → giver rider email + SMS  |  peer: handed-over email
Delivery done → delivered / handover-success emails (+ claimer SMS on courier)
Reloved chat / contact / partner → ops email (no SMS)
```

---

## A. User-facing SMS (MSG91 Flow)

| When | To | Env |
|------|-----|-----|
| Claim submitted | Giver | `MSG91_TPL_ITEM_CLAIMED` |
| Rider dispatched | Giver | `MSG91_TPL_DELIVERY_RIDER_COMING` |
| Delivered | Claimer | `MSG91_TPL_DELIVERY_DELIVERED_CLAIMER` |
| Delivery failed | Giver or claimer | `MSG91_TPL_DELIVERY_FAILED` |
| Login OTP | User | `MSG91_SMS_TEMPLATE_ID` (OTP API) |

---

## B. User-facing email (Brevo)

| When | To | Function / template env |
|------|-----|-------------------------|
| Drop submitted | Giver | `sendDonationConfirmation` / `BREVO_DONATION_CONFIRMATION_TEMPLATE_ID` |
| Claim submitted | Claimer | `sendClaimConfirmation` / `BREVO_CLAIM_CONFIRMATION_TEMPLATE_ID` |
| Claim submitted | Giver | `sendItemClaimNotifyGiver` / `BREVO_ITEM_CLAIM_GIVER_TEMPLATE_ID` |
| Claim accept / decline | Claimer | `sendClaimDecision` / `BREVO_CLAIM_DECISION_*` / `BREVO_CLAIM_DECLINE_*` |
| Address shared | Giver | `sendDeliveryDetailsToGiver` / `BREVO_DELIVERY_DETAILS_GIVER_TEMPLATE_ID` |
| Rider dispatched | Giver | `sendDeliveryRiderDispatchedToGiver` / `BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID` |
| Delivered (courier) | Claimer + giver | `sendDeliveryDeliveredTo*` / `BREVO_DELIVERY_DELIVERED_*` |
| Handed over (peer) | Claimer | `sendReloveDeliveredToClaimer` / `BREVO_RELOVE_DELIVERED_CLAIMER_TEMPLATE_ID` |
| Received (both confirmed) | Claimer + giver | `sendHandoverSuccessTo*` / `BREVO_HANDOVER_SUCCESS_*` |
| Delivery failed | Party | `sendDeliveryFailedNotice` / `BREVO_DELIVERY_FAILED_TEMPLATE_ID` |
| Claim cancelled | Giver | `sendClaimCancelledToGiver` / `BREVO_CLAIM_CANCELLED_GIVER_TEMPLATE_ID` |
| Welcome / waitlist / partner / chat / OTP | User | respective `BREVO_*` (outside core drop→delivery lifecycle) |

---

## C. Ops triage — Us + Sheetal (email only)

| When | Recipients | Action buttons (no admin login) |
|------|------------|----------------------------------|
| Drop auto-published | Us + Sheetal | **Remove from Wall**, **Contact user** |
| New claim | Us + Sheetal | **Decline request**, **Contact user** |
| Reloved chat needs human | Us + Sheetal | **Contact user** |
| Website contact form | Us + Sheetal | **Contact user** |
| Partner application | Us + Sheetal | Notify only (open admin) |

Signed links hit `GET /api/ops/drop-action?t=…` (HMAC, 7-day TTL).

---

## Code entry points

| Email / SMS | Function | Trigger |
|-------------|----------|---------|
| Drop ops | `sendDonationAdminAlert` | `publicWrite` donations |
| Drop giver | `sendDonationConfirmation` | same |
| Claim ops | `sendClaimAdminAlert` | `donor` item-requests |
| Claim claimer | `sendClaimConfirmation` | same |
| Claim giver | `sendItemClaimNotifyGiver` + `smsItemClaimedToGiver` | same |
| Claim decision | `sendClaimDecision` | admin / matchFlow / ops Decline |
| Delivery stages | `admin.applyDeliveryStatusUpdate` | rider / delivered / failed only |
| Handover success | `sendHandoverSuccessTo*` | matchFlow Received |

Implementation: `src/lib/notifications.ts`, `src/lib/msg91Sms.ts`, actions: `src/lib/dropEmailActions.ts` + `src/routes/opsActions.ts`.
