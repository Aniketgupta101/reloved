# QA Report Format

Use this exact structure. Most severe first. No padding, no restating the obvious, no hedging language ("might be an issue" — either it reproduced or it didn't).

```markdown
# QA Report — <scope> — <date>

Tested against: <URL/environment>. Flows covered: <list>. Not covered / untested: <list, with why>.

## P0 — Blocks launch / data loss / privacy leak
### <one-line summary>
**Flow:** <e.g. Give → Claim → Handover>
**Repro:**
1. <exact step>
2. <exact step>
3. <exact step>
**Expected:** <what should happen>
**Actual:** <what happened>
**Evidence:** <screenshot path, console error, network response>
**Traced to:** <file:line, if found>

## P1 — Broken but has a workaround, or high-frequency edge case
...

## P2 — Real bug, low frequency or low impact
...

## P3 — Polish / inconsistency, not a functional break
...

## UI/UX Notes
(Findings from the complementary UI/UX pass — confusing states, copy inconsistency, flow friction. Not severity-ranked the same way as functional bugs; call out anything that's actually blocking vs. just rough.)

## Confirmed Working
(What you tested and it held up — including the adversarial cases, not just the happy path. This is what tells the developer what's safe to leave alone.)
```

## Severity rubric

- **P0**: Data loss, privacy/security leak (exposed address/phone, cross-account data access, auth bypass), a core flow that cannot be completed at all, or state corruption that requires manual DB intervention to fix.
- **P1**: A flow completes but produces wrong/inconsistent state (double-booked claim, claim count not restored, status flips early), or a validation gap that lets clearly-invalid data through, or an error with no recovery path (stuck loading state, dead end with no way back).
- **P2**: Edge case that's real but narrow (a specific boundary value, a rare timing window), or a UX papercut that costs the user real effort but doesn't lose data or block them.
- **P3**: Cosmetic, copy inconsistency, or a nice-to-have (e.g. missing loading indicator on a fast operation).

## What "verified" means before it goes in the report

- Reproduced at least twice with the same steps
- Evidence captured (screenshot at failure point, console/network errors)
- Checked against the codebase for whether it's a deliberate decision (e.g. documented in `Docs/RELOVED_PATCH_NOTES.md`) rather than an oversight
- Traced to a file/line where feasible — if you searched and genuinely couldn't find it, say so rather than guessing
