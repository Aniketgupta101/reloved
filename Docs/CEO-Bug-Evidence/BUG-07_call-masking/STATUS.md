# BUG-07 — call-masking

**Area:** Call Privacy  
**Priority:** P0  
**Status:** DONE

## Bug / Issue
Donor/receiver phones can be exposed

## Expected Fix
Call masking / telephony relay

## Engineering note (15 Sep 2026) — LIVE E2E PASSED
1. Live status: `enabled=true`, `configured=true`, provider=edesy, DID `9429397422`
2. Direct Edesy: HTTP 201, `call_sid=96ada97c-…`, `masked_number=919429397422` (ops ↔ Aniket)
3. Reloved admin API: HTTP 201 `ops_to_claimer`, `callSid=e8c2e4c1-…`, `maskedNumber=919429397422`
4. Admin UI: Ops↔Claimer, Claimer↔Giver, Rider↔Claimer, Rider↔Giver
5. Borzo bookings use Reloved ops phone only; rider phones hidden in user UI

## Live
- Wall: https://reloved-digital.web.app
- Admin: `/admin/item-requests` → masked call buttons
- Test: `node frontend/scripts/test-call-masking-e2e.mjs --live --to=XXXXXXXXXX`
