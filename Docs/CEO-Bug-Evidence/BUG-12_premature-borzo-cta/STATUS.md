# BUG-12 — premature-borzo-cta

**Area:** Courier CTA  
**Priority:** P0  
**Status:** DONE

## Bug / Issue
Book Borzo CTA at wrong stage

## Expected Fix
Show only after match + correct handover mode

## Engineering note (15 Sep 2026)
Borzo Estimate/Book CTAs gated to `status === approved` AND `giverLogistics === porter_arranged` on ClaimDetail + DonorDashboard. Other logistics show handover details only.

## Live
- Wall: https://reloved-digital.web.app
- Waitlist: https://reloved.digital
