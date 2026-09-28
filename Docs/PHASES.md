# Phases

This is the only sequence we follow. Say "Phase 2" and this file is what that means.

You implement and watch it **on your machine first**. The same Docker image is what later runs on the server. Live `reloved.digital` stays on cPanel + Cloud Functions until Phase 6.

Firestore and Cloud Storage stay on Google. Shared web hosting is not the API host. No Kubernetes.

**Bars:** 1,000 concurrent is the minimum. 1,500 is the target. 2,000 is the stress test. Those numbers are measured on the server in Phase 5, not on a laptop.

```text
Phase 0  Local API fixes, run with Node
Phase 1  Local polling fixes, run with Vite
Phase 2  Docker on your machine, same image the server will run
Phase 3  That Docker stack on the VPS, preview only
Phase 4  Worker container for photos and mail
Phase 5  Measure the VPS
Phase 6  Point reloved.digital at the VPS
Phase 7  Fix only what the test broke
```

---

## Phase 0 — Local API fixes, run with Node

**Where:** your PC. `firebase-backend/functions/local-server.js` on port 8787. It already calls `createApp()`.

**Do**

- Timeouts on Brevo, MSG91, Borzo, Shiprocket, Shadowfax, Edesy, Short.io, remove.bg, and image fetch.
- Build the Express app once per process, not on every request.
- Health check reads Firestore and returns no template secrets.
- One log line per request: status and duration. No bodies, no query strings.
- Per-instance rate limit on photo analyze, OTP request, and contact.
- Add the missing Wall index in the repo. Cap the admin repair read. Refuse to sign tokens if `JWT_SECRET` is empty when a production flag is set.
- Point the local Vite app at `http://127.0.0.1:8787`.

**Do not**

- Do not deploy.
- Do not change DNS.
- Do not add Docker yet. First see the API boot the way it does today.

**Done when**

- `GET http://127.0.0.1:8787/api/health` returns ok against the Firestore you pointed it at.
- A forced hung vendor call ends in seconds.
- Local smoke: login, Wall, Give, claim.

---

## Phase 1 — Local polling fixes, run with Vite

**Where:** your PC. `frontend` dev server. API is still Phase 0 on port 8787.

**Do**

- Navbar and notification polls: 20–30s, only while the tab is visible, skip if a request is already in flight.
- Dashboard refresh: 20s, paused while hidden or while the profile form is being edited.
- Chat poll: skip while the tab is hidden. Do not overlap requests.

**Do not**

- Do not change the API contract.
- Do not deploy to cPanel yet.

**Done when**

- A hidden local tab stops calling `/api/donor/notifications`.
- Two local browsers still see a new claim within 30 seconds.

---

## Phase 2 — Docker on your machine

**Where:** your PC. This is the package that Phase 3 copies to the server. No PM2. No Kubernetes.

**Do**

- One API image: Node 22, boot `local-server.js`, listen on 8787 inside the container.
- One Nginx image (or the official Nginx image plus a config): serves the Vite `dist`, serves `/images/`, proxies `/api/` to the API container.
- `docker-compose` brings up `nginx` + `api`. Env file and the Firebase service account are mounted, not baked into the image.
- Same `JWT_SECRET` as production if you point at the live Firestore, so you do not mint a second kind of token.
- Reproduce Phase 0 and Phase 1 through the compose URL, not through `node` and `vite` directly.

**Do not**

- Do not put secrets in the Dockerfile.
- Do not publish the image to a public registry with the env file inside it.
- Do not change DNS.

**Done when**

- `docker compose up` on your machine serves the SPA and `GET /api/health`.
- Login, Wall, Give, and claim work through Nginx.
- Stopping the API container leaves Nginx up and returns a clear 502, not a hung browser tab.

---

## Phase 3 — That Docker stack on the VPS, preview only

**Where:** a VPS (Hostinger KVM or any other VPS). `reloved.digital` still points at cPanel `118.139.180.238`.

**Do**

