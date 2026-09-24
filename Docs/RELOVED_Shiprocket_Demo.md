# Reloved — Shiprocket Quick (demo + API)

**Status:** API login works. **Book via Shiprocket API** is wired. Live AWB needs wallet ≥ ₹100 and **6-digit pincodes** on pickup + drop.

## Creds (server only — gitignored)

In `firebase-backend/functions/.env.reloved-digital`:

```env
SHIPROCKET_EMAIL=system@reloved.digital
SHIPROCKET_PASSWORD=***
SHIPROCKET_OPS_PHONE=9653273812
```

## Who pays

| Rides | Payment on Shiprocket |
|---|---|
| **1–500** | **Prepaid** — Reloved wallet |
| **501+** | **COD** — claimer pays courier when delivery arrives |

Admin **Book via Shiprocket API** picks this automatically from the first-500 counter.


## Admin flow

1. Claims → Matched → courier claim
2. **Estimate Shiprocket fee** (optional)
3. **Book via Shiprocket API** → creates order, tries AWB + pickup
4. If AWB pending (low wallet): recharge, assign in Shiprocket dashboard, or cancel and re-book
5. Stages: Notify rider dispatched → Mark picked up → Mark delivered

**Open Shiprocket site** still works for manual Quick/Instant booking.

## Privacy

- Contact phone on bookings: **9653273812** only
- Addresses sent as gate-prefixed building text (no flat / personal phones)

## Out of scope

- Instant/hyperlocal guarantee (API may return standard couriers unless Quick Instant is enabled on the account)
- Borzo API UI (still paused)
