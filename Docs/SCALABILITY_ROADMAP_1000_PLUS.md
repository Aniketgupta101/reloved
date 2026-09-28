# 1000+ User Scalability Implementation Roadmap

**Status:** planning only. No production code was changed for this file.
**Date:** 28 Sep 2026.

This is the master sequence. Detail lives in:

- `docs/SYSTEM_DESIGN_1000_USERS.md` — current system and the target shape.
- `docs/SCALABILITY_PHASE_0_HOTFIX.md` — what to change before any new service.

```text
CURRENT SYSTEM
  → Phase 0 hotfixes
  → measure 100 … 2,000
  → only the changes that measurement justifies
  → measure again
  → harden what the 1,000–2,000 run actually broke
```

---

## 1. Targets

**1000+ users is not the same thing as 1,000 concurrent users, and neither is a request rate.**

| Term | Meaning for Reloved |
|---|---|
| Registered users | Accounts in `donorProfiles`. A later state of 10,000 registered users is a Firestore storage question. It is not the load test. |
| Concurrent users | Browsers with the SPA open. This is the k6 virtual-user count. |
| RPS | What those browsers send. Wall reads, 8s notification polls, Give, and Claim turn one open tab into a different rate. |
| Heavy operations | Gemini cutouts, courier calls, email. A handful of these can pin Cloud Function instances while RPS still looks small. |

| Role | Concurrent users |
|---|---|
| Business target | **1000+**. 1,000 is the **minimum**, not the maximum. |
| Primary engineering target | **1,500** |
| Stress / headroom | **2,000** |
| Verified capacity | **Unknown until load testing** |

Reaching 1,000 concurrent users must leave room for a traffic spike, a slow external API, retries, and background photo work. The design does not buy a second copy of the stack to create that room. Headroom is a short API, a capped `maxInstances`, and a queue for work that does not belong on the request. Those pieces are added only when a test shows they are the limit.

---

## 2. Capacity model

Planning assumptions (not measurements): 70% of concurrent users are logged in, notification poll moves from 8s to 20s, dashboard poll moves to 20s, chat stays at 6s, Wall is about 0.05 reads per concurrent user per second, and a spike is 1.5× that mix. Photo jobs are **not** included in the RPS column. They are extra instance time.

| Load | Purpose | Approx steady API RPS after poll backoff | Approx with a 1.5× spike |
|---:|---|---:|---:|
| 100 | Baseline | ~15 | ~20 |
| 250 | Early validation | ~35 | ~55 |
| 500 | Medium load | ~70 | ~105 |
| 750 | High load | ~105 | ~160 |
| 1,000 | Minimum production target | ~140 | ~210 |
| 1,500 | Primary scalability target | ~210 | ~315 |
| 2,000 | Stress / headroom test | ~280 | ~420 |

If the navbar keeps polling every 8s and every tab is logged in, notifications alone are about **125 / 188 / 250 RPS** at 1,000 / 1,500 / 2,000. That is a code bug, not an infrastructure shortage.

### What happens at each bar (hypothesis)

| Load | Hypothesis before any test |
|---|---|
| 1,000 | Minimum. Survivable for short requests after polling is slowed. **Today** the shared photo function and 8s polls can already fill instances here. |
| 1,500 | Primary target. Same shape, about 1.5× the RPS, plus spikes and vendor delay. This is the load the architecture is aimed at. |
| 2,000 | Stress. About 2× the 1,000 steady RPS. The run is there to name the next bottleneck: instances, Firestore reads, the notification query, or Gemini. |

A miss at 2,000 does not mean the project failed. It means Phase 6 has a specific knob to turn. A pass at 1,000 with the process already at `maxInstances` means there is **no** headroom, and 1,500 is the number that matters.

---

## 3. Success criteria

Do not call the work done because "it handles 1,000 users."

| Bar | Concurrent users | Acceptable performance |
|---|---:|---|
| Minimum | 1,000 | Gates below |
| Target | 1,500 | Same gates |
| Stress | 2,000 | Record the next bottleneck. A miss is a finding. |

Gates for the minimum and the target (API routes, photo VUs capped so Gemini is not the whole test):

| Signal | Acceptable |
|---|---|
| Error rate | under 1% |
| P50 | recorded; investigate if it is over 800ms |
| P95 | under 1.5s |
| P99 | recorded; investigate if it is over 4s |
| RPS | recorded at every rung |
| Firestore reads and writes | recorded; a 5× jump between rungs is a query bug |
| Function instances | not pinned at `maxInstances` during the 1,500 hold |
| Memory | under 80% of the function limit |
| CPU | under 80% for the hold, with room for a spike |
| Queue backlog | not rising for 10 minutes, once a queue exists |
| External API latency | recorded per vendor; a timeout must fail the call, not hold the instance for 540s |

**Verified capacity is the highest rung that met the gates on a real k6 run.** Until that table is filled, verified capacity is unknown. Do not publish 1,500 or 2,000 as a fact.

