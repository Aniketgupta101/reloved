# BUG-02 — public-area-only

**Area:** Privacy  
**Priority:** P0  
**Status:** DONE

## Bug / Issue
Exact building/flat/wing can appear on public listings

## Expected Fix
Public listings show area/neighbourhood only

## Engineering note (15 Sep 2026)
`toPublicArea()` redacts building/flat/wing. Public API (`toPublicItem`) and new donations store `publicArea` separately from private `pickupLocality`. Live on wall + item detail.

## Live
- Wall: https://reloved-digital.web.app
- Waitlist: https://reloved.digital
