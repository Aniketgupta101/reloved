# reloved frontend

React + Vite SPA, deployed to Firebase Hosting. Talks to the [firebase-backend](../firebase-backend/README.md) API. There is no other backend.

## Stack

- React + TypeScript, Vite build
- Tailwind CSS (neo-brutalist design system: hard borders, offset drop-shadows, bold uppercase type)
- React Router (client-side routing, no SSR)
- Firebase client SDK, used **only** for Google Sign-In (`src/lib/firebase.ts`). Everything else (data, auth sessions) goes through the backend API, not Firestore directly.
- PostHog + Google Analytics (GTM) for product analytics

## Structure

```
src/
  pages/
    public/      Home, Wall of Kindness (Drop), Give, Track, donor account
                  pages (login/onboarding/dashboard), static pages (About,
                  FAQ, Privacy, Terms, Contact, Standards), Wall of Love, map
    admin/        Admin dashboard: donations, items, item requests, bulk
                  upload, partners, messages
    partner/      Partner login + dashboard (UI exists; the backend for
                  partner allocations is a stub, see firebase-backend/README.md)
  components/
    layout/        PublicLayout, AdminLayout, Navbar, Footer
    sections/       Larger composed sections (KindnessMap, WallOfKindness grid,
                    FloatingHelpButton, the FAQ chat bot, HelpCta, etc.)
    ui/             Reusable primitives (Button, Input, SafeImage, LegalAccept, ...)
    assets/         Decorative/background components
  data/
    faqContent.tsx  Single source of truth for FAQ content, used by both the
                    /faq page and the FloatingHelpButton bot's keyword matcher
  lib/
    api.ts           Thin fetch wrapper, reads VITE_API_URL, attaches donor/
                      admin/partner Bearer tokens automatically per call
    donorSession.ts / adminSession.ts / partnerSession.ts
                      Token storage (localStorage) per role
    msg91Widget.ts    MSG91 OTP widget integration (client-side SMS OTP)
    firebase.ts       Firebase client SDK init, Google Sign-In only
    analytics.ts      PostHog + GA event tracking helpers
    genderMatch.ts / mumbaiPincodes.ts / compressImage.ts / utils.ts
                      Assorted flow-specific helpers
```

## Key user flows

**Donor login** (`DonorLogin.tsx`), three paths into the same account:
1. Email OTP (backend-issued code via Brevo)
2. Phone OTP (MSG91 widget, client-side, no DLT template needed)
3. Google Sign-In (Firebase Auth ID token, verified server-side, exchanged for our own session JWT)

All three resolve to the *same* `donorProfiles` record if the email/phone match an existing profile. See the identity-linking note in `firebase-backend/README.md`.

**Give an item** (`Give.tsx`), multi-step form: photos, then AI-assisted category/title/condition suggestions (relayed through the backend to an external photo-analysis server), then pickup details, then legal consent (`LegalAccept`), then submit. Triggers donation-confirmation + admin-alert emails.

**Claim an item** (`ItemDetail.tsx` item request), capped at 3 claims/month per donor, enforced server-side. Triggers claim-confirmation + admin-alert emails.

**Admin review** (`pages/admin/*`), approve/reject donations and claims. Each decision triggers a decision email back to the donor/claimant.

**Help bot** (`FloatingHelpButton.tsx`), floating button on every public page except `/faq` itself. Pure client-side keyword matching against `data/faqContent.tsx`, no AI/backend call, no API key, by design (was tried with Gemini, explicitly reverted).

## Environment variables

Three files, loaded by Vite in this priority: `.env.local` > `.env.production`/`.env` (mode-specific) > `.env`.

| Var | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL. Prod: `https://asia-south1-reloved-digital.cloudfunctions.net/api` |
| `VITE_FIREBASE_*` | Firebase client SDK config (Google Sign-In) |
| `VITE_MSG91_WIDGET_ID` / `VITE_MSG91_WIDGET_TOKEN` | MSG91 OTP widget credentials. Without these, phone login falls back to a slower server-side SMS path |
| `VITE_MAPTILER_API_KEY` | Impact map tiles |
| `VITE_POSTHOG_PROJECT_TOKEN` / `VITE_POSTHOG_HOST` | Analytics |
| `VITE_ASSET_BASE` | Leave empty. Wall item images use absolute URLs already |

**Important**: `VITE_API_URL` gets pointed at `http://127.0.0.1:5050` or the Firebase emulator during local testing of unreleased backend features. Always confirm it's back on the live Cloud Function URL before considering a change "done". This has caused confusion multiple times during development (testing against stale/empty local data and assuming something was broken).

## Local development

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build       # production build → dist/
npm run lint         # tsc --noEmit
```

## Deploy

```bash
npm run build
# copy dist/* into ../firebase-backend/hosting-dist/
cd ../firebase-backend
firebase deploy --only hosting --project reloved-digital
```

Live: `https://reloved-digital.web.app`. (`reloved.digital` is the registered domain at GoDaddy but is not yet pointed at this Firebase Hosting site. It currently serves separate, older content. Repointing that DNS is a pending step, not done as of this handover.)

**Do not** run `firebase deploy` from inside `frontend/`, there is intentionally no `firebase.json` here. The correct hosting config (with the `/api/**` rewrite to the backend function) lives only in `firebase-backend/`. An earlier version of this repo had a duplicate config here that deployed successfully but silently broke every API call in production; it was removed for exactly that reason.
