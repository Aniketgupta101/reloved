# Reloved – Consolidated Optimization & Engineering Report

## Executive Summary

This report outlines the completed optimizations, stability enhancements, and critical security safeguards implemented across the **Reloved** platform (Frontend & Backend). 

* **Total Tracked Items:** 30
* **Completed & Verified:** 25
* **Pending / In-Progress:** 5

---

## 1. Frontend – Client & User Experience

### Critical Fixes

* **Prevent unsaved items from being deleted when a bulk drop partially fails** - Done
  * *Expected Outcome:* If some items succeed while others fail during a bulk drop, only the failed items remain in state, allowing users to retry immediately without losing photos, titles, or descriptions.

* **Disable delivery booking immediately upon first click with loading feedback** - Done
  * *Expected Outcome:* Buttons are disabled instantly upon submission with visible spinner states, preventing duplicate API calls, double bookings, and accidental duplicate billing.

* **Prevent multiple rapid Accept clicks on claim requests** - Done
  * *Expected Outcome:* Buttons are locked upon the first interaction to guarantee that an item is never granted to multiple recipients.

* **Assign unique idempotency keys per item group in bulk drops** - Done
  * *Expected Outcome:* In multi-item drop sessions, each item receives an isolated idempotency key so distinct garments never collapse into a single item.

---

### Image Processing & Presentation

* **Dual-image presentation architecture (Gemini Studio Modelled + Clean Isolated Cutout)** - Done
  * *Expected Outcome:* Visitors on `/drop/{slug}` view both an AI-styled ghost-mannequin photo (Image 1) and an isolated garment cutout centered on a pure white plate (Image 2), while preserving the raw original camera upload permanently for operational records.

* **Automatic iPhone HEIC/HEIF photo conversion** - Done
  * *Expected Outcome:* Native Apple camera photos (`.heic`/`.heif`) are automatically converted to standard formats, ensuring seamless cross-browser and cross-device compatibility.

* **Studio plate color normalization with light-garment protection** - Done
  * *Expected Outcome:* Garment cutouts are uniformly centered on pure white studio plates (`#FFFFFF`) with safeguards ensuring light, cream, or white garments are never bleached or erased into the background.

---

### Speed & Mobile Performance

* **Background photo compression with concurrency pooling and progress tracking** - Done
  * *Expected Outcome:* Large images are compressed in pools of two with real-time progress indicators, keeping mobile browser threads responsive and lag-free.

* **Client-side image resizing prior to transmission** - Done
  * *Expected Outcome:* Drastically reduces payload sizes before network transfer, accelerating uploads even on constrained 3G/4G connections.

* **Separated donation form inputs to eliminate keystroke re-renders** - Done
  * *Expected Outcome:* Input controls update independently through dedicated sub-components, providing fluid, lag-free typing on mobile keyboards.

* **Cursor-based Wall pagination for scalable infinite scrolling** - Done
  * *Expected Outcome:* The public Wall (`/drop`) loads in lightweight cursor-based batches rather than fetching the entire database collection at once.

* **Skeleton loading cards for the donor dashboard**
  * *Expected Outcome:* Replaces generic blank screens with animated card placeholders during initial account load.

---

### Mobile UX & Error Handling

* **Automatic local persistence of in-progress donation drafts** - Done
  * *Expected Outcome:* Draft listings are automatically preserved in local storage and can be resumed seamlessly after page refreshes, accidental navigation, or authentication redirects.

* **Actionable upload error feedback with inline retry capability** - Done
  * *Expected Outcome:* Displays clear, user-friendly error banners with one-tap retry options so users never have to restart the submission flow from scratch.

---

## 2. Backend – Server, Database & Security

### Critical Security & Financial Protection

* **Single-use authentication verification codes (OTP)** - Done
  * *Expected Outcome:* Once verified, login and transaction OTPs are consumed in an atomic database transaction and cannot be replayed.

* **Atomic enforcement of the 5-attempt rate limit** - Done
  * *Expected Outcome:* Incorrect verification attempts increment atomic database counters, preventing concurrent brute-force attacks from bypassing rate limits.

* **Strict exclusion of verification codes from API responses** - Done
  * *Expected Outcome:* Verification codes are strictly stripped from all outbound HTTP response bodies and error payloads.

* **Fail-closed courier webhook authentication** - Done
  * *Expected Outcome:* Courier callbacks (Borzo, Shiprocket, Shadowfax) require verified HMAC-SHA256 signatures and are rejected immediately if webhook secrets are missing or invalid.

* **Database concurrency lock on courier order creation** - Done
  * *Expected Outcome:* Enforces atomic time-window locking prior to courier booking, eliminating race conditions and duplicate dispatch orders.

* **Single-transaction claim approval locking** - Done
  * *Expected Outcome:* Claim approvals run inside isolated Firestore database transactions, ensuring two concurrent claimers cannot win the same listing.

* **Removal of hardcoded operational email addresses** - Done
  * *Expected Outcome:* Sensitive operational notifications and alerts are routed strictly to verified environment-configured channels rather than hardcoded developer mailboxes.

* **Listing withdrawal lock during active courier transit** - Done
  * *Expected Outcome:* Prevents givers or administrators from removing or cancelling a listing while a courier pickup or delivery is actively in progress.

