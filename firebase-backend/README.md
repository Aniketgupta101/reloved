# reloved backend, Firebase Cloud Functions + Firestore

This is the live, production backend for reloved. It's the **only** backend. There is no separate Express/Postgres server anymore (that legacy code lived in a `backend/` folder and was removed once this replaced it).

## Architecture

- **Runtime**: A single Cloud Function (`api`, 2nd gen, region `asia-south1`) running an Express app behind it. Firebase Hosting rewrites `/api/**` to this function.
- **Database**: Firestore (NoSQL, document-based). See [Firestore collections](#firestore-collections) below.
- **Auth**: Custom JWT (via `jose`), **not** Firebase Auth's own session system. Firebase Auth's client SDK is used only to obtain a Google ID token (Google sign-in), which the backend verifies server-side and exchanges for our own JWT. See `lib/firebaseAuth.ts` and `routes/donor.ts`'s `/session/google`.
- **File storage**: Firebase/Cloud Storage bucket `reloved-digital.firebasestorage.app`.
- **Photo AI (bg-removal + Gemini item suggestions)**: relayed to an external Lightsail server (`lib/photoAnalyze.ts`). Native binaries (sharp, ONNX) can't run in Cloud Functions, so this is proxied out. This is the one piece of the stack that isn't Firebase-native; see "Known gaps" below.
- **Transactional email**: Brevo (Sendinblue), template-based. See `lib/notifications.ts`.
- **SMS OTP**: MSG91 Widget (client-side, no DLT/template approval needed; the OTP route is DLT-exempt in India).

## Project layout

```
functions/src/
  index.ts              Cloud Function entrypoint (lazy-loads app.ts)
  app.ts                Express app + route mounting
  routes/
    items.ts            GET /api/items, /api/items/:slug, public Wall listing
    waitlist.ts          POST /api/waitlist, coming-soon signup
    otp.ts               Email/SMS OTP request+verify, MSG91 widget token verify
    donor.ts             Donor session (OTP + Google), profile, item requests (claims)
    publicWrite.ts        Contact form, donation submission, photo analysis relay,
                          partner applications, donation tracking
    admin.ts             Everything behind the admin dashboard: submissions, items,
                          item requests, contact messages, partner applications,
                          bulk upload, metrics. Partner allocations are a stub (see below).
    auth.ts              Admin email+password login
    seed.ts              Dev-only wall seeding endpoint
  lib/
    firestore.ts         getDb() + collection name constants
    auth.ts              Our own JWT sign/verify (donor/admin/partner sessions)
    firebaseAuth.ts       Firebase Admin Auth, verifies Google ID tokens only
    notifications.ts      All Brevo email sends (see below)
    photoAnalyze.ts        Relays photo analysis to the external Lightsail server
    storage.ts            Cloud Storage upload helper
    multipart.ts          Manual multipart/form-data parsing (no multer in Functions)
  middleware/
    session.ts             requireRole() / attachSessionIfPresent, reads Bearer JWT
    adminAuth.ts            Admin-only route guard
```

## Firestore collections

| Collection | Purpose |
|---|---|
| `items` | Every donated item (Wall listing + admin inventory) |
| `donationSubmissions` | One per "Give" form submission (an item belongs to one submission) |
| `itemRequests` | Claims ("Take an item") |
| `donorProfiles` | Onboarded donor accounts. Linked by `target`/`email`/`phone`, see identity-linking note below |
| `otpCodes` | OTP records (email/SMS + MSG91 widget verifications) |
| `waitlistSignups` | Coming-soon page signups |
| `contactMessages` | Contact form submissions |
| `partnerApplications` | NGO/org partner applications |

**Identity linking**: a donor can log in via email one time and phone another. `findDonorProfileDoc()` in `routes/donor.ts` resolves either identity to the same profile (matches on `target`, then `email`, then `phone`) instead of creating a duplicate profile per identity. This is exported and reused by `admin.ts` when resolving a claimant's email for decision notifications.

## Email notifications (`lib/notifications.ts`)

All emails go through Brevo. Each function tries a real Brevo template first (by numeric ID from an env var); if the ID isn't set, it falls back to a plain-text email so nothing silently fails to send.

| Function | Fires on | Brevo template |
|---|---|---|
| `sendOtpEmail` (in `routes/otp.ts`) | OTP requested via email | `Email_login` (#1) |
| `sendWelcomeEmail` | First-time donor profile created | `Welcome_User` (#6) |
| `sendDonationConfirmation` | Donation submitted → donor | `Email_donation_confirmation` (#2) |
| `sendDonationAdminAlert` | Donation submitted → admin (+ BCC) | `Email_donation_admin_alert` (#3) |
| `sendClaimConfirmation` | Item request submitted → requester | `Email_claim_confirmation` (#4) |
| `sendClaimAdminAlert` | Item request submitted → admin (+ BCC) | `Email_claim_admin_alert` (#5) |
| `sendDonationDecision` | Admin approves/rejects a submission | `Email_donation_decision` (#7) |
| `sendClaimDecision` | Admin approves/rejects a claim | `Email_claim_decision` (#8) |
| `sendPartnerApplicationConfirmation` | Partner application submitted → org | `Email_partner_confirmation` (#9) |
| `sendPartnerApplicationAdminAlert` | Partner application submitted → admin (+ BCC) | `Email_partner_admin_alert` (#10) |
| `sendContactMessageAdminAlert` | Contact form submitted → admin (+ BCC) | `Email_contact_admin_alert` (#11) |

All five **admin-alert** emails go to `ADMIN_NOTIFY_EMAIL` and are BCC'd to a hardcoded second address (`ADMIN_BCC` constant in `notifications.ts`). Update that constant directly if the BCC recipient changes.

Source HTML for every template lives in `firebase-backend/email-templates/`. That's what gets pasted into Brevo's template editor; editing it here does **not** update the live Brevo template automatically.

## Known gaps

- **Partner allocations** (`admin.ts` `/allocations`, `/partner-needs`, `/allocation-items`): GET routes return empty arrays so the admin UI doesn't crash, but all mutation routes (`POST`/`PATCH`) are `501` stubs. This whole feature (matching partner orgs to bulk item allocations) isn't built yet.
- **Photo analysis** (bg-removal + Gemini suggestions) depends on an external Lightsail server (`PHOTO_ANALYZE_RELAY_URL`). If that server goes down, the AI-assisted photo upload on the Give flow breaks (donors can still submit manually).
- **`.env.reloved-digital` is gitignored and contains live secrets** (Brevo API key, MSG91 key, JWT signing secret, admin password). It is *not* in this repo. Whoever takes over deployment needs these values handed to them securely, not via git. See `.env.example` for the full list of keys with no real values.

## Local development

```bash
cd firebase-backend/functions
npm install
npm run build
```

Two ways to run locally:

**A. Firebase emulators** (functions + Firestore, fully isolated):
```bash
cd firebase-backend
firebase emulators:start --only functions,firestore --project reloved-digital
```
API base: `http://127.0.0.1:5001/reloved-digital/asia-south1/api` (note the double `/api`: Functions URL prefix + Express's own `/api` mount).

On Windows, this emulator has been flaky (a `firebase-tools` + Windows quirk unrelated to this codebase; the compiled function loads fine via `node -e "require('./lib/index.js')"`, it's specifically the CLI's discovery step that can hang). If it does:

**B. Plain Express server against the emulator** (bypasses the flaky discovery step):
```js
// run with: node local-server.js
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
process.env.GCLOUD_PROJECT = "reloved-digital"
const { createApp } = require("./lib/app.js")
createApp().listen(5050)
```
Point the frontend's `VITE_API_URL` at `http://127.0.0.1:5050` (no double `/api` this way, there's no Cloud Functions layer stripping a path segment).

## Deploy

```bash
cd firebase-backend/functions && npm run build   # always rebuild first, a stale lib/ silently ships old code
cd firebase-backend
firebase deploy --only functions --project reloved-digital
```

Live URL: `https://asia-south1-reloved-digital.cloudfunctions.net/api`

For hosting (the frontend build):
```bash
cd frontend && npm run build
# copy frontend/dist/* into firebase-backend/hosting-dist/
cd firebase-backend
firebase deploy --only hosting --project reloved-digital
```
Live URL: `https://reloved-digital.web.app`

**Requires Firebase Blaze plan** (pay-as-you-go). Functions need outbound network access (Brevo, MSG91, the Lightsail relay), which the free Spark plan blocks entirely.
