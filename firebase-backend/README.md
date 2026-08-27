# Firebase / Firestore backend (separate from Express)

This folder is a **new** Reloved API on **Firebase Cloud Functions + Firestore**.

It does **not** modify or replace `backend/` (Express + Prisma + Postgres on Lightsail).
Both can run in parallel until you point the frontend at this API.

## Branch

Work lives on: `feature/firebase-firestore-backend`

## What’s implemented (v1)

| Endpoint | Status |
|----------|--------|
| `GET /api/health` | Done |
| `GET /api/items?status=wall\|available\|reloved` | Done (Firestore) |
| `GET /api/items/:slug` | Done |
| `POST /api/waitlist` | Done |
| OTP / donations / claims / admin / rembg | Next |

Response shapes match the existing frontend contract where possible.

## Setup

```bash
cd firebase-backend/functions
npm install
npm run build
```

### Local emulators

```bash
cd firebase-backend
firebase emulators:start --only functions,firestore --project reloved-digital
```

API base (emulator): `http://127.0.0.1:5001/reloved-digital/asia-south1/api`

Example:

```bash
curl http://127.0.0.1:5001/reloved-digital/asia-south1/api/api/health
```

(Note the double `/api` — Functions URL prefix + Express `/api` routes.)

### Seed sample wall items (emulator)

```bash
cd functions
set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
set GOOGLE_CLOUD_PROJECT=reloved-digital
npm run seed:wall
```

### Deploy (Blaze plan required)

```bash
cd firebase-backend
firebase deploy --only functions,firestore,storage --project reloved-digital
```

Live URL will look like:

`https://asia-south1-reloved-digital.cloudfunctions.net/api`

Then set frontend `VITE_API_URL` to that URL when you’re ready to cut over.

## Project isolation

| Path | Role |
|------|------|
| `backend/` | Current production Express API (unchanged) |
| `firebase-backend/` | New Firestore API (this folder) |
| `frontend/` | Still points at Lightsail until you change env |

## Collections (Firestore)

- `items`
- `waitlistSignups`
- `donorProfiles` (planned)
- `donationSubmissions` (planned)
- `itemRequests` (planned)
