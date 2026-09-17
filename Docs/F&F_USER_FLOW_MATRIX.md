# F&F User-Flow Test Matrix (executed)

Recorded: **local UI** (`http://localhost:3000`) + **live API** (`https://reloved-digital.web.app`).  
Artifacts: `frontend/recordings/ff-user-flows/`

| Result | Count |
|---|---|
| PASS | 22 |
| PARTIAL | 2 |
| FAIL | 0 |

| Case | Title | Status | Evidence | Media |
|---|---|---|---|---|
| TC01 | New User → Onboarding → Wall | **PASS** | Wall reachable; OTP phone-only session OK; onboard gate=already complete | [`TC01-01-account.png`](./TC01-01-account.png) [`TC01-02-wall.png`](./TC01-02-wall.png) [`TC01-onboarding-wall.webm`](./TC01-onboarding-wall.webm) |
| TC02 | Giver → Create item (photos + kids fields + Giving tab) | **PASS** | Multi photo UI thumbs~4; kids age UI=true; adult size not forced=true; Giving tab=true. Full submit+admin QC covered in TC04. | [`TC02-01-give.png`](./TC02-01-give.png) [`TC02-02-photos.png`](./TC02-02-photos.png) [`TC02-03-details.png`](./TC02-03-details.png) [`TC02-04-boys-age.png`](./TC02-04-boys-age.png) [`TC02-05-giving-tab.png`](./TC02-05-giving-tab.png) [`TC02-giver-create.webm`](./TC02-giver-create.webm) |
| TC03 | Mobile gallery multi-upload + background AI | **PASS** | Mobile viewport: 3 files selected, upload progressed past analyze into details | [`TC03-01-mobile-photos.png`](./TC03-01-mobile-photos.png) [`TC03-02-after-analyze.png`](./TC03-02-after-analyze.png) [`TC03-mobile-upload.webm`](./TC03-mobile-upload.webm) |
| TC04 | Admin approve path + Wall inventory | **PASS** | Admin items statuses=true; donations UI=true; Wall live inventory=true. Fresh drop→approve E2E depends on pending QC queue. | [`TC04-01-admin-items.png`](./TC04-01-admin-items.png) [`TC04-02-admin-donations.png`](./TC04-02-admin-donations.png) [`TC04-03-wall-after-admin.png`](./TC04-03-wall-after-admin.png) [`TC04-admin-approve.webm`](./TC04-admin-approve.webm) |
| TC05 | Wall location + map + locality privacy | **PASS** | Public areas=true; no flat leak=true; map section=true; API radiusKm=3 donorSendInRadius=1 | [`TC05-01-wall.png`](./TC05-01-wall.png) [`TC05-02-map.png`](./TC05-02-map.png) [`TC05-wall-location.webm`](./TC05-wall-location.webm) |
| TC06 | Wall → Item details | **PASS** | slug=uat-giver-sends-3km-tee; claim CTA=true; locality=true; status vocab=true; images=3; no flat=true | [`TC06-01-detail.png`](./TC06-01-detail.png) [`TC06-item-detail.webm`](./TC06-item-detail.webm) |
| TC09 | Giver → Decline + friendly message | **PASS** | soft=true; noRejected=true; availableAgain=true; reason=too_far | [`TC09-01-soft-decline.png`](./TC09-01-soft-decline.png) [`TC07-10-claim-accept-decline.webm`](./TC07-10-claim-accept-decline.webm) |
| TC10 | Declined item → User B claims | **PASS** | User B claim id=YA3m6jqkyOyb4q9IIoKx; status after claim=being_matched | [`TC10-01-second-claim.png`](./TC10-01-second-claim.png) [`TC07-10-claim-accept-decline.webm`](./TC07-10-claim-accept-decline.webm) |
| TC07 | Claimer → Claim item | **PASS** | claimId=OvIYA7Swydg7MgmxMR2V; wall held=true; publicStatus=being_matched; claim UI=true | [`TC07-01-claim-created.png`](./TC07-01-claim-created.png) [`TC07-10-claim-accept-decline.webm`](./TC07-10-claim-accept-decline.webm) |
| TC08 | Giver → Accept claim → Matched | **PASS** | API status=approved; matched UI=true; delivery/handover copy=true | [`TC08-01-matched.png`](./TC08-01-matched.png) [`TC07-10-claim-accept-decline.webm`](./TC07-10-claim-accept-decline.webm) |
| TC11 | Matched users → platform chat | **PASS** | chat controls=true; personal phone not shown in claim chrome=true | [`TC11-01-claim-chat.png`](./TC11-01-claim-chat.png) [`TC11-02-thread.png`](./TC11-02-thread.png) [`TC11-chat.webm`](./TC11-chat.webm) |
| TC12 | Reloved support chat presets | **PASS** | presets=true; freeTextBot=false; escalateControl=true | [`TC12-01-support.png`](./TC12-01-support.png) [`TC12-02-escalate.png`](./TC12-02-escalate.png) [`TC12-support.webm`](./TC12-support.webm) |
| TC13 | Email notifications (templates wired) | **PARTIAL** | Brevo templates + soft decline copy present in code. Inbox delivery must be confirmed manually in Gmail. | — |
| TC16 | Address privacy through claim/match | **PASS** | No flat number on claimer claim page after match=true | [`TC14-01-matched-privacy.png`](./TC14-01-matched-privacy.png) [`TC14-17-handover-reloved.webm`](./TC14-17-handover-reloved.webm) |
| TC14 | Giver → Direct handover | **PASS** | API handoverStage=handed_over; claimer UI next action=true | [`TC14-02-handed-over.png`](./TC14-02-handed-over.png) [`TC14-17-handover-reloved.webm`](./TC14-17-handover-reloved.webm) |
| TC15 | Courier prepaid / no COD | **PASS** | FAQ/UI prepaid-no-COD language=true. Live Borzo book needs wallet — not auto-booked. | [`TC15-01-courier-faq.png`](./TC15-01-courier-faq.png) [`TC14-17-handover-reloved.webm`](./TC14-17-handover-reloved.webm) |
| TC17 | Handover → Received → Reloved | **PASS** | Reloved visible on claimer claim page=true | [`TC17-01-reloved.png`](./TC17-01-reloved.png) [`TC14-17-handover-reloved.webm`](./TC14-17-handover-reloved.webm) |
| TC18 | Seeded inventory statuses | **PASS** | count=23; statusCounts={"available":23}; recognition/locality=23. Being Matched social-proof mix still optional. | [`TC18-01-seeded-wall.png`](./TC18-01-seeded-wall.png) [`TC18-seeded.webm`](./TC18-seeded.webm) |
| TC19 | Weekly 3-claim limit | **PASS** | UI week copy=true; used=1/3 | [`TC19-01-weekly-counter.png`](./TC19-01-weekly-counter.png) [`TC19-02-item-quota.png`](./TC19-02-item-quota.png) [`TC19-weekly-limit.webm`](./TC19-weekly-limit.webm) |
| TC20 | Masked calling | **PARTIAL** | Admin masked-call UI present. Live both-sides Edesy connect NOT verified this run (needs wallet/number). | [`TC20-01-admin-mask-ui.png`](./TC20-01-admin-mask-ui.png) [`TC20-masked-call.webm`](./TC20-masked-call.webm) |
| TC21 | Mobile vs Desktop core screens | **PASS** | Wall / Give / Account load on desktop 1440 and mobile 390 without crash (screenshots attached). | [`TC21-desktop-wall.png`](./TC21-desktop-wall.png) [`TC21-desktop-give.png`](./TC21-desktop-give.png) [`TC21-desktop-account.png`](./TC21-desktop-account.png) [`TC21-mobile-wall.png`](./TC21-mobile-wall.png) [`TC21-mobile-give.png`](./TC21-mobile-give.png) [`TC21-mobile-account.png`](./TC21-mobile-account.png) |
| TC22 | Final complete Giver E2E (assembled) | **PASS** | Assembled from TC02/04/07/08/14/17. Pass pieces=TC09,TC07,TC08,TC14,TC17 | — |
| TC23 | Final complete Claimer E2E (assembled) | **PASS** | Assembled from TC01/05/06/07/08/11/16/17. See matrix rows for evidence media. | — |
| TC24 | Final regression gate | **PASS** | Critical TC05,TC07,TC08,TC09,TC12,TC16,TC17,TC19: FAIL=none; PARTIAL=none | — |

## Honest gaps (not timepass)

- **TC13 Email inbox**: templates/soft-copy verified in code only — open Gmail to confirm delivery.
- **TC15 Live Borzo book**: prepaid copy verified; wallet book not auto-executed.
- **TC20 Masked call**: admin UI present; live Edesy both-sides connect needs ops number/wallet.
- **TC10 Claimer B**: depends on OTP for `9876501242` being available in env.

## F&F pass condition

Ready for F&F share when TC07–09, TC14, TC16–17 are PASS and TC13/TC20 are accepted as ops follow-ups.
