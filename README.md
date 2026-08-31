# reloved, Digital Wall of Kindness

A free, Mumbai-based platform where people give away clothing, footwear, and bags they no longer need, and others claim quality preloved items completely free. No money changes hands, ever.

- **Live site**: https://reloved-digital.web.app
- **API**: https://asia-south1-reloved-digital.cloudfunctions.net/api
- **Domain**: `reloved.digital` is registered (GoDaddy) but not yet pointed at the site above. See [frontend/README.md](frontend/README.md#deploy)

## Architecture

```
┌──────────────┐       ┌────────────────────────────┐       ┌───────────┐
│   frontend/  │──────▶│      firebase-backend/      │──────▶│ Firestore │
│  React SPA   │ HTTPS │  Cloud Function (Express)   │       │  Storage  │
│ Firebase     │       │  asia-south1                │       └───────────┘
│ Hosting      │       └──────────────┬───────────────┘
└──────────────┘                      │
                                       ├──▶ Brevo (transactional email)
                                       ├──▶ MSG91 (SMS OTP)
                                       └──▶ External Lightsail server
                                            (photo bg-removal + Gemini
                                             item-suggestion AI, native
                                             binaries can't run in
                                             Cloud Functions)
```

Everything is on **Firebase** (Hosting + Cloud Functions + Firestore + Storage), Blaze (pay-as-you-go) plan. The one exception is AI photo processing, which is relayed to an external server. See "Known gaps" in [firebase-backend/README.md](firebase-backend/README.md#known-gaps).

There used to be a separate Express + Postgres backend (`backend/`, deployed to AWS Lightsail). It has been fully removed. Firebase is the only backend now.

## Project structure

| Path | What |
|---|---|
| `frontend/` | React SPA, see [frontend/README.md](frontend/README.md) |
| `firebase-backend/` | Cloud Functions API + Firestore, see [firebase-backend/README.md](firebase-backend/README.md) |
| `shared/` | Zod schemas + taxonomy constants shared between frontend and backend |
| `Docs/` | Scope of Work, brand guidelines, pricing, Privacy Policy, Terms & Conditions source |

## Quick start (local development)

```bash
# Backend
cd firebase-backend/functions
npm install && npm run build
cd .. && firebase emulators:start --only functions,firestore --project reloved-digital

# Frontend (separate terminal)
cd frontend
npm install
npm run dev   # http://localhost:3000
```

See each subproject's README for environment variables, the full route/component list, deploy steps, and known gaps.

## User roles

- **Donor**: gives and/or claims items. Signs in via email OTP, phone OTP (MSG91 widget), or Google. One account per person regardless of which identity they use (see identity-linking note in the backend README).
- **Admin**: reviews donation submissions and claims, manages the Wall, handles partner applications and contact messages. Email + password login.
- **Partner** (NGO/org): applies for bulk allocations of donated items. The application form and admin review of applications work; the actual allocation-matching workflow is **not built yet** (backend routes are stubs). See "Known gaps" in the backend README.

## Documentation in this repo

- [`Docs/HANDOVER.md`](Docs/HANDOVER.md), Phase 1 status vs. scope, what's been added, what's still open
- [`frontend/README.md`](frontend/README.md), pages, components, user flows, env vars, deploy
- [`firebase-backend/README.md`](firebase-backend/README.md), routes, Firestore collections, email system, env vars, deploy, known gaps
- [`Docs/Re loved Scope_of_Work.pdf`](<Docs/Re loved Scope_of_Work.pdf>), original client scope of work
- [`Docs/v1 RELOVED_BRANDING_UI_HANDOFF.md`](<Docs/v1 RELOVED_BRANDING_UI_HANDOFF.md>) / [`Docs/Direction_1_Brand_Review v1.pdf`](<Docs/Direction_1_Brand_Review v1.pdf>), brand/design reference
- [`Docs/RELOVED_PRICING.md`](Docs/RELOVED_PRICING.md), infrastructure cost breakdown by user-count tier
- [`Docs/PRIVACY_POLICY.pdf`](Docs/PRIVACY_POLICY.pdf) / [`Docs/TERMS_AND_CONDITIONS.pdf`](Docs/TERMS_AND_CONDITIONS.pdf), legal page source (also live on-site at `/privacy` and `/terms`)
