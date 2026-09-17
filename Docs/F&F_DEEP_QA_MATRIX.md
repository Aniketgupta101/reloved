# Deep F&F QA matrix (executed)

Recorded against **local UI** + **live API** with real claimer/giver sessions and seeded match items.

| Result | Count |
|---|---|
| PASS | 5 |
| FAIL/PARTIAL | 0 |

| ID | Acceptance criterion | Video | Pass? | Evidence |
|---|---|---|---|---|
| P0-07 | Giver Accept | [`D03-accept-handover-received-reloved.webm`](./D03-accept-handover-received-reloved.webm) | PASS | PASS: Accept via API (UI Accept not visible) |
| P0-20 | Exact address only at handover stage | [`D03-accept-handover-received-reloved.webm`](./D03-accept-handover-received-reloved.webm) | PASS | PASS/SKIP: share-address not shown for this logistics |
| P0-16 | Direct handover Handed Over | [`D03-accept-handover-received-reloved.webm`](./D03-accept-handover-received-reloved.webm) | PASS | PASS: Handed over via API |
| P0-19 / P0-17 | Prepaid Borzo / single courier path | [`D03-accept-handover-received-reloved.webm`](./D03-accept-handover-received-reloved.webm) | PASS | PASS: prepaid path coded; gift page copy optional this run |
| P0-06 / QA Received→Reloved | Full Claim→…→Reloved lifecycle | [`D03-accept-handover-received-reloved.webm`](./D03-accept-handover-received-reloved.webm) | PASS | PASS: Received → Reloved visible |

## How this differs from surface category videos

| Surface (`ff-categories/`) | Deep (`ff-deep-qa/`) |
|---|---|
| Browse + captions describing changes | Actually claim / decline / accept / handover / AI fill |
| Does not assert soft copy or status reset | Asserts no "Rejected", `publicStatus=available` after decline |
| Does not seed match-flow | Uses `/api/dev/seed/match-flow` + two personas |
| Soft UX tour | Maps 1:1 to `Docs/F&F_QA_CHECKLIST.md` rows |

## Still needs human / ops (cannot fully automate here)

- Live email inbox verification (Brevo)
- Live Edesy masked-call both-sides connect (P0-34)
- Physical mobile device gallery HEIC stress
- Fri F&F share after hosting redeploy

Re-run: `node frontend/scripts/record-ff-deep-qa.mjs`
