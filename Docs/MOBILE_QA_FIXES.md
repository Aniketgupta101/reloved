# Mobile QA — findings & fixes (iPhone 13 / 390×844)

**Live URL tested:** https://reloved-digital.web.app/  
**Recording:** `Docs/MOBILE_QA_WALKTHROUGH.webm`  
**Date:** 2026-09-03

## Pages & flows covered
Home, Wall/Drop, Item detail, Claim→login, Give, Track, Love, Map, About, Standards, FAQ, Privacy, Terms, Contact, Partner, Account login (email/phone), Partner login, Admin login + dashboard subpages, 404. Mobile hamburger menu verified.

## Issues found → fixes shipped

1. **Admin ops nav blocked mobile content**  
   Full sidebar (9 links) filled the first screen; Overview metrics were below the fold.  
   **Fix:** Collapsible mobile admin menu (hamburger). Closed by default; shows current section label; opens on tap. Desktop unchanged.  
   File: `frontend/src/components/layout/AdminLayout.tsx`

2. **Floating help (?) covered form CTAs on mobile**  
   Pink FAB sat over Send code / primary actions on Account, Give, Contact.  
   **Fix:** Hide help FAB on `/account*`, `/give*`, `/contact`, `/partner/login` (still on browse pages).  
   File: `frontend/src/components/layout/PublicLayout.tsx`

3. **Wall category / gender chips looked “cut off”**  
   Rows are intentionally horizontally scrollable, but there was no cue.  
   **Fix:** Right-edge fade gradient on mobile so users see they can swipe.  
   File: `frontend/src/pages/public/Drop.tsx`

## Verified OK (no code change)
- Public pages load without horizontal document overflow  
- Hamburger menu opens full-screen nav  
- Wall items → detail → claim redirects to account login when signed out  
- Admin login with production credentials works  
- Give photo step UI lays out correctly on mobile  

## How to re-record
```bash
cd frontend
node scripts/mobile-qa-record.mjs
```
Artifacts land in `frontend/qa-artifacts/mobile-*`.
