# Prompt — plan Reloved backend on cPanel

Copy everything inside the box below and send it to the person (or AI) who should produce the hosting plan.

---

```
You are a senior Node.js + cPanel hosting engineer. Create a practical deployment PLAN (not code yet) for running the Reloved backend on our existing cPanel hosting. Do not deploy anything. Audit the stack against typical shared cPanel limits, list exact specs we must have on the plan, flag blockers, and give a step-by-step go-live plan with fallbacks.

==================================================
1. PROJECT
==================================================
Product: reloved (https://reloved.digital)
What it is: Phase 1 “Digital Wall of Kindness” — donors give preloved items for free; partner organisations (ashrams/NGOs) receive them. Public site + admin ops.

Current live frontend: already deployed on Firebase Hosting at https://reloved.digital (Vite + React SPA).
What we need on cPanel: the BACKEND API only (and optionally mailboxes). The React site can stay on Firebase. Preferred public API hostname: api.reloved.digital (or a reverse-proxy path if a subdomain is not possible).

We have already purchased:
- Domain: reloved.digital — ₹398/year (GoDaddy)
- Web hosting (cPanel) — ₹2,388/year
We want this cPanel account to run the Node API, the database, item photo storage, and @reloved.digital mailboxes so we do NOT need Google Cloud Run, Cloud SQL, or Cloud Storage.

==================================================
2. BACKEND STACK (what we actually built)
==================================================
Runtime
- Node.js 22 (Dockerfile uses node:22-slim). Minimum acceptable on host: Node 18+, but 20 or 22 preferred.
- TypeScript, compiled with esbuild to a single dist/index.js (ESM, "type": "module").
- Process manager: a long-running Node process. Locally it listens on PORT 8787. On cPanel this is usually “Setup Node.js App” + Phusion Passenger, or a persistent Node app. PHP-only hosting will NOT work.

Framework / libraries
- Express 4 — REST API under /api
- CORS enabled (frontend on reloved.digital must be allowed to call the API)
- express-rate-limit — public write endpoints (donations, partner apply, contact, OTP)
- Zod — shared request validation (frontend and backend share schemas from a sibling /shared folder)
- Prisma 6 ORM — currently provider = postgresql, DATABASE_URL env var
- multer — multipart uploads, max 8MB per file, max 5 files per request
- sharp — resize, strip EXIF, re-encode uploads to WebP (~300KB each)
- jose — verify Firebase Auth ID tokens on /api/admin/*
- dotenv — environment variables

Database (today)
- PostgreSQL 16 (local docker: postgres:16-alpine)
- Prisma schema with these tables:
  profiles, donation_submissions, items, item_images, partner_applications,
  partners, partner_needs, allocations, allocation_items, evidence_records,
  audit_events, app_settings, contact_messages, otp_codes
- UUID primary keys, foreign keys, cascade deletes
- Migrations via Prisma (`prisma migrate deploy` in production, NOT `prisma migrate dev`)
- If cPanel only has MySQL/MariaDB (typical): the PLAN must include switching Prisma datasource from postgresql → mysql/mariadb, regenerating migrations, and verifying UUID / DateTime behaviour. Prefer native PostgreSQL on the host if it exists.

File storage
- STORAGE_DRIVER=disk (this is the cPanel path — do NOT use Google Cloud Storage)
- Photos written to ./uploads/{entity}/{uuid}.webp
- Served as static files at /uploads
- Disk must persist across restarts and deploys (shared hosting disk is fine; ephemeral/container disk is not)
- Need write permission, a backup story for uploads/, and enough quota (Phase 1 target ~50 items now; ~15,000 photos ≈ 5GB later)

Auth
- Public donor/partner/contact flows: NO login
- Admin panel: Firebase Authentication (email/password). Backend verifies the ID token against FIREBASE_PROJECT_ID (Firebase project: reloved-digital)
- DEV_ADMIN_BYPASS must be false in production

Outbound integrations (API keys in env; they call HTTPS APIs, so the server needs outbound internet)
- Brevo — transactional email (submission confirmations, contact, admin notifications). Env: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME
- MSG91 — OTP SMS (India DLT). Env: MSG91_AUTH_KEY, MSG91_SMS_TEMPLATE_ID
- If keys are unset, the app logs OTPs/emails to console instead of sending (dev fallback). Production should have keys.

Frontend coupling
- React SPA already live on Firebase Hosting
- It calls fetch(`${VITE_API_URL}/api/...`) and images via `${VITE_API_URL}/uploads/...`
- After backend is live we will rebuild the frontend with VITE_API_URL=https://api.reloved.digital (or whatever URL you recommend)
- HTTPS + valid SSL on the API host is required (mixed-content will break the live site)

==================================================
3. FEATURES THE BACKEND MUST SUPPORT ON CPANEL
==================================================
Public API (unauthenticated, rate-limited)
- POST /api/otp/request and /api/otp/verify (email or SMS OTP)
- POST /api/donations — photo-first Give flow, multipart + JSON fields, creates donation_submissions + items + item_images, optional OTP gate
- GET /api/items and GET /api/items/:slug — Wall of Kindness / item detail
- GET /api/track/:reference — donor tracking
- POST /api/partner-applications
- POST /api/contact
- GET /api/health

Admin API (Firebase ID token required)
- Dashboard metrics
- Review/approve/reject donation submissions
- Edit items, upload more photos
- Partner applications → partners
- Partner needs
- Allocations (match items to partners) + completion evidence photos
- Contact message inbox
- Audit log on admin mutations

Other behaviour
- Image pipeline: sharp must work (native binary). If the host libc/Node ABI cannot run sharp, the plan must say so and propose a workaround (prebuilt binary, disable native compile, or different host).
- Static /uploads must be publicly readable over HTTPS
- NODE_ENV=production
- Shared sibling package: backend imports ../shared/schemas.ts — build must include that folder (we already esbuild-bundle it into dist/index.js; production start is `node dist/index.js` after `npm run build`)

==================================================
4. SPECS WE NEED YOU TO CONFIRM ON THIS CPANEL PLAN
==================================================
Please answer YES / NO / LIMIT for each, with the actual number where relevant:

A. Node.js
- Is “Setup Node.js App” / Passenger / long-running Node allowed? (PHP-only = dealbreaker)
- Available Node versions (we need 18+, prefer 20 or 22)
- Can the app keep running 24/7 (not a cron-started script that dies)?
- Memory limit for the Node process (sharp + Express: recommend ≥ 512MB; 1GB better)
- CPU throttling / simultaneous process limits
- Can we set PORT, or does Passenger inject it?

B. Reverse proxy / domain
- Can we attach api.reloved.digital (subdomain) with AutoSSL / Let’s Encrypt?
- Reverse proxy from HTTPS :443 → the Node app?
- WebSockets not required
- Allowed to set CORS and custom headers?

C. Database
- MySQL/MariaDB version? Max size, max connections, remote vs localhost only?
- PostgreSQL available? If yes, version (we developed on Postgres 16)
- Can we create a dedicated database + user for `reloved`?
- Backup / phpMyAdmin or pgAdmin access?

D. Disk & uploads
- Disk quota and inode limit
- Can Node write to a folder like ~/reloved-backend/uploads and serve it?
- Persistence guaranteed (not wiped on app restart)?
- Recommended backup method for uploads + database

E. Native modules
- Can npm install compile or use prebuilds for `sharp` (libvips) and `@prisma/client` engines?
- SSH access? (strongly preferred for `npm ci`, `npx prisma migrate deploy`, logs)
- Git pull from repo, or only cPanel File Manager / ZIP upload?

F. Outbound network
- Can the server call https://api.brevo.com and https://control.msg91.com ?
- Any firewall / SMTP restrictions? (we send mail via Brevo HTTPS API, not local sendmail — but cPanel mailboxes are still wanted for sheetal@ and hello@reloved.digital)

G. Email (cPanel)
- Can we create 2 mailboxes: sheetal@reloved.digital and hello@reloved.digital?
- MX records: site is on Firebase Hosting; domain DNS is at GoDaddy. Plan must say how MX for mail + A/CNAME for api.reloved.digital + existing Firebase A/ALIAS for the apex domain coexist without breaking the live website.

H. SSL & security
- AutoSSL on the API subdomain
- .env stored outside web root (not publicly downloadable)
- Ability to force HTTPS
- Recommended file permissions for uploads and .env

I. Limits that affect this app
- Max request body / upload size (we need at least 8MB × 5 files ≈ 40MB request, plus JSON)
- Timeout for slow sharp processing
- Daily inode / process / email sending limits (email sending is via Brevo, not cPanel SMTP, except mailbox IMAP/POP)

==================================================
5. WHAT THE PLAN YOU PRODUCE MUST CONTAIN
==================================================
Write a deployment plan with these sections:

1. Verdict
   - Can this cPanel plan run this backend as-is? Yes / Yes with changes / No.
   - If No, what minimum plan upgrade (VPS / CloudLinux Node / PostgreSQL add-on) is required?

2. Target architecture diagram (text is fine)
   - Browser → Firebase Hosting (reloved.digital) → API on cPanel (api.reloved.digital)
   - API → MySQL or Postgres on localhost
   - API → disk ./uploads
   - API → Brevo + MSG91 over HTTPS
   - Admin login → Firebase Auth → Bearer token to API
   - Mailboxes on cPanel, MX at GoDaddy, website DNS unchanged

3. Gap list
   - PostgreSQL vs MySQL (and the Prisma migration work if MySQL)
   - sharp native binary
   - Node app runner
   - Anything else

4. Exact server requirements (minimum vs recommended)
   - Node version, RAM, disk, DB type/version, SSL, SSH, upload size, outbound HTTPS

5. DNS plan for GoDaddy
   - Keep existing records that point the website to Firebase Hosting
   - Add api.reloved.digital → cPanel
   - Add MX/SPF/DKIM for cPanel mail without breaking Firebase
   - Optional: www

6. Environment variables to set on the host
   Copy and fill:
   NODE_ENV=production
   PORT=<passenger or assigned>
   DATABASE_URL=<the connection string you recommend>
   STORAGE_DRIVER=disk
   FIREBASE_PROJECT_ID=reloved-digital
   BREVO_API_KEY=
   BREVO_SENDER_EMAIL=no-reply@reloved.digital
   BREVO_SENDER_NAME=reloved
   MSG91_AUTH_KEY=
   MSG91_SMS_TEMPLATE_ID=
   REQUIRE_OTP_FOR_DONATIONS=false   (until MSG91 DLT is live)
   DEV_ADMIN_BYPASS=false

7. Build & start commands
   We build with:
     npm ci
     npx prisma generate
     npm run build          # esbuild → dist/index.js
     npx prisma migrate deploy
     npm run start:built    # node dist/index.js
   Adapt these to cPanel Node.js App (application root, startup file, passenger).

8. Step-by-step go-live checklist
   Ordered list a non-DevOps person can follow: create DB, upload code, env, migrate, start app, SSL, DNS, smoke-test /api/health, then we will point the frontend VITE_API_URL and redeploy Firebase.

9. Backup & operations
   - Daily DB dump
   - Backup uploads/
   - How to restart the Node app
   - Where logs live
   - How to deploy an update without downtime if possible

10. Risks at scale
    - Shared cPanel is for pilot / low thousands of MAU
    - When to move to a VPS (roughly 5,000–10,000 MAU or if sharp/CPU throttles)
    - This is NOT a reason to stay on Cloud Run unless cPanel cannot run Node

11. Open questions for us (the client) if anything is still unknown
    Ask us only what you cannot infer.

==================================================
6. CONSTRAINTS
==================================================
- Do not recommend Google Cloud Run / Cloud SQL unless cPanel is proven incapable.
- Do not take down https://reloved.digital while planning DNS.
- Production must never enable DEV_ADMIN_BYPASS.
- Do not store secrets in the repo or in a public_html path.
- Prefer the smallest change that works (MySQL + Prisma provider switch is acceptable if Postgres is unavailable).
- Output the plan in clear numbered sections. No generic “install Node” advice — tie every step to THIS stack.
```
