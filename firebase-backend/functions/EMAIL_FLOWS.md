# Reloved email & SMS flows

Living map of transactional notifications: **when** they fire, **who** gets them, and which ops emails include **no-login action buttons**.

## Product 8-step flow (must trigger)

| # | Message | To | Email | SMS env |
|---|---------|-----|-------|---------|
| 1 | Verification OTP | User | Brevo OTP / relay | `MSG91_SMS_TEMPLATE_ID` |
| 2 | Somebody claimed your item | Donor | `sendItemClaimNotifyGiver` | `MSG91_TPL_ITEM_CLAIMED` |
| 3 | You’ve been matched / claim approved | Claimer | `sendClaimDecision` (giver **and** admin Accept) | `MSG91_TPL_CLAIM_MATCHED` |
| 4 | Delivery ready — be ready with your item | Dropper | `sendDeliveryReadyToGiver` (on `schedule_agreed`) | `MSG91_TPL_DELIVERY_READY_GIVER` |
| 5 | Date & time set — modify/cancel in account | Both | `sendScheduleSetEmail` (on `schedule_agreed`) | `MSG91_TPL_SCHEDULE_SET` |
| 6 | Order dispatched | Giver + claimer | Giver: `sendDeliveryRiderDispatchedToGiver` · Claimer: `sendOrderDispatchedToClaimer` | Giver: `MSG91_TPL_DELIVERY_RIDER_COMING` · Claimer: `MSG91_TPL_ORDER_DISPATCHED_CLAIMER` |
| 7 | Order delivered | Claimer (+ giver email) | `sendDeliveryDeliveredTo*` | `MSG91_TPL_DELIVERY_DELIVERED_CLAIMER` |
| 8 | Thank you / feedback | Claimer | `sendHandoverSuccessToClaimer` | `MSG91_TPL_FEEDBACK_THANKS` |

Emails use Brevo template IDs when set; otherwise HTML/text fallbacks still send.

### MSG91 SMS live vs pending (Sep 2026)

MSG91 **#401 = Flow Not Yet Approved**, **#400 = bad/archived template id**. Flow API can return `type:success` and still fail downstream — check MSG91 → SMS → Templates → Active.

| Env | Live? |
|-----|-------|
| `MSG91_TPL_ITEM_CLAIMED` | **Yes** (Active) |
| `MSG91_TPL_DELIVERY_RIDER_COMING` | **Yes** |
| `MSG91_TPL_ORDER_DISPATCHED_CLAIMER` | **Yes** (`RELOVED_DELIVERY_ON_THE_WAY`) |
| `MSG91_TPL_DELIVERY_DELIVERED_CLAIMER` | **Yes** |
| `MSG91_TPL_DELIVERY_FAILED` | **Yes** |
| `MSG91_TPL_CLAIM_MATCHED` | **No** — approve Flow in MSG91 first |
| `MSG91_TPL_DELIVERY_READY_GIVER` | **No** — approve Flow in MSG91 first |
| `MSG91_TPL_SCHEDULE_SET` | **No** — approve Flow in MSG91 first |
| `MSG91_TPL_FEEDBACK_THANKS` | **No** — approve Flow in MSG91 first |

Code only sends the **Yes** set (`MSG91_TEMPLATE_LIVE`) until the others are Active (set `MSG91_FORCE_UNAPPROVED=1` to override).

---

## Roles

| Role | Meaning |
|------|---------|
| **Giver** | Person who dropped clothes |
| **Claimer** | Person who requested an item |
| **Us (ops)** | `aniketgupta83003@gmail.com`, `totemisnottaken@gmail.com` |
| **Sheetal** | `sheetalahuja99@gmail.com` — same ops triage alerts as Us |

---

## Extra emails (outside the 8)

| When | To | Function |
|------|-----|----------|
| Drop live | Giver | `sendDonationConfirmation` |
| Claim submitted | Claimer | `sendClaimConfirmation` |
| Address shared | Giver | `sendDeliveryDetailsToGiver` |
| Soft decline | Claimer | `sendClaimDecision` (declined) |
| Claim cancelled | Giver | `sendClaimCancelledToGiver` |
| Welcome / waitlist / partner / chat / contact reply | User | respective `BREVO_*` |

---

## Ops triage — Us + Sheetal (email only)

| When | Action buttons |
|------|----------------|
| Drop auto-published | Remove from Wall, Contact user |
| New claim | Decline request, Contact user |
| Reloved chat / contact form | Contact user |
| Partner application | Open admin |

Signed links: `GET https://reloved.digital/api/ops/drop-action?t=…` (SPA fetches Functions HTML — never email `cloudfunctions.net` directly).

---

## Code entry points

| Step | Trigger |
|------|---------|
| 1 OTP | `routes/otp.ts` |
| 2 Claimed | `donor` item-requests + `smsItemClaimedToGiver` |
| 3 Matched | `matchFlow` giver-decision Accept + `admin` claim decision |
| 4–5 Schedule | `matchFlow` respond-schedule accept → `schedule_agreed` |
| 6–7 Delivery | `admin.applyDeliveryStatusUpdate` (`rider_dispatched` / `delivered`) |
| 8 Feedback | `matchFlow` received (both confirmed) |

Implementation: `src/lib/notifications.ts`, `src/lib/msg91Sms.ts`.
