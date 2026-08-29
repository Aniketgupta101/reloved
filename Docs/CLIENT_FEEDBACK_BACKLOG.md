# Client feedback backlog (Reloved)

Source: client discussion / Aakash notes (Aug 2026).  
**Status: all requested product changes are implemented locally** (Express + Vite). Not deployed live yet.

---

## Feedback checklist (complete)

| # | Client ask | Status | Where |
|---|------------|--------|--------|
| 1 | Terms & Conditions + Privacy Policy pages | Done (draft pending legal entity answers) | `/terms`, `/privacy` |
| 2 | “I Accept” disclaimer + T&C/Privacy checkbox on Give & Claim | Done | `LegalAccept.tsx` → Give review, Claim step 2 |
| 3 | Claim next step: personal use, not for sale | Done | Claim modal step 2 |
| 4 | Give audience: Men / Women / Girls / Boys | Done (+ Unisex for bags) | Give, onboarding, Drop filters |
| 5 | Categories: Outerwear \| Tops \| Bottoms \| Kicks \| Bags \| Accessories | Done | `shared/taxonomy.ts`, Give, Drop, Gemini |
| 6 | Apparel sizes XS \| S \| M \| L \| XL \| Oversized | Done | Give (Outerwear/Tops/Bottoms) |
| 7 | Girls/Boys age bands (Zara/Nike-style) | Done | Give age select |
| 8 | Donor Single vs Bulk upload + segregate same vs different garment | Done (UI grouping v1: Same item / New item; not full AI auto-split) | `/give` |
| 9 | Coming-soon: email **and** mobile both required, **no OTP** | Done | `coming-soon-dist/index.html` + `/api/waitlist` |
| 10 | Coming-soon: name optional | Done | waitlist form |
| 11 | After contact: “Donate or claim?” buttons | Done | waitlist intent block (appears after valid email + phone) |
| 12 | Coming-soon / web-app mobile hero: photos + brand name visible | Done | coming-soon scrim; Home wordmark + 2-col hero |
| 13 | Local FE + BE for faster build | Done | Vite → `localhost:8787` |

---

## Already shipped earlier (context)

- Wall: available-only; Picked for you (top 4); WebP thumbs; SafeImage fix  
- Account: profile edit + phone/email OTP; 3 claims/month  
- Give: username for Wall of Love; photo analyze (white bg + Gemini)  
- Admin bulk upload (categories/genders aligned to new taxonomy)

---

## Not part of “build feedback” — still open

These are **ops / client input**, not missing features:

- [ ] **Local DB:** start Docker Desktop → `backend/` → `docker compose up -d` → `npx prisma db push` (waitlist `phone` / `intent` columns)
- [x] **Deploy** coming-soon waitlist (email + mobile required, donate/claim) — live on `reloved.digital` (29 Aug 2026)
- [ ] **Client answers** (legal entity, exact kids bands, bulk max, bilingual claim copy, liability review) — see below

### Honest limits (called out to client if needed)

- Bulk: **manual Same item / New item** grouping (AI auto-segregation deferred as too heavy for v1).  
- Privacy/Terms: **lawyer-ready draft**, not final until entity/address/governing law confirmed.  
- Firebase waitlist route not re-synced yet — local Express schema is source of truth for this sprint.

---

## Questions to forward to client

1. Legal entity name, address, privacy email, governing law?  
2. Minimum user age? Parents claiming for kids OK?  
3. Extra Cookie / WhatsApp / SMS consent, or only T&C + Privacy?  
4. Exact “personal use / not for sale” wording (Hindi too)?  
5. Confirm kids age bands (we used 0–12m … 13–14y). Keep Unisex?  
6. Oversized only on apparel — OK? Kicks = free-text EU/UK?  
7. Max photos / items per bulk drop?  
8. Unsure same-vs-different garment: ask user (current) vs always new item?  
9. Donate/Claim on waitlist = preference only, or later deep-link?  
10. Phone = India 10-digit only?  
11. Extra photos/assets for legal pages?  
12. Publish “I Accept” paragraph as-is, or legal review first?
