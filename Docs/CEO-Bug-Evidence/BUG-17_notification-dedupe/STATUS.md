# BUG-17 — notification-dedupe

**Area:** Notifications  
**Priority:** P0  
**Status:** DONE

## Bug / Issue
Duplicate/missing notifications on state change

## Expected Fix
Exactly one notification per transition; expose failures to admin

## Engineering note (15 Sep 2026)
`pushUserNotification` is idempotent on `(donorTarget, type, role, requestId)` — skips insert if one already exists for that transition.

## Live
- Wall: https://reloved-digital.web.app
- Waitlist: https://reloved.digital
