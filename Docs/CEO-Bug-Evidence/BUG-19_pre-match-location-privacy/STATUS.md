# BUG-19 — pre-match-location-privacy

**Area:** Privacy  
**Priority:** P0  
**Status:** DONE

## Bug / Issue
Exact pickup/drop visible before matching

## Expected Fix
Keep exact location private until Accept

## Engineering note (15 Sep 2026)
Public wall/item detail use `toPublicArea()` only. Exact `pickupLocality` stored privately and revealed post-Accept on gift/claim detail for the matched parties.

## Live
- Wall: https://reloved-digital.web.app
- Waitlist: https://reloved.digital
