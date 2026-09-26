# Reloved patch notes — 26 Sep 2026

Technical companion to `Docs/CLIENT_FIXES_2026-09-26.md` (client one-pager).

## Critical — claimed item still “Available”

| Item | Fix |
|------|-----|
| **Pink Corduroy Cropped Jacket** | DB `publicStatus` was stuck on `available` while claim was approved / schedule_agreed. Patched live → **`claimed`**. |
| Sync rule | Pending claim → `being_matched` · Approved match → `claimed` · Received → `reloved`. |
| Code | Admin sync + `POST /api/admin/sync-wall-statuses`. Overview Wall snapshot. |
| API | `/api/items` defaults to `wall` so claimed / being-matched aren’t dropped. |

## Admin Overview

- Deliveries today, or upcoming when today is empty.
- New drops + new claims; active matches; Wall snapshot.

## Jass / Sheetal / Wall UI

- Jass batch: category **men** + visibility restored (~43 items).
- Product images: white fill behind cutouts (`ProductFillImage` / Wall cards).

## SMS / email lifecycle

| # | Message | Email | SMS |
|---|---------|-------|-----|
| 1 | OTP | Brevo / relay | `MSG91_SMS_TEMPLATE_ID` |
| 2 | Somebody claimed → donor | `sendItemClaimNotifyGiver` | **Live** `MSG91_TPL_ITEM_CLAIMED` |
| 3 | Matched → claimer | `sendClaimDecision` | Pending MSG91 Approve |
| 4 | Delivery ready → dropper | `sendDeliveryReadyToGiver` | Pending MSG91 Approve |
| 5 | Date & time set | `sendScheduleSetEmail` | Pending MSG91 Approve |
| 6 | Dispatched | giver + claimer emails | **Live** rider + on-the-way |
| 7 | Delivered | emails | **Live** |
| 8 | Feedback | handover success | Pending MSG91 Approve |

`MSG91_TEMPLATE_LIVE` allowlist prevents #401/#400 emails for unapproved Flows. Set `MSG91_FORCE_UNAPPROVED=1` only for deliberate tests.

Ops SMS stay disabled (email triage only).

## Ops email list

- `totemisnottaken@gmail.com` + Aniket + Sheetal.

## Deployed

- Functions: `firebase deploy --only functions --project reloved-digital` (26 Sep evening).
- Frontend: cPanel / reloved.digital.
- Health: `GET .../api/api/health` → `sms.*_live` flags.
