# BUG-05 — 3km-matching

**Area:** Matching  
**Priority:** P0  
**Status:** DONE

## Bug / Issue
3 km matching not implemented/verified

## Expected Fix
Apply 3 km for donor-send without exposing exact address

## Engineering note (15 Sep 2026)
Haversine 3 km enforced for `giver_sends`. Fail-closed when giver lat/lng missing. Public UI shows area only; exact building kept private for match.

## Live
- Wall: https://reloved-digital.web.app
- Waitlist: https://reloved.digital
