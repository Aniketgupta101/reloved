# Reloved soft-decline email (claimer)

Use when a giver Declines a claim. Never say “rejected”.

## Subject
`Update on your RE-LOVED request — browse nearby`

## Params (Brevo)
- `REQUESTER_NAME`
- `ITEM_TITLE`
- `DECISION_MESSAGE`
- `NEXT_STEPS`
- `CTA_LABEL` → Browse the Wall
- `WALL_URL` → https://reloved.digital/drop (or production app URL)

## Copy
- Label: **Couldn't match**
- Body: we couldn't match you this time — distance or timing may not have worked. The item is back on the Wall if you'd like to browse nearby.
- Soft line: This isn't a rejection of you — sometimes distance or timing just doesn't line up.

## Env
Set on Cloud Functions:

```
BREVO_CLAIM_DECLINE_TEMPLATE_ID=<new_template_id>
```

Falls back to rich HTML in `notifications.ts` if the template id is missing, or to `BREVO_CLAIM_DECISION_TEMPLATE_ID`.
