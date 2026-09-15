# BUG-06 — empty-3km-fallback

**Area:** Matching  
**Priority:** P0  
**Status:** DONE

## Bug / Issue
Empty 3 km radius behaviour undefined

## Expected Fix
Explicit fallback after product decision — do not silently fail

## Engineering note (15 Sep 2026)
Hard exclude outside 3 km with explicit fallback copy: match closer giver / Receiver collects / Porter-Borzo / contact support. Fail-closed when giver coords missing. Codes: `OUTSIDE_3KM`, `GIVER_LOCATION_MISSING`.

## Live
- Wall: https://reloved-digital.web.app
- Waitlist: https://reloved.digital
