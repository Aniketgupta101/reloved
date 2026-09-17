# Ready to test (16 Sep evening)

Local UI: http://localhost:3000/
API: live (functions just redeployed — gift Accept/Handed over matching fixed)

## What just went green (deep QA)
- D02 Decline + soft copy + Available again — PASS
- D03 Accept → Handed over → Received → Reloved — PASS
- D05 Support + Privacy authenticity + FAQ weekly 3-claim — PASS

## Manual smoke (you)
1. Soft decline: Claim → Giver Decline+reason → claimer sees **Couldn't match** (never Rejected)
2. Full match: Claim → Accept → Share building → Handed over → Received → **Reloved**
3. Give kids: Who's it for = Boys/Girls → **Age band** only (no XS–XL size)
4. Privacy: /privacy §3a three bullets; /terms brands section
5. Account: Claiming tab shows **Couldn't match**; claims counter says **this week**
