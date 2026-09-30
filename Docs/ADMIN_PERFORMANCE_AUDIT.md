# Admin Control Center Performance Audit

Date: 1 October 2026  
Branch: `release/admin-dashboard`  
Integrated live baseline: `70047f275c4a2585eaef514dce44308ec4dfc019`

## Scope and method

Measurements were taken from the production-built frontend through the local live read-only adapter. Production access was limited to authenticated `GET` requests. No production mutation, provider booking, message send, call, or analytics capture was performed.

The cold measurements below include network time from the local development machine. They are useful for finding the critical path; they are not a production service-level objective.

## Before

### Live source requests

| Read endpoint | Duration | Response size |
| --- | ---: | ---: |
| Overview | 667 ms | 8,555 B |
| Analytics, 7 days | 1,280 ms | 12,159 B |
| Analytics, 14 days | 993 ms | 12,911 B |
| Drops/submissions | 3,162 ms | 252,725 B |
| Wall/items | 750 ms | 170,415 B |
| Claims/item requests | 613 ms | 65,965 B |
| Deliveries/orders | 802 ms | 17,667 B |
| Contact messages | 278 ms | 2,715 B |
| Support chats | 496 ms | 3,499 B |

### Critical path

The initial local Overview request took **5,668 ms** and returned **21,092 B**. The live adapter assembled its response by loading all nine admin collections and every loaded order's notification history. The slowest source was the 252 KB Drops response. This made the operations home wait for data used only on other routes.

### Frontend bundles

| Asset | Minified | Gzip |
| --- | ---: | ---: |
| Main JavaScript | 1,499.60 KB | 429.17 KB |
| Main CSS | 191.73 KB | 32.03 KB |
| MapLibre JavaScript | 763.38 KB | 207.64 KB |

Vite reported the main and MapLibre chunks above its 500 KB warning threshold.

## Changes made

1. The live read-only Overview now fetches only the operational Overview and selected range summary. It no longer waits for Drops, Wall, Claims, Deliveries, Support, or notification-history expansion.
2. The focused Overview result has its own bounded cache. The complete live bundle remains available to pages that need cross-collection relationships.
3. Analytics is loaded as a separate route bundle with an accessible loading state. Its chart CSS and JavaScript no longer block the initial operations route.
4. PostHog reads use a backend-only adapter with a short response cache and bounded timeout when server read credentials are configured.

## After

The first cold live read-only Overview request after the focused-loader change took **2,077 ms** and returned **7,842 B**. A second request served from the bounded local cache took **2 ms**. Compared with the 5,668 ms baseline, the cold critical path improved by **63%** while preserving the operational snapshot. Network conditions varied during both measurements, so the structural result matters most: Drops, Wall, Claims, Deliveries, Support and notification-history expansion are absent from the Overview request path.

The deliberately comprehensive Analytics snapshot took **5,465 ms** cold and **3 ms** from its bounded cache, returning **18,984 B**. Analytics loads only after entering its route; it does not block Overview. PostHog has a separate bounded request, timeout and 90-second cache, so a slow or unavailable PostHog query does not delay Firestore operational analytics.

### Frontend bundles after route splitting

| Asset | Minified | Gzip | Change from before |
| --- | ---: | ---: | ---: |
| Main JavaScript | 1,496.57 KB | 428.52 KB | -3.03 KB minified |
| Main CSS | 178.28 KB | 29.55 KB | -13.45 KB minified |
| Analytics JavaScript | 32.22 KB | 8.80 KB | loaded on Analytics only |
| Analytics CSS | 15.33 KB | 3.40 KB | loaded on Analytics only |
| MapLibre JavaScript | 763.38 KB | 207.64 KB | unchanged, route capability |

The live read-only build also strips capture-only analytics code and produced a 1,479.41 KB main JavaScript bundle (423.99 KB gzip). The live-review bundle is a safety build, not the deployable production artifact.

## Verification

- Frontend typecheck: passed.
- Frontend production build: passed; Analytics remained a separate route chunk.
- Admin UI and browser tests: 28/28 passed, including 390 px, 320 px and 200% text pressure.
- Live read-only tests: 32/32 passed.
- Local emulator/network safety tests: 10/10 passed.
- Backend tests: 54/54 passed.
- Privacy-safe live browser review: 28 screenshots plus one walkthrough video; zero write requests and zero unexpected remote requests.

## Remaining performance risks

- The main application bundle remains large because public and most admin routes are still eagerly imported. Wider route splitting should be handled as a separate measured change because it affects the complete public application.
- Drops and Wall live responses remain comparatively large. Cursor pagination is present in the Control Center contracts; the production read endpoints should keep bounded page sizes during deployment integration.
- MapLibre is intentionally isolated but still a large optional capability. Delivery list views remain usable while map code or map tiles are unavailable.
- Live source timing varies with network and production Firestore load. Recheck from staging after deployment before defining alert thresholds.
