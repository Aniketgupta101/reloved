# Reloved Friends & Family — Release pack (Fri 18 Sep)

## Deliverable
Test-ready web build in Friends & Family hands.

## Evidence links (in-repo)
- **Deep QA videos + matrix:** [F&F_VIDEO_INDEX.md](./F&F_VIDEO_INDEX.md)
- **Deep folder:** [`frontend/recordings/ff-deep-qa/`](../frontend/recordings/ff-deep-qa/)
- **Surface demos:** [`frontend/recordings/ff-categories/`](../frontend/recordings/ff-categories/)
- **Checklist:** [F&F_QA_CHECKLIST.md](./F&F_QA_CHECKLIST.md)
- **Pass/fail matrix:** [F&F_DEEP_QA_MATRIX.md](./F&F_DEEP_QA_MATRIX.md)

## Smoke test (morning)
1. Giver account: drop → accept/decline → hand over
2. Claimer account: nearby wall → claim → chat → received → reloved
3. Admin: QC + one masked call + one Borzo prepaid estimate/book if token present
4. Mobile + desktop for claim and give

## Share with testers
**URL:** https://reloved-digital.web.app (or production host)

**How to test (paste to F&F group):**

> Reloved is opening first to Friends & Family.  
> Please try: create account → Drop or Claim something near you → complete one hand-over.  
> Chat and updates stay on the platform (you’ll also get email).  
> Courier path for F&F is prepaid Borzo only (no COD) — or gate pickup / giver-send.  
> Soft declines may say we couldn’t match (distance/timing) — that’s intentional.  
> If anything breaks, message us; this is a controlled soft launch.

## Ops cover
- Someone on admin QC all Friday
- Note delivery exceptions manually (first-500 subsidy rules stay Phase 2)
- Log bugs for weekend hotfix

## Out of scope (do not promise)
- Dual Borzo+Porter deep integration (Phase 2 = pick ONE and deep-integrate)
- Auto courier status sync
- Native app / SEO / thrift detection engine
