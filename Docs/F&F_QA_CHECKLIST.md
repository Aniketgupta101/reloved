# Reloved Friends & Family — QA Checklist (Thu 17 Sep)

Use this before feature freeze. Mark each row Pass / Fail.

**Video proof (in-repo):**
- Deep QA (acceptance criteria): [F&F_VIDEO_INDEX.md](./F&F_VIDEO_INDEX.md) · [`frontend/recordings/ff-deep-qa/`](../frontend/recordings/ff-deep-qa/)
- Pass/fail matrix: [F&F_DEEP_QA_MATRIX.md](./F&F_DEEP_QA_MATRIX.md)
- Surface category demos: [`frontend/recordings/ff-categories/`](../frontend/recordings/ff-categories/)

## Giver journey
- [ ] Login → Drop item → multi photos → preferences → submit — [D04](../frontend/recordings/ff-deep-qa/D04-give-kids-size-optional-gemini.webm)
- [ ] Admin QC approve (if required) → item appears on Wall as Available — [D06](../frontend/recordings/ff-deep-qa/D06-admin-seed-statuses.webm)
- [ ] Incoming claim → Accept — [D03](../frontend/recordings/ff-deep-qa/D03-accept-handover-received-reloved.webm)
- [ ] Incoming claim → Decline with reason (too far / timing / other) — [D02](../frontend/recordings/ff-deep-qa/D02-decline-reason-soft-copy-available.webm)
- [ ] Soft message reaches claimer (in-app + email) — never says "Rejected" — [D02](../frontend/recordings/ff-deep-qa/D02-decline-reason-soft-copy-available.webm)
- [ ] Handed over updates status — [D03](../frontend/recordings/ff-deep-qa/D03-accept-handover-received-reloved.webm)
- [ ] Book prepaid Borzo path (no COD) when logistics = porter_arranged — [D05](../frontend/recordings/ff-deep-qa/D05-support-privacy-faq-limits.webm)
- [ ] Remove incomplete (pending) listing from account

## Claimer journey
- [ ] Login with location → Nearby Wall sorts closer first (~3 km donor-send)
- [ ] Public locality only (no exact flat on Wall / item page) — [D01](../frontend/recordings/ff-deep-qa/D01-claimer-locality-pref-claim.webm)
- [ ] Delivery preference visible on item detail before claim — [D01](../frontend/recordings/ff-deep-qa/D01-claimer-locality-pref-claim.webm)
- [ ] Claim → Being Matched → Match after accept — [D03](../frontend/recordings/ff-deep-qa/D03-accept-handover-received-reloved.webm)
- [ ] Platform chat with giver works
- [ ] Email fallback fires for claim / match / soft decline
- [ ] Photo swipe works when item has multiple images
- [ ] Received → Reloved — [D03](../frontend/recordings/ff-deep-qa/D03-accept-handover-received-reloved.webm)
- [ ] Weekly claim limit = 3 (UI says "this week") — [D01](../frontend/recordings/ff-deep-qa/D01-claimer-locality-pref-claim.webm)

## Map / seed / admin
- [ ] Kindness map shows live inventory pins by area (not mock closet only) — [D06](../frontend/recordings/ff-deep-qa/D06-admin-seed-statuses.webm)
- [ ] Seeded wall shows mix of Available + Being Matched / Matched with owner — [D06](../frontend/recordings/ff-deep-qa/D06-admin-seed-statuses.webm)
- [ ] Admin approve/reject still works; branding intact — [D06](../frontend/recordings/ff-deep-qa/D06-admin-seed-statuses.webm)

## Support / privacy / upload / call masking
- [ ] Floating help shows preset questions only — [D05](../frontend/recordings/ff-deep-qa/D05-support-privacy-faq-limits.webm)
- [ ] Escalate note creates contact message / admin email — [D05](../frontend/recordings/ff-deep-qa/D05-support-privacy-faq-limits.webm)
- [ ] Privacy policy includes authenticity / no-guarantee wording — [D05](../frontend/recordings/ff-deep-qa/D05-support-privacy-faq-limits.webm)
- [ ] Multi-photo upload on mobile does not hit quota errors — [D07](../frontend/recordings/ff-deep-qa/D07-mobile-multi-upload-ai.webm)
- [ ] Admin masked call: Reloved number shown; both sides connect (Edesy configured)

## Go / no-go
Launch F&F only if all P0 rows above are Pass. Failures → fix Friday morning before sharing.
