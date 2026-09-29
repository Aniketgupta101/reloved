# Admin Control Center local QA

**Purpose:** run the admin UI against visibly synthetic records. The demo project ID is `demo-reloved-admin`. The runner constructs a clean process environment and does not load the checkout's environment files.

## Start

1. Install Node 22+, Firebase CLI, dependencies in `frontend` and `firebase-backend/functions`, and JDK 21+ for the Firestore emulator. On this checkout, the isolated JRE is at `firebase-backend/.firebase/local-tools/jdk-21.0.12.1+1-jre/Contents/Home`; set `JAVA_HOME` to its absolute path before step 3.
2. From the repository root, run `npm --prefix firebase-backend/functions run build`.
3. Run `npm --prefix frontend run admin:local`. This first builds the frontend in production mode into the ignored `frontend/build/admin-local` directory, then starts Firestore (`127.0.0.1:8080`), Auth (`127.0.0.1:9099`), Storage (`127.0.0.1:9199`), Emulator UI (`127.0.0.1:4100`), the API (`127.0.0.1:8787`), and a production-built Vite preview (`127.0.0.1:3100`). Stop them together with Ctrl-C.
4. In another terminal, run `npm --prefix frontend run admin:local:seed`. The seed is idempotent and uses fixed `qa-*` document IDs. It will refuse to run unless all three emulator hosts and both project variables are set to the demo project by the script.
5. Open `http://127.0.0.1:3100/admin/login`; sign in with `admin@synthetic.invalid` / `synthetic-local-admin`. This is a real local JWT login, with a new random secret on each runner start. `VITE_DEV_ADMIN_BYPASS` is not used.

The local Vite configuration refuses production API origins, a courier proxy, a PostHog token, a non-demo Firebase project, or missing/non-loopback emulator hosts. It reads environment files from `frontend/scripts` only and refuses to start if any `.env*` file appears there. The local HTML removes GA/GTM, external font links, external image preloads and preconnects. Frontend analytics sends are off. The API process has no provider credentials and blocks non-loopback `fetch` and TCP sockets. This covers Brevo, MSG91, Edesy, Borzo, Shiprocket, Shadowfax and mirrored analytics. Normal `npm run build` retains production HTML and behavior.

Synthetic item images reuse existing same-origin catalog photos; identities and lifecycle records remain visibly fake. Admin Bricolage Grotesque and Manrope variable fonts are self-hosted under `frontend/public/fonts/admin` with their OFL licenses. No remote font request is needed. The fixture date is anchored to the current India day for today/tomorrow/overdue scenarios, so records are deterministic within a day.

## Checks

- `npm --prefix frontend run test:admin:ui` checks resource states, source/communication rendering, shell navigation, and registered routes.
- `npm --prefix frontend run test:admin:browser` uses the installed Google Chrome through Playwright against the running, seeded preview. It signs in through the real local JWT endpoint, checks API-to-UI metrics, photographs, refresh-failure stale data and recovery, ranges, attention categories, mobile keyboard navigation, and zero non-preview origins. It captures 1440, 390 and 320 proof under the ignored `frontend/qa-artifacts/admin-control-center/phase-1/` directory.
- `npm --prefix frontend run test:admin:local` checks project/host rejection and fixture coverage.
- `npm --prefix frontend run test:admin:local:integration` starts the demo emulators, seeds data, logs in, and checks the authenticated admin read contracts. Set `JAVA_HOME` to JDK/JRE 21+ first.
- `npm --prefix firebase-backend/functions run build` and `npm --prefix frontend run build` check compilation.
- For browser QA, reject any network request to a production API or provider origin. Only local API and emulator origins are acceptable for app actions.

If the Firebase CLI reports a JDK requirement, set `JAVA_HOME` to JDK/JRE 21+ and retry. Do not point the runner at `reloved-digital` or use live environment files as a workaround.

## Production-preview isolation

The runner passes the same synthetic-only environment to the build, preview, API and demo emulators. `ADMIN_LOCAL_QA=1` removes remote HTML tags during the actual production build; Vite preview forwards `/api` and `/uploads` to the loopback API. `VITE_API_URL` stays empty. Local output is separate from normal production `dist`, and preview binds strictly to loopback port 3100. A port collision stops the runner rather than selecting an unknown port. Existing processes on port 3000 are unrelated and must not be stopped. The browser assertion rejects every origin except `http://127.0.0.1:3100`, including requests made by globally mounted components.

The first proving slice includes Overview, Notifications and the authenticated shell. The other admin pages remain the existing implementation until their planned tasks. Their source links preserve entity IDs in query parameters; entity focus is completed in those page tasks. The 24h metric selector is a rolling window; the Today delivery board always uses the India calendar day. The 30-day option is intentionally withheld until meaningful historical coverage is verified. Notification pagination is a sequence of source scans: an empty scan with a cursor is not an empty inbox.

## Phase 1 verification — 2026-09-29

- Frontend TypeScript check and normal production build: pass. The isolated production build also passes and remains served on port 3100. Vite reports the existing large-bundle warning; no new bundle splitting is part of this slice.
- Backend TypeScript build: pass. Fixture regressions verify same-origin photos and confirmed synthetic addresses for booked/completed deliveries; missing-address cases remain intentional.
- Focused resource/render/navigation tests: 4 pass. Harness/network/fixture tests: 10 pass. New behavior was first exercised as failing tests for the missing navigation, routes, resource states, preview command plan and fixture details.
- Signed-admin browser flow: pass against the real local API and Firestore emulator. Captures include Overview and Notifications at 1440 and 390, menu interaction, stale refresh, and an additional 320px Overview. The final trace records 45 browser requests, all to the preview origin; zero unexpected origins and zero uncaught browser errors. `proof.json` contains the timestamp and checks. Desktop and mobile screenshots were inspected after reseeding corrected pickup/destination details.
- The flow asserts production asset URLs and absence of the Vite dev client/remote tracker HTML, real login gating, rendered KPI agreement with the endpoint, photo loading, range changes, attention filters, dated retained data on refresh failure, retry recovery, keyboard menu/escape/focus, viewport bounds and a registered delivery link.
- Wider viewport coverage, 200% text, final page journeys and complete-branch review remain Task 7. This proof is specific to the Phase 1 slice.
