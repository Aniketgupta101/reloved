# BUG-20 — courier-data-minimisation

**Area:** Courier Privacy  
**Priority:** P0  
**Status:** DONE

## Bug / Issue
Courier may expose more data than intended

## Expected Fix
Pass only required data; verify provider visibility

## Engineering note (15 Sep 2026)
`resolveAddressesForClaim` now sends gate-only addresses + Reloved ops names; personal phones never passed (ops phone fallback). Rider phone hidden from claimer/giver UI — tracking link only.

## Live
- Wall: https://reloved-digital.web.app
- Waitlist: https://reloved.digital