- Planning size: 4 vCPU, 8 GB RAM. Use less only if you already know photos are not on the API process.
- Install Docker only. Run the same compose file as Phase 2.
- Copy `public_html/images/` into the Nginx image volume so `/images/wall-items/...` still works.
- Open ports 22, 80, 443. API stays on the Docker network, not on a public port.
- HTTPS on Nginx for a preview name (`preview.reloved.digital`).
- Same Firestore, same `JWT_SECRET`.

**Do not**

- Do not use Hostinger shared hosting for this.
- Do not change the `reloved.digital` A record.
- Do not create a new database.
- Do not rotate `JWT_SECRET`.

**Done when**

- Preview URL: login, Wall, Give, claim, giver accept, and one known wall image.
- Users on `https://reloved.digital` see no change.

---

## Phase 4 — Worker container for photos and mail

**Where:** add a `worker` service to the same compose file. Prove it locally (Phase 2 machine), then run that compose on the VPS preview.

**Do**

- Photo cutout/polish and non-OTP email and SMS run in the worker container.
- OTP stays on the API. The user is waiting for the code.
- Claim transaction stays on the API.
- Nginx proxy timeout to the API is 60s. The worker can run longer.

**Do not**

- Do not point public DNS here yet.
- Do not add Redis unless Phase 5 shows a hot key.

**Done when**

- A Give on the preview host returns without waiting for Gemini.
- The item still reaches `ready`.
- Stopping the worker container does not take down Wall or login.

---

## Phase 5 — Measure the VPS

**Where:** k6 against the preview host. The laptop is not this test.

**Do**

- 100, 250, 500, 750, 1,000, 1,500, and 2,000 concurrent users.
- Record RPS, P50, P95, P99, error %, CPU, memory, container count, Firestore reads and writes.
- Cap Gemini at a few virtual users. Do not send real OTP through MSG91.

**Do not**

- Do not change DNS in this phase.
- Do not resize the VPS in the middle of the run.

**Done when**

- 1,000 and 1,500 meet: error rate under 1%, P95 under 1.5s, health stays 200.
- 2,000 is recorded, pass or miss.
- CPU at 1,500 is not stuck at the ceiling.

**Go / no-go**

- Both gates pass: Phase 6 may start.
- Either gate fails: leave `reloved.digital` on cPanel. Fix the compose. Repeat Phase 5.

---

## Phase 6 — Point reloved.digital at the VPS

**Where:** DNS. The running stack is the Phase 4 compose on the VPS.

**Do**

- One day before: set DNS TTL to 300 seconds.
- Build the SPA so its API base is `https://reloved.digital` (Nginx `/api`).
- Put that build in the Nginx volume. Images are already there from Phase 3.
- Change the `reloved.digital` A/AAAA record to the VPS.
- Leave Cloud Functions and the cPanel account in place for 48 hours.

**Do not**

- Do not delete the old host in those 48 hours.
- Do not change `JWT_SECRET`, Firestore, or photo URL shapes in the same cut.

**Done when**

- `https://reloved.digital` is the Docker stack.
- Login, Wall, Give, and claim work for a real account.
- Error rate and P95 stay inside the Phase 5 gates for the first day.

**Rollback**

- Point DNS back to `118.139.180.238`.
- The old SPA still calls Cloud Functions. Sessions stay valid if the JWT secret did not change.

---

## Phase 7 — Fix only what the test broke

**Where:** the compose file or the code, for the rung Phase 5 failed. Nothing else.

**Possible work, only if the numbers say so**

- A second API container, or a larger VPS.
- A cheaper notification query.
- A short cache for the anonymous Wall.
- Slower polling.
- Redis as another compose service, only for a key that hot-spotted.

**Do not**

- Do not rewrite Give / Claim / match.
- Do not split into microservices.
- Do not move off Firestore.
- Do not add Kubernetes.

**Done when**

- The failing rung from Phase 5 is re-run and either passes or has a written limit we accept.
- Verified capacity is that measured rung, not a plan number.
