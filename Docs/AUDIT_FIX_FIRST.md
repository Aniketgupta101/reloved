# Fix-first audit

Date: 28 Sep 2026. This is the list to close before Phase 1 in `docs/PHASES.md`.

Sources, rechecked against the current code on this date:

- CEO pack, 15 Sep 2026: `Docs/CEO-Bug-Evidence/` (19 DONE, 6 MOSTLY, 2 OPEN).
- Live QA, 22 Sep 2026: `Docs/QA_REPORT_2026-09-22.md`. That run was read-only after the stop. Write flows (Give submit, Claim, handover, chat, admin actions) were not exercised live.

Phase 0 API work stays as it is. This file does not deploy anything and does not change DNS.

## Fix first

These are still in the code. The 22 Sep report called the first one P1 and the next two P2.

| ID | What breaks | Where | What to change |
|---|---|---|---|
| QA-P1 | Admin approve/decline on a claim rewrites `status`, `handoverStage`, and the item `publicStatus` with no check of the current claim. A finished handover can be pulled back to claimed, and the claimer email fires again. Giver decision already refuses a non-pending claim (`matchFlow.ts` around the `claim.status !== "pending"` check). | `firebase-backend/functions/src/routes/admin.ts` `PATCH /item-requests/:id` (handler starts near line 1727) | Same guard as giver decision: only act when the claim is still pending. Send mail only when the status actually changes. |
| QA-P2a | Wall locality is the `publicArea` saved at Give time. `toPublicItem` keeps that stored value, so an old "Mumbai Zone 3, Mumbai" stays on the Wall after `toPublicArea()` was fixed. Live on 22 Sep: item `porter-blue-and-white-bag-muaa4cnr`. Not re-fetched today. | `firebase-backend/functions/src/types.ts` `toPublicItem` | Recompute the public area from the private locality when the stored value is a zone label, or backfill existing item docs once. New Gives already use the current helper. |
| QA-P2b | Giver accept/decline, handed-over, received, cancel, and the admin claim/submission patches read the doc, then write it, outside a transaction. Two fast clicks can both send the match notification. Claim creation already uses `runTransaction` in `donor.ts`. | `firebase-backend/functions/src/routes/matchFlow.ts`; admin claim patch above | Re-read status inside `runTransaction` before the write, the same way claim creation does. |

## After those

Still real, lower impact. The 22 Sep report called both P3.

| ID | What breaks | Where |
|---|---|---|
| QA-P3a | OTP verify uses only the newest unexpired code. An older code from a resend fails as "Incorrect code." | `firebase-backend/functions/src/routes/otp.ts` `POST /verify` |
| QA-P3b | Opening `/account/onboarding` with no session sends login to `redirect=/give`, so the user lands in Give instead of onboarding. | `frontend/src/pages/public/DonorOnboarding.tsx` default redirect `/give` |

## Previous pack, not a confirmed code break

Do not treat these as bugs to patch until a current recording shows a failure.

| ID | 15 Sep status | What is left |
|---|---|---|
| BUG-23 | OPEN | Mobile Drop → Claim → Match → Handover → Received recording. Smoke screenshots exist. |
| BUG-24 | OPEN | Same full flow on desktop. |
| BUG-04 | MOSTLY | Manual location fallback exists. Mobile GPS-deny screenshot was still missing. |
| BUG-09 | MOSTLY | Receiver-collect states exist. One full recording was missing. |
| BUG-15 | MOSTLY | Handed over → Received → RELOVED states exist. End-to-end evidence was missing. |
| BUG-16 | MOSTLY | In-app notifications and Brevo templates were wired. No missing event named. |
| BUG-21 | MOSTLY | Profile and item status share Firestore. Matrix screenshot was missing. |
| BUG-22 | MOSTLY | Wall is supposed to hide RELOVED items. Confirm on `/drop` during the current pass. |

## Already closed on 15 Sep

Do not reopen these unless the current pass shows them again: BUG-01, 02, 03, 05, 06, 07, 08, 10, 11, 12, 13, 14, 17, 18, 19, 20.

## Current audit

Add the breaks you are seeing now. Those rows are fixed before Phase 1, ahead of the table above only when you mark them P0.

| ID | Flow | What breaks | Expected | Seen on (local 8787 / live) |
|---|---|---|---|---|
| | | | | |

## Phase 0 leftover

`GET http://127.0.0.1:8787/api/health` returned `503` on this PC because `firebase-backend/functions/.env.reloved-digital` is not present, so Firestore never connected. Login, Wall, Give, and claim were not smoked. That is an environment gap, not one of the QA bugs above.
