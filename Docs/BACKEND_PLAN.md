# reloved — Backend, Database & Asset Storage Plan

## Context

The current app (`src/`) is a Vite/React frontend that talks **directly to Firestore from the browser** for every write — donation submissions, items, partner applications, contact messages. There is no backend. This causes concrete problems visible in the code today:

- **`firestore.rules` allows `read, write: if true` on every collection** ([firestore.rules](../firestore.rules)) — anyone can read, edit, or delete any submission, item, partner application, or audit record. No validation happens anywhere.
- **Photos are never actually persisted.** [Give.tsx](../src/pages/public/Give.tsx#L48) turns uploaded files into `URL.createObjectURL()` blob URLs and writes *those* (a browser-local reference, invalid after refresh) into Firestore as `storage_path`. There is no real upload/storage step despite the UI text claiming "images are compressed and location data is removed automatically."
- **`src/types/database.ts`** already sketches a full relational schema (profiles, donation_submissions, items, item_images, partner_applications, partners, partner_needs, allocations, allocation_items, evidence_records, audit_events, app_settings) in Supabase-style `Row/Insert/Update` shape — but it's just unused TypeScript types; the app actually writes loosely-shaped documents straight into Firestore, so nothing enforces it.
- **No OTP verification or transactional email** exist yet, though the SOW ([Docs/Re loved Scope_of_Work.pdf](<Re loved Scope_of_Work.pdf>)) requires both.
- **No admin workflow logic** exists for matching items → partner needs → allocations → completion evidence — `AdminDashboard.tsx` only reads counts; there's no code to approve/reject a submission or run an allocation.
- Real Firebase project keys are committed in `firebase-applet-config.json`. Client Firebase config isn't a secret by itself, but it's currently the *only* thing standing between the public internet and full read/write on all data, which is the real exposure.

Goal: design a real backend + database + asset storage layer that fixes the above, reuses what's already in the repo (Express and Zod are already dependencies; the relational schema is already drafted), and is honest about what's realistically buildable given the SOW's 20 Aug 2026 launch date is **tomorrow** relative to today (19 Aug 2026).

This is a **plan document** — no backend code exists yet. Nothing in `src/` has been changed.

---

## Gaps found on review pass

Went back through the whole doc against the SOW and the rest of the codebase ([Partner.tsx](../src/pages/public/StaticPages.tsx), `Contact` in the same file, [MapPage.tsx](../src/pages/public/MapPage.tsx), [Love.tsx](../src/pages/public/Love.tsx), `index.html`). Six real gaps, folded into the relevant sections below:

1. **`Partner.tsx` and the `Contact` form** ([StaticPages.tsx](../src/pages/public/StaticPages.tsx#L42-L82)) also write straight to Firestore (`partner_applications`, `contact_messages`) — the "Frontend changes required" list missed them.
2. **No admin endpoints for `contact_messages` or the `partner_applications` review queue** — `firestore.rules` explicitly has a `contact_messages` collection today; the admin API list never gave it a replacement, so contact form submissions would have nowhere for Reyansh to read them.
3. **SEO/analytics is an explicit SOW deliverable** ("Search Console verification, sitemap/indexing, basic metadata... traffic/conversion analytics") and this plan didn't touch it. The app is a pure client-rendered SPA (`index.html` has one static `<title>` for every route) — item pages won't have real per-item meta tags for indexing without prerendering/SSR or a targeted fix. Flagged as its own item below, not solved inline — it's a separate design decision (prerender vs SSR vs accept SPA limits for pilot).
4. **No anti-spam beyond rate-limiting.** `firebase-applet-config.json` has an empty `recaptchaSiteKey` field, suggesting reCAPTCHA was anticipated at some point but never wired up. With every public form (`Give`, `Partner`, `Contact`, the new OTP request endpoint) open to the internet, rate-limiting alone won't stop scripted abuse.
5. **Map page has no coordinates to plot.** [MapPage.tsx](../src/pages/public/MapPage.tsx) renders `KindnessMap` (mapbox-gl/maplibre, `VITE_MAPTILER_API_KEY` already in `.env.example`), but `items`/`partners` only ever store a free-text `locality` string — nothing in the schema geocodes that to lat/lng. The map has no real pins to show without this.
6. **No admin review/approve UI exists yet, only the API.** `AdminDashboard.tsx` today only displays metric counts — there's no screen anywhere to actually approve/reject a submission, edit an item, or run an allocation. This plan built the API for those actions but the admin screens to drive them are net-new frontend work, not a "replace Firestore call" swap like the public pages.

---

## Recommended architecture

| Layer | Choice | Why |
|---|---|---|
| Backend runtime | **Node.js + Express** | Already a dependency (`express` in package.json); no new stack to learn. |
| Language | TypeScript (`tsx` already a dep) | Matches frontend, share Zod schemas between client and server. |
| Database | **PostgreSQL** | `database.ts` is already a relational schema with foreign keys (items → submissions, allocation_items → allocations/items, etc.). That's a Postgres schema wearing Firestore clothes. The allocation/matching workflow (item ↔ partner_need ↔ allocation) needs real joins and transactions — painful in Firestore, natural in Postgres. |
| ORM | **Prisma** | Turns `database.ts`'s tables into a real `schema.prisma` almost 1:1. Gives migrations, type-safe queries, and Prisma Studio as a free basic data browser for Sheetal/Reyansh to eyeball submissions without building an extra internal tool. |
| Admin auth | **Keep Firebase Auth** | `AdminLogin.tsx` already works (email/password via Firebase Auth). Don't rebuild auth from scratch under time pressure — backend just verifies the Firebase ID token server-side (`firebase-admin`) on every `/api/admin/*` route instead of trusting open Firestore rules. |
| Donor/public auth | None (matches today) | Public flows (Give, Track, Partner apply) stay unauthenticated, same as now — just now validated and rate-limited server-side instead of writing straight to an open database. |
| Validation | **Zod** (already a dependency) | Same schemas can be imported by both the Express route handlers and the React form (`Give.tsx` etc.), so "required field" rules live in one place instead of two. |
| Image processing | **`sharp`** (new dep) | Actually do what the UI already claims: strip EXIF, resize, compress server-side on upload. Currently nothing does this. |
| Asset storage | **Local disk on the backend server**, behind a small storage-adapter interface | Matches what you asked for. See dedicated section below for the tradeoff you need to accept and how to de-risk it. |
| SMS/OTP | **MSG91** | India DLT compliance built in — see Email + SMS section below. |
| Email | **Brevo** | Transactional + broadcast/campaign in one product with a non-technical UI — see Email + SMS section below. |

---

## Database schema

Carry `src/types/database.ts` forward almost as-is into `prisma/schema.prisma` — it's already the right shape. Tables, in dependency order:

1. `profiles` — internal operator accounts (mirrors Firebase Auth UID → role)
2. `donation_submissions` — one per Give flow submission
3. `items` — belongs to a submission; `public_visibility` + `public_status` drive what `ItemDetail.tsx` / the Wall show
4. `item_images` — real files now, `storage_path` = actual relative path on disk, not a blob URL
5. `partner_applications` → approved ones become `partners`
6. `partner_needs` — what each partner is short on
7. `allocations` / `allocation_items` — the matching workflow: which items go to which partner, in what quantity
8. `evidence_records` — completion proof photos (also real files via the same storage adapter). Schema already has `minor_involved` and `guardian_or_institution_consent` columns — with ashrams/schools as partners, evidence photos will sometimes include children. Enforce in the API, not just the schema: reject `public_visibility=true` on any record where `minor_involved=true` unless `guardian_or_institution_consent=true` is also set. Currently just unenforced columns.
9. `audit_events` — every admin mutation logged (who, what changed, before/after) — currently defined in the type but nothing writes to it
10. `app_settings` — small key/value config table

Differences from the current `database.ts` worth making now while migrating:
- Add real foreign key constraints (`items.submission_id → donation_submissions.id`, etc.) — Postgres enforces these; Firestore couldn't.
- Add a `donor_email`/`donor_phone` uniqueness-friendly index for the OTP step later.
- `donation_submissions` needs an `otp_verified_at` nullable column for the SOW's verification requirement, even if OTP itself ships in a later phase.

---

## Asset storage — decided: local disk for dev, Cloud Storage for deploy

Originally scoped as local disk only. Since this project is deployed via AI Studio's Cloud Run hosting (serverless — local disk doesn't survive a redeploy), the storage layer now has two drivers behind one interface, chosen by `STORAGE_DRIVER`:

- **`disk`** (default, local dev) — writes to `backend/uploads/{entity}/{uuid}.webp`, served via `/uploads`.
- **`gcs`** (Cloud Run deploys) — writes to a Cloud Storage bucket via `@google-cloud/storage`, using Application Default Credentials (Cloud Run's runtime service account — no key file needed, just grant it `Storage Object Admin` on the bucket). Returns a public `storage.googleapis.com` URL, which the frontend already handles (`resolveImageUrl` in `frontend/src/lib/api.ts` passes any `http(s)://` URL through unchanged).

Implemented in [backend/server/lib/storage.ts](../backend/server/lib/storage.ts) — `saveImage()`/`deleteImage()` are the only functions any route calls; nothing else touches the filesystem or the GCS SDK directly.

**To deploy on Cloud Run, provision:**
1. A Cloud Storage bucket (any name)
2. Grant the Cloud Run service's runtime service account `Storage Object Admin` on that bucket
3. A Cloud SQL for PostgreSQL instance — needs zero code changes, Prisma just takes whatever `DATABASE_URL` it's given
4. Enable the Cloud Run service's native "Cloud SQL connections" integration
5. Set `STORAGE_DRIVER=gcs`, `GCS_BUCKET_NAME=<bucket>`, and `DATABASE_URL` to the Cloud SQL connection string

**Still back up.** Even on GCS, the bucket is the one piece of state not reproducible from the database — enable versioning or a periodic export.

**Resolved — AI Studio's one-click deploy does not apply here.** Confirmed (via Gemini, asked directly): AI Studio's built-in server capability (`majorCapabilities: MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` in `frontend/metadata.json`) is specifically a Gemini API proxy, not a general backend host, and its auto-deploy expects the original monolithic folder layout. Neither applies to this custom Express/Prisma backend. Deploy manually to Cloud Run instead — everything below is built and locally verified for that path.

### Manual Cloud Run deploy

[backend/Dockerfile](../backend/Dockerfile) — multi-stage build: installs deps, runs `prisma generate`, bundles `server/index.ts` (and its import of `../shared/schemas.ts`) into a single `dist/index.js` via esbuild with `--packages=external` (so `sharp`/`@prisma/client`'s native binaries stay real `node_modules` installs, only our own source gets bundled). Verified locally: `npm run build && npm run start:built` serves identically to `npm run dev`, including admin routes.

**Must build from the repo root**, not from inside `backend/` — the Dockerfile needs the sibling `shared/` folder in its build context:

```bash
# from repo root
gcloud auth login
gcloud config set project <PROJECT_ID>   # find it at aistudio.google.com/app/apikey

gcloud builds submit --tag gcr.io/<PROJECT_ID>/reloved-backend -f backend/Dockerfile .

gcloud run deploy reloved-backend \
  --image gcr.io/<PROJECT_ID>/reloved-backend \
  --set-env-vars STORAGE_DRIVER=gcs,GCS_BUCKET_NAME=<bucket>,FIREBASE_PROJECT_ID=<firebase-project-id> \
  --set-env-vars DATABASE_URL=<cloud-sql-connection-string> \
  --add-cloudsql-instances <PROJECT_ID>:<REGION>:<INSTANCE> \
  --allow-unauthenticated
```

After first deploy, run the migration once against the Cloud SQL instance (via `prisma migrate deploy`, using the Cloud SQL Auth Proxy or a Cloud Shell with `DATABASE_URL` set) — `prisma migrate dev` is dev-only, production uses `migrate deploy`.

Frontend then points at the resulting `*.run.app` URL via `VITE_API_URL` (see `frontend/.env.example`) instead of relying on the Vite dev proxy.

---

## API surface (Express, all under `/api`)

**Public (no auth, rate-limited + Zod-validated):**
- `POST /api/donations` — replaces the direct `setDoc` calls in [Give.tsx](../src/pages/public/Give.tsx#L57-L114); handles the multipart photo upload + submission + items in one transaction
- `GET /api/items` — filterable/paginated list for the Wall of Kindness (only `public_visibility=true`)
- `GET /api/items/:slug` — replaces the Firestore query in [ItemDetail.tsx](../src/pages/public/ItemDetail.tsx#L20-L25)
- `POST /api/partner-applications`
- `POST /api/contact`
- `GET /api/track/:reference` — replaces the client-side Firestore lookup implied by [Track.tsx](../src/pages/public/Track.tsx)
- `POST /api/otp/request`, `POST /api/otp/verify` — SMS/email OTP, see Email + SMS section below

**Admin (Firebase ID token required, verified via `firebase-admin`):**
- `GET/PATCH /api/admin/submissions`, `/api/admin/items` — approve/reject/edit, writes `audit_events`
- `GET/PATCH /api/admin/partner-applications` — the pending-review queue; approving one creates the corresponding `partners` row
- `GET/POST/PATCH /api/admin/partners`, `/api/admin/partner-needs`
- `POST/PATCH /api/admin/allocations`, `/api/admin/allocation-items` — the actual item↔partner matching workflow, currently unbuilt
- `POST /api/admin/evidence` — completion proof upload
- `GET/PATCH /api/admin/contact-messages` — replaces the open `contact_messages` Firestore collection; this is currently write-only from the public side with no way for Reyansh to read/action it
- `GET /api/admin/metrics` — replaces the `getCountFromServer` Firestore calls in [AdminDashboard.tsx](../src/pages/admin/AdminDashboard.tsx#L20-L32)
- `GET /api/admin/audit-events`

---

## Email + SMS — in scope, built alongside the backend, two vendors

Per the SOW both are required (OTP verification + transactional email). Originally scoped as one vendor (MSG91) for both channels. Revised: **email moved to Brevo, SMS/OTP stays on MSG91** — deliberately two vendors now, because the email requirement grew beyond OTP/transactional into marketing-style broadcasts ("new item available" notifications to donors), which needs contact-list and campaign tooling MSG91's email product doesn't really offer. Brevo does — plus a free tier (300 emails/day) and a UI Sheetal/Reyansh could use directly for broadcast sends without engineering involved.

SMS stays on MSG91 rather than consolidating onto Brevo's SMS product too: MSG91 was picked specifically for built-in India DLT compliance, which is the whole reason it beat Twilio originally. Brevo's SMS is a generic global product, not India-compliance-specific — moving SMS there would trade away the one thing that made the original pick correct, just to satisfy "one vendor" as a rule rather than an outcome.

### Vendor comparison — email

| Vendor | Free tier | Campaign/broadcast UI | Transactional API | Pricing at pilot scale | Verdict |
|---|---|---|---|---|---|
| **Brevo** | 300 emails/day, forever | Yes — contact lists, templates, non-technical send flow | Yes | Cheap/free | **Recommended** |
| **SendGrid** | Trial only now, then paid | Thin — mostly API/developer-first | Yes | Pricier faster | Better fit for pure-transactional-at-scale, not this |

### Vendor comparison — SMS/OTP (unchanged from original decision)

| Vendor | India DLT handling | Verdict |
|---|---|---|
| **MSG91** | Handles it for you — core market | **Recommended, unchanged** |
| Twilio | You handle DLT registration yourself | Fallback only |

Both channels sit behind one `notifications.ts` interface:
```
sendOtpSms(phone, code)        // MSG91
sendOtpEmail(email, code)      // Brevo
sendEmail(to, template, data)  // Brevo
sendBroadcast(listId, template, data)  // Brevo — new, for "new item available" style sends
```
so route handlers never call the MSG91 or Brevo SDKs directly — swapping either vendor later is a one-file change, and this is exactly why the interface was split from day one instead of hard-coding one vendor's SDK into every route.

**What gets built:**
- `POST /api/otp/request` — accepts phone or email, generates a 6-digit code, stores it (hashed, short TTL) against the in-progress `donation_submission`, sends via MSG91 (SMS) or Brevo (email OTP), depending on channel.
- `POST /api/otp/verify` — checks code, sets `donation_submissions.otp_verified_at`, rejects submission finalization until this is set.
- Transactional email (Brevo) triggered on: donation submission received, submission approved/rejected, partner application received/approved, allocation completed (donor "your item found a home" notification — ties into Wall of Love).
- Broadcast email (Brevo, new): "new item available" style sends to a donor/subscriber list — needs a subscriber list concept that doesn't exist in the schema yet (donors today are only captured per-submission, not as a standing mailing list — worth a decision on whether donors are auto-subscribed or opt in separately).
- Rate-limit `/api/otp/request` per phone/email (e.g. 3 requests / 10 min) — this endpoint is the one most likely to get abused for SMS-pumping if left open.

**Inputs still needed from you/Sheetal:**
- **Brevo account** + verified sending domain (reloved's domain, once DNS is available per the SOW's "Access" requirement).
- **MSG91 account** — sender ID + DLT template registration for SMS (this has lead time, start it early, it's the one part of this whole plan that isn't a coding task and can't be rushed the night before launch).

---

## Frontend changes required

Replace direct Firebase SDK calls with `fetch`/API calls in:
- [Give.tsx](../src/pages/public/Give.tsx) — `handleSubmit` posts to `/api/donations` with real files instead of `setDoc`
- [ItemDetail.tsx](../src/pages/public/ItemDetail.tsx), [Track.tsx](../src/pages/public/Track.tsx)/`TrackDetail.tsx`, `Love.tsx` — read via `GET /api/...` instead of `firebase/firestore` queries
- [StaticPages.tsx](../src/pages/public/StaticPages.tsx) — `Partner` posts to `/api/partner-applications`, `Contact` posts to `/api/contact` (both currently call `setDoc` straight to Firestore, same pattern as `Give.tsx`)
- `MapPage.tsx` / `KindnessMap` — blocked on the geocoding gap above; can't just swap the data source until localities resolve to coordinates
- [AdminDashboard.tsx](../src/pages/admin/AdminDashboard.tsx) — metrics from `GET /api/admin/metrics`, plus net-new screens for submission/item review, partner-application review, and allocation matching (none of this UI exists yet — see gap #6 above)
- `src/lib/firebase.ts` — keep only the `auth` export (admin login); drop `db`/`storage` (Firestore/Firebase Storage) once Postgres + disk storage are live
- `src/lib/seed.ts` — becomes a Prisma seed script (`prisma/seed.ts`) instead of a Firestore seeding function

---

## Timeline reality check

The SOW's approval gate says branding was due 14-15 Aug and the site live 20 Aug — **tomorrow**, relative to today (19 Aug 2026). A backend + Postgres migration + real image pipeline + OTP + email is not a same-day build. Options:

- **Ship the current Firestore-direct version for the 20 Aug date** (tighten `firestore.rules` at minimum — the open `allow read, write: if true` is the single highest-risk item to fix even without a full rewrite), and do this backend migration as a fast-follow in the days after launch.
- **Or slip the backend-migration work past 20 Aug** and treat tomorrow's launch as running on the current Firestore setup, accepting its gaps (fake image persistence, no OTP/email) as known limitations for pilot week one.

Either way, two changes worth making *before* launch regardless of everything else in this plan: lock down `firestore.rules`, and fix image uploads to actually persist somewhere (even a quick Firebase Storage wire-up, if the full backend isn't ready in time).

---

## Open decisions still needed

1. **Hosting target** for the new backend (VPS vs serverless) — determines whether local-disk storage is safe as designed above.
2. **MSG91 account** — DLT sender registration for SMS + sending-domain verification for email, both under the one account — start ASAP since DLT approval has lead time.
3. **Launch sequencing** — ship current Firestore version tomorrow and migrate after, or delay launch for the rewrite.
4. **SEO strategy** — this is an explicit SOW deliverable and unaddressed so far. The SPA has no per-page metadata today. Cheapest fix that still satisfies "item pages are indexable": server-render just the `<head>` meta tags (title/description/OG image = first item photo) for `/items/:slug` on the Express side while the rest stays client-rendered React — short of a full SSR framework migration, which isn't realistic on this timeline.
5. **Anti-spam on public forms** — decide whether to wire up reCAPTCHA (site key slot already exists, unused, in `firebase-applet-config.json`) alongside rate-limiting, given every public POST endpoint is open to the internet with no login.
6. **Locality → coordinates** — decide how localities get geocoded for the map: a maintained lookup table of ~15-20 known Mumbai localities (fast, no external API dependency) vs. a geocoding API call at submission time (handles anything typed, adds a third-party dependency and cost).

---

## Verification plan (once building starts)

- Prisma migrations applied to a local Postgres (`docker compose up` for Postgres in dev) — `npx prisma migrate dev` creates real tables from schema.
- Seed script populates the same 12 mock items currently in `seed.ts`, now as real rows + real placeholder image files on disk.
- Manual pass through `Give.tsx` end-to-end with a real photo: confirm the file lands in `uploads/`, is resized/EXIF-stripped, and the resulting URL renders in `ItemDetail.tsx`.
- Admin login → approve a submission → confirm it appears on the public Wall (`public_visibility=true`) and an `audit_events` row was written.
- Hit `/api/admin/*` without a Firebase token → expect 401, confirming the open-access hole from `firestore.rules` is actually closed.

---

## Take-item flow (individual requester, separate from partners)

Partners (NGOs/delivery orgs) and individual "take" requesters are deliberately two different systems — partners run bulk allocations via `PartnerNeed`/`Allocation`; a logged-in donor account can also request one specific item directly for themselves via the new `ItemRequest` model.

- **Schema**: `item_requests` table (`backend/prisma/schema.prisma`) — `itemId`, `requesterTarget` (donor session uid), name/phone/address, optional `note`, optional `photoStoragePath`, `status` (pending/approved/rejected), `reviewedAt`.
- **Donor routes** (`backend/server/routes/donor.ts`): `POST /api/donor/item-requests` (multipart, optional photo, 409s if the item isn't `available`; on success flips `item.publicStatus` to `being_matched`) and `GET /api/donor/item-requests` (caller's own requests).
- **Admin routes** (`backend/server/routes/admin.ts`): `GET /api/admin/item-requests?status=` and `PATCH /api/admin/item-requests/:id` (approve → item goes `reloved`; reject → item goes back to `available`), both audit-logged.
- **Frontend**: `ItemDetail.tsx` has a "Take this item" button gated behind donor login (`/account/login?redirect=...`), a request form (name/phone/address/note/optional photo, prefilled from the donor profile), and a confirmation popup stating admin review takes 24-48 hours. A separate "NGO / delivery partner?" button keeps the old partner-application explainer, now with copy clarified that the two flows are unrelated. A "Need help?" button opens an outreach form that posts to the existing `/api/contact` endpoint. Admin gets a new "Take Requests" page (`AdminItemRequests.tsx`) to approve/reject by hand.
- **Verified end-to-end** (2026-08-20) via direct API calls: OTP verify → donor session → onboarding → item-request create → item flips to `being_matched` → admin approve → item flips to `reloved` + audit event written; separately, admin reject → item releases back to `available`; re-requesting an already-taken item correctly 409s. Frontend typechecks clean and pages serve without compile errors; full click-through browser testing wasn't done (no browser automation tool available in this environment).
