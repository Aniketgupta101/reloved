# Reloved — Uber/Rapido-style number masking (Exotel)

**Status:** Code wired to **Edesy** (not Exotel). Portal: https://masking.edesy.in  
**Date:** 10 September 2026 (updated same day � switched provider)  
**Goal:** Rider and giver/claimer talk **without either seeing the other�s real mobile** � same pattern as Uber / Rapido.

**Live env needed:** `CALL_MASKING_ENABLED=true`, `EDESY_API_KEY=vp_�`, `RELOVED_OPS_PRIMARY_PHONE`. ~?1.50/min prepaid. Exotel section below is kept as the long-term / backup vendor option.

This is **not** simple call forwarding. Forwarding only rings Reloved phones. Masking creates a **bridge** through Reloved virtual numbers.

---

## How it works (simple)

```
Rider  ←→  Reloved mask number  ←→  Giver   (at pickup)
Rider  ←→  Reloved mask number  ←→  Claimer (at drop)
```

- Rider’s Borzo contact stays a **Reloved** number (never giver/claimer personal).
- If rider needs the person at the gate, ops/admin triggers **Click to call** / bridge from Reloved admin (or auto when Borzo is booked).
- Both sides see only the Reloved / Exotel number on caller ID.

**In-app order chat** stays the main channel for non-urgent help. Masking is for **live delivery** moments.

---

## What Reloved / Totem needs from CEO & ops (do this first)

| # | Action | Owner | Notes |
|---|--------|-------|--------|
| 1 | Approve **Exotel** as vendor (India, masking + voice) | CEO | Alt: Edesy (~₹1.50/min) if Exotel sales is slow |
| 2 | Complete Exotel **business KYC** (GST, PAN, address, authorised signatory) | Reloved | Required for virtual numbers |
| 3 | Buy **ExoPhone pool** (start with **3–5** Mumbai/local numbers) | Reloved | Masking needs a small pool, not one number |
| 4 | Name **primary** answerer + **Aniket as backup** for the Reloved ops line (missed calls / IVR overflow) | CEO | Separate from masking; still useful for “rider calls Reloved” |
| 5 | Share with Totem (private): `EXOTEL_SID`, `EXOTEL_TOKEN`, `EXOTEL_API_KEY`, account subdomain, list of ExoPhone numbers | Totem | **Do not** paste tokens in WhatsApp groups |
| 6 | Confirm who pays Exotel invoices | Reloved finance | Usage = 2 call legs per masked minute |

### Approximate cost (confirm with Exotel sales)

- Business phone / starter packs: often from **~₹10k** prepaid credits + number rental  
- Number rental: **~₹500–1,000 / number / month** (indicative)  
- Masked call: **2 legs × per-minute rate** (both sides of the bridge)  
- GST extra  

---

## Signup links

1. Exotel: https://exotel.com/  
2. Number masking overview: https://exotel.com/use-cases/number-masking/  
3. Developer docs: https://developer.exotel.com/  
4. Sales / support: hello@exotel.com · +91-8088-919-888  

Ask Exotel specifically for: **“Number masking / Connect API for logistics — rider ↔ customer privacy, Mumbai DIDs.”**

---

## Launch vs masking (both needed)

### Still required this week (Track A — Borzo)

Until masking is live:

1. Put **only Reloved central number** on Borzo bookings (`BORZO_OPS_PHONE`).
2. **Never** paste giver/claimer personal numbers into Borzo.
3. Use **in-app chat** for status / address questions.
4. Optional: MyOperator/Exotel **single** number with forward to primary → Aniket for “rider called Reloved.”

### Phase 2 (this doc) — true Uber-style privacy

Wire Exotel Connect / masking so:

| Moment | Bridge |
|--------|--------|
| Pickup | Rider ↔ **giver** phone (masked) |
| Drop | Rider ↔ **claimer** phone (masked) |
| Ops assist | Reloved agent ↔ giver or claimer (masked) |

Admin UI: **“Call giver (masked)”** / **“Call claimer (masked)”** on Claim Requests + Donations.

---

## Totem build checklist (after credentials)

- [ ] Env vars in Functions (see `.env.example`): `EXOTEL_*`, `CALL_MASKING_ENABLED=true`
- [ ] `lib/callMasking.ts` — create bridge, release bridge, log call
- [ ] Firestore `callBridges` collection (claim/donation id, parties, Exotel CallSid, status)
- [ ] Admin API: `POST /api/admin/calls/mask` `{ subjectType, subjectId, party: "giver"|"claimer"|"ops" }`
- [ ] Admin buttons on claim + donation cards
- [ ] Optional: SMS to party “Reloved will call you from a Reloved number — please answer”
- [ ] Test 2 live Mumbai calls; record CallSid in admin
- [ ] Update Borzo ops note: “If rider needs resident, Reloved will bridge — do not ask for personal number”

Code scaffold lands in-repo once this doc is followed; **API calls stay off until KYC tokens exist**.

---

## Message to paste for CEO

> We’re doing **Uber/Rapido-style number masking** via **Exotel** (not basic call forwarding).  
> Rider and giver/claimer never see each other’s real mobiles — only a Reloved number.  
>  
> **Need from Reloved:** Exotel KYC + buy 3–5 virtual numbers + share API credentials privately with Totem. Primary ops phone + **Aniket as backup** for the Reloved line.  
>  
> Until that is live: Borzo stays on Reloved central number only; chat for everything else.  
> Cost: Exotel plan/usage + ~₹500–1k/number/mo (confirm with their sales).  

---

## Decision log

| Date | Decision |
|------|----------|
| 10 Sep 2026 | CEO direction: masking like Rapido/Uber; Aniket as backup; main path via Reloved virtual number / masking — not exposing personal numbers |