* **Tamper-proof signed tokens for one-click email actions** - Done
  * *Expected Outcome:* Approval and operational action links dispatched via email utilize cryptographically signed tokens that fail closed if altered.

---

### Privacy & Data Protection

* **Automated PII scrubbing across peer-to-peer chat threads** - Done
  * *Expected Outcome:* Strips phone numbers, email addresses, specific apartment/flat numbers, and external social media links (WhatsApp, Instagram) from in-app chat.

* **Anonymized handover address masking** - Done
  * *Expected Outcome:* Courier manifests and public cards display neighborhood landmarks and building gates only, protecting donors' and claimers' private apartment numbers.

---

### Crash Prevention & Server Stability

* **Direct streaming of multipart image uploads to Cloud Storage**
  * *Expected Outcome:* Streams file buffers directly to storage buckets via write-streams to minimize server RAM pressure during heavy concurrent uploads.

* **Dedicated background task queuing for AI image processing** - Done
  * *Expected Outcome:* Asynchronous image enhancement and cutout pipelines run through managed background task workers, preventing job loss during server recycles.

* **Date-windowed indexing for daily operational courier lists** - Done
  * *Expected Outcome:* Replaces unindexed, arbitrary 400-item query limits with calendar-date filtering to guarantee every scheduled daily delivery is included.

* **Throttled AI concurrency pools (2–3 parallel workers)** - Done
  * *Expected Outcome:* Limits concurrent studio polish routines to small pools, preventing upstream API rate-limit spikes (HTTP 429) and gateway timeouts.

* **Deployment of composite database query indexes** - Done
  * *Expected Outcome:* Adds required composite Firestore indexes to eliminate full-table scans, reduce query latency, and prevent query timeouts.

---

### Speed & Database Efficiency

* **Batch-query optimization for the donor dashboard**
  * *Expected Outcome:* Consolidates iterative item queries into bulk chunked lookups to reduce individual document read counts and cloud costs.

* **Elimination of mutation writes on read-only public endpoints** - Done
  * *Expected Outcome:* Public catalog browsing endpoints remain strictly read-only, avoiding unnecessary database write contention.

* **Short-term caching (60s) for session authentication checks** - Done
  * *Expected Outcome:* Caches validated session epochs in memory for one minute, significantly reducing repetitive user verification database queries.

* **Shortened session token lifetime (rolling 2-week expiry)** - Done
  * *Expected Outcome:* Reduces legacy 1-year token lifetimes to rolling two-week sessions, mitigating token hijacking on abandoned or compromised devices.

* **Indian Standard Time (IST) operational calendar alignment** - Done
  * *Expected Outcome:* Daily scheduling filters and analytics aggregate according to `Asia/Kolkata` midnight boundaries rather than UTC.

---

### Automated Testing & Code Quality

* **Unified backend automated test suite** - Done
  * *Expected Outcome:* Enables one-command validation (`npm test`) across business logic, image pipelines, and privacy policies prior to deployment.

* **Regression test coverage for security and financial invariants** - Done
  * *Expected Outcome:* Automated test coverage validates webhook verification, lock timeouts, courier delivery states, and PII masking.

* **Continuous integration (CI) workflow execution on Pull Requests**
  * *Expected Outcome:* Runs automated test suites and linting checks on every pull request prior to merge.

* **Service-oriented modularization of backend routers**
  * *Expected Outcome:* Progressively refactors monolithic controller files into decoupled domain services for enhanced maintainability.

---

## 3. Session Update — October 1, 2026

### Borzo Delivery Integration (Production)

* **Production Borzo API activated** - Done
  * *Expected Outcome:* Live production credentials and endpoint configured and verified; account identity confirmed via a real API call, not a cached response.

* **Borzo webhook callback secured end-to-end** - Done
  * *Expected Outcome:* Callback URL registered in the production cabinet with matching HMAC secret; signature verification confirmed live.

* **Admin delivery booking controls added (Borzo + Shadowfax)** - Done
  * *Expected Outcome:* Admins can estimate, book, cancel, and track courier deliveries for either provider directly from Admin → Deliveries, with live order status and fee surfaced in the same view — no manual API calls required.

---

### Donor-Attribution Data Integrity Fix

* **Corrected misrouted claim notifications on a reassigned donation batch** - Done
  * *Expected Outcome:* A batch of items reassigned to a new giver had an incomplete update that left claim-notification emails/SMS routing to the previous giver. Identified and corrected across 26 items, 2 donor records, and 17 chat threads; future claims on these items now notify the correct person.

* **Wall-of-Kindness status reconciliation** - Done
  * *Expected Outcome:* Ran the existing status-repair routine to realign public listing status with live claim state; one stale listing corrected.

---

### Multi-Item Drop Email Consolidation

* **One consolidated email per bulk drop, not one per item** - Done
  * *Expected Outcome:* Single-item drops are unaffected. Multi-item drops now send exactly one branded email summarizing every item in the batch, instead of a separate email per garment — including batches with partial failures.

---

### Codebase Merge

* **Integrated teammate's feature branch** - Done
  * *Expected Outcome:* Merged incoming AI photo-analysis and Wall-of-Kindness cutout work into `client-handover`; one merge conflict resolved; full typecheck and test suite verified clean before deploying.

---

### Deployment

* **Production deployments verified live** - Done
  * *Expected Outcome:* All changes above built, typechecked, and deployed to `reloved.digital`, with live endpoint checks confirming each release.
