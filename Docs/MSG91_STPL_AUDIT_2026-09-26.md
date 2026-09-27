# MSG91 vs STPL content audit + recreate (26 Sep 2026)

## Verdict

MSG91 did **not** have all templates with the same body as STPL. That is why only ~4 SMS arrived.

| Template | STPL body match on MSG91 Active? | Delivers today? |
|----------|----------------------------------|-----------------|
| OTP | Working Flow id kept | Yes (usually) |
| Item claimed | **No** — Active text omitted `Hi ##name##` + `##item##` | Yes (short body) |
| Claim matched | Was broken/unapproved id | **No** until Approve |
| Delivery ready | Was broken/unapproved id | **No** until Approve |
| Date & time set | Was broken/unapproved id | **No** until Approve |
| Rider coming | **Yes** — matches STPL | Yes |
| On the way | **Yes** — matches STPL | Yes |
| Delivered | **Partial** — missing `Hi ##name##` | Yes |
| Feedback / thank you | Was broken/unapproved id | **No** until Approve |
| Failed | **Yes** — matches STPL | Yes |

## What we did

1. **Archived** the earlier broken batch (`6ab7bcc*`) — removed from env (do not use).
2. **Recreated** STPL-matched templates in MSG91 via API (exact copy from STPL fill-in).
3. Added **STPL-correct versions** on Active `ITEM_CLAIMED` and `DELIVERED` (portal must Mark Default + set DLT id).
4. Wired env + code to:
   - Active delivering IDs for OTP / claimed / rider / on the way / delivered / failed
   - New STPL-matched IDs for matched / ready / schedule / feedback

## Portal actions (required for full 8 SMS)

In MSG91 → SMS → Templates:

1. Open **RELOVED_ITEM_CLAIMED** → version with `Hi ##name##…##item##` → set DLT `1777179006425983270` → **Mark default**.
2. Open **RELOVED_DELIVERY_DELIVERED_CLAIMER** → STPL version → set DLT `1777178999729243245` → **Mark default**.
3. Approve + Mark default for:
   - `RELOVED_CLAIM_MATCHED_STPL` (`6ab7d884cc1621c239025d22`)
   - `RELOVED_DELIVERY_READY_GIVER_STPL` (`6ab7d86ba55b3782c50d07d2`)
   - `RELOVED_SCHEDULE_SET_STPL` (`6ab7d86c89cc4efb2a02f6a2`)
   - `RELOVED_FEEDBACK_THANKS_STPL` (`6ab7d8869f73fa331e018ad6`)
4. On STPL: those four must be **Active** (not WIP) or MSG91 cannot deliver them on Indian numbers.

After that, reply here and we resend the full sequence to 7304382922.