---

## 4. Implementation sequence

### Phase 0 — Hotfixes

Follow `docs/SCALABILITY_PHASE_0_HOTFIX.md`.

Outbound timeouts, slower visible-tab polling, one Express app per instance, `minInstances: 1`, a real health check, request logs, a per-instance rate limit, the missing index. No worker, no Redis, no drop of the 540s function timeout while photo AI still runs inside `api`.

Then run the ladder in section 5 **once**, on that hotfix build. That first run is allowed to miss 1,500 and 2,000. Write down which route and which resource failed.

### Phase 1 — Only what the first run proved

Typical outcomes, picked from the run, not all of them:

- Photo and non-OTP email move to Cloud Tasks and one `worker` function (same repository). Then the API timeout can come down from 540s.
- Anonymous Wall snapshot, if `GET /api/items` dominated reads.
- A cheap unread count, if `/api/donor/notifications` dominated after the interval change.

Skip anything the run did not implicate.

### Phase 2 — Queries and lists that grew

Cursor pagination and narrower admin queries, if a list actually hit its cap or timed out. The public Wall is already limited. Do not add cursors as a ritual.

### Phase 3 — Security and abuse follow-ups

CORS allowlist, security headers, admin lockout. Low risk. Not the scaling lever.

### Phase 4 — Horizontal scaling, with headroom

Scale **out** on the platform that already exists: Cloud Functions instances behind the Google front end. There is no Nginx or Kubernetes step.

Headroom for 1,000 normal load **plus** a spike **plus** background jobs **plus** a slow vendor:

- `api` stays short (no Gemini on the request).
- `minInstances: 1` so cold starts are not the spike.
- `maxInstances: 20` stays the ceiling until a test sits on that ceiling.
- Worker concurrency stays small (cutouts are slow and expensive). Raise the worker max only if queue age grew during the 1,500 or 2,000 hold.
- Do not double memory, instances, or regions because 2,000 is on the plan. Cost-conscious means the next increment comes from a full instance graph or a full queue, not from a round number.

### Phase 5 — Load test

k6 on staging. Seed JWTs. Do not send thousands of real MSG91 OTPs. Cap Gemini at a few virtual users.

| Concurrent users | Purpose | Hold |
|---:|---|---|
| 100 | Baseline | 5 min |
| 250 | Early validation | 5 min |
| 500 | Medium load | 10 min |
| 750 | High load | 10 min |
| 1,000 | Minimum production target | 15 min |
| 1,500 | Primary scalability target | 15 min |
| 2,000 | Stress / headroom | 10 min |

For each level record RPS, successes, failures, P50, P95, P99, CPU, memory, function instance count, Firestore reads, Firestore writes, external API latency, queue depth, and worker time.

| Concurrent Users | RPS | P50 | P95 | P99 | Error % | CPU | Memory | Result |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 100 | | | | | | | | |
| 250 | | | | | | | | |
| 500 | | | | | | | | |
| 750 | | | | | | | | |
| 1000 | | | | | | | | |
| 1500 | | | | | | | | |
| 2000 | | | | | | | | |

The same empty table is in the system design (section 20) and the Phase 0 plan (section 12). Fill one run, copy the numbers. Do not invent them.

### Phase 6 — Harden from the 1,000–2,000 results

Phase 6 means: remove the bottleneck the test found between the minimum and the stress rung.

Possible outcomes:

- No change. 1,500 met the gates and 2,000's miss is an acceptable named limit.
- Tune Cloud Function `maxInstances` or memory, because the graph showed the cap.
- Raise worker capacity, because queue age climbed.
- Fix a Firestore query or add the anonymous Wall cache, because reads climbed faster than users.
- Slow polling further, because notifications were still the RPS.
- Add Redis, only if a single counter or cache key hot-spotted.
- Tighten external API use (fewer retries, a shorter campaign), because Gemini or a courier dominated latency.

Do not add Kubernetes, a second region, sharding, or a microservice split in this phase. Those are not on the list of things this codebase needs in order to see 2,000 concurrent users.

---

## 5. What stays out until a test demands it

| Item | Why it waits |
|---|---|
| Redis / Memorystore | Phase 0 rate limits are in-memory. Add Redis only after a hot key shows up at 1,500 or 2,000. |
| Kubernetes, Nginx, PM2 | Cloud Functions already runs more than one instance. |
| Microservices | Give, Claim, and match share one transaction and one JWT. |
| Multi-region and sharding | Mumbai traffic at this concurrency does not require them. |
| Claiming "2,000 concurrent users" in a status update | That sentence waits for a filled results row. |

---

## 6. Final summary

| | |
|---|---|
| Business target | **1000+ users** |
| Primary engineering target | **1,500 concurrent users** |
| Stress target | **2,000 concurrent users** |
| Verified capacity | **Unknown until load testing** |

The final verified capacity must come from actual measurements, not from this roadmap.
