# Admin Control Center local QA

**Purpose:** run the admin UI against visibly synthetic records. The demo project ID is `demo-reloved-admin`. The runner constructs a clean process environment and does not load the checkout's environment files.

## Start

1. Install Node 22+, Firebase CLI, dependencies in `frontend` and `firebase-backend/functions`, and JDK 21+ for the Firestore emulator. On this checkout, the isolated JRE is at `firebase-backend/.firebase/local-tools/jdk-21.0.12.1+1-jre/Contents/Home`; set `JAVA_HOME` to its absolute path before step 3.
2. From the repository root, run `npm --prefix firebase-backend/functions run build`.
3. Run `npm --prefix frontend run admin:local`. This starts Firestore (`127.0.0.1:8080`), Auth (`127.0.0.1:9099`), Storage (`127.0.0.1:9199`), Emulator UI (`127.0.0.1:4100`), the API (`127.0.0.1:8787`), and Vite (`127.0.0.1:3000`). Stop them together with Ctrl-C.
4. In another terminal, run `npm --prefix frontend run admin:local:seed`. The seed is idempotent and uses fixed `qa-*` document IDs. It will refuse to run unless all three emulator hosts and both project variables are set to the demo project by the script.
5. Open `http://127.0.0.1:3000/admin/login`; sign in with `admin@synthetic.invalid` / `synthetic-local-admin`. This is a real local JWT login, with a new random secret on each runner start. `VITE_DEV_ADMIN_BYPASS` is not used.

The local Vite configuration refuses production API origins, a courier proxy, a PostHog token, a non-demo Firebase project, or missing/non-loopback emulator hosts. It reads environment files from `frontend/scripts` only and refuses to start if any `.env*` file appears there. The local HTML removes GA/GTM, external font links, external image preloads and preconnects. Frontend analytics sends are off. The API process has no provider credentials and blocks non-loopback `fetch` and TCP sockets. This covers Brevo, MSG91, Edesy, Borzo, Shiprocket, Shadowfax and mirrored analytics. Normal `npm run build` retains production HTML and behavior.

Synthetic item image paths intentionally have no remote URLs; missing images in this fixture are expected. The fixture date is anchored to the current India day for today/tomorrow/overdue scenarios, so records are deterministic within a day.

## Checks

- `npm --prefix frontend run test:admin:local` checks project/host rejection and fixture coverage.
- `npm --prefix firebase-backend/functions run build` and `npm --prefix frontend run build` check compilation.
- For browser QA, reject any network request to a production API or provider origin. Only local API and emulator origins are acceptable for app actions.

If the Firebase CLI reports a JDK requirement, set `JAVA_HOME` to JDK/JRE 21+ and retry. Do not point the runner at `reloved-digital` or use live environment files as a workaround.
