# RELOVED — End of Project System Specification, Features & Services Reference

**Document Version:** 1.0.0  
**Project:** RE-LOVED (Mumbai's Digital Wall of Kindness)  
**Live Production URL:** [https://reloved-digital.web.app](https://reloved-digital.web.app) (Domain Mapping: `https://reloved.digital`)  
**Repository:** [github.com/Aniketgupta101/reloved](https://github.com/Aniketgupta101/reloved)  
**Date:** September 2026  

---

## 1. Executive Summary

**RE-LOVED** is a purpose-built digital platform that transforms preloved high-quality clothing, footwear, and lifestyle goods into gifts for the community across Mumbai. Operating on a **?0 Free** model, Reloved bridges generous donors (*Givers*) with community recipients (*Claimers*) and partner NGOs, supported by automated intra-city logistics and privacy-first building gate handoffs.

This document serves as the master end-of-project architectural specification, detailing every feature implemented across user roles, every third-party service integrated, and the exact protocols powering the platform.

---

## 2. Complete Feature Inventory by Role

### 2.1 Public Visitors & Community
* **Interactive Hero & Brand Storytelling**:
  * Dynamic hero presentation featuring the Courtyard Wall of Kindness brand lockup on ivory and deep forest green palette.
  * Real-time impact counters: items shared, families supported, and community milestones.
  * Clean, responsive typography pairing Bricolage Grotesque, Manrope, Baloo 2, and Fraunces.
* **The Digital Wall of Kindness (`/drop`)**:
  * Live inventory grid of curated items available for ?0 free claim.
  * Category filtering: *All, Tops, Bottoms, Dresses, Outerwear, Bags, Footwear, Accessories*.
  * Real-time status indicators (`Available`, `Reserved`, `Claimed`).
  * Instant full-text search across titles, brands, sizes, and item descriptions.
* **Item Detail Exploration (`/drop/:slug`)**:
  * High-resolution multi-angle photography carousel.
  * Sizing details, exact measurements, fabric composition, and condition assessment (*Like New, Gently Used, Pristine*).
  * Direct one-click **"Claim this item"** action triggering the claim workflow.
* **Wall of Love (`/wall-of-love`)**:
  * Community testimonials, recipient notes of gratitude, and impact photo galleries.
* **Interactive Mumbai Courtyard Map**:
  * Visualizes donor clusters, drop-off hotspots, and community hubs across Mumbai neighborhoods.
* **Brand & Informational Pages**:
  * **Our Story (`/story`)**: Mission, philosophy, and environmental sustainability manifesto.
  * **Partner Application (`/partners`, `/partners/apply`)**: Onboarding portal for NGOs, shelters, and welfare foundations.
  * **FAQ (`/faq`)**: Structured knowledge base optimized for SEO and AI search engines (ChatGPT, Google Gemini answer engines).
  * **Contact & Support (`/contact`)**: Instant inquiry form that directly alerts central operations.
  * **Legal & Transparency (`/terms`, `/privacy`, `/logistics`)**: Full terms of service, consumer rights, ?0 non-commercial policy, and building-gate delivery privacy protocol.
* **Physical Collateral QR Code Generator (`/qr`)**:
  * On-demand QR generator for print marketing, drop boxes, stickers, and events linking directly to `/drop` or `/give`.

---

### 2.2 Donor (Giver) Experience
* **Streamlined Give Journey (`/give`)**:
  * **Step 1: Photo Upload & AI Tagging**: Upload up to 5 photos per item with real-time thumbnail previews and client-side compression.
  * **Step 2: AI Photo Classification**: Automated vision analysis suggests category, garment type, color, and size to save donor effort.
  * **Step 3: Item Details & Measurements**: Manual overrides for brand, size, fit, and donor backstory.
  * **Step 4: Pickup Location**: Donor inputs building name/complex and neighborhood landmark (flat number optional and private).
  * **Step 5: Contact & Consent**: Name, phone number verification, and agreement to gate-security handoff terms.
* **Give Confirmation (`/give/success`)**:
  * Immediate tracking reference code generated (e.g. `REL-D-XXXX`).
  * Dispatches instant branded Brevo confirmation email.
* **Donor Profile Dashboard (`/account`)**:
  * Overview of all items contributed ("Items you've given").
  * Real-time review status cards: `Pending Review`, `Approved for Wall`, `Claimed by Community`, or `Partner NGO Assigned`.
  * Dedicated item detail views (`/account/gives/:id`) with message threads to Reloved ops.

---

### 2.3 Claimer (Recipient) Experience
* **?0 Free Claim Workflow (`TakeItemModal`)**:
  * **2-Step Low-Friction Flow**:
    1. Recipient specifies their name, mobile phone number, and delivery building/landmark in Mumbai.
    2. Recipient accepts the **?0 non-resale pledge** and agrees to building gate security pickup.
  * **Fair-Share Quota Protection**: Built-in 3-item-per-month claim limit per user to ensure equitable distribution across the community.
* **Claim Detail & Order Tracking (`/account/claims/:id`)**:
  * Dedicated status tracker following the claim lifecycle:
    `Requested` $\rightarrow$ `Admin Approved` $\rightarrow$ `Borzo Dispatched` $\rightarrow$ `Rider Picked Up` $\rightarrow$ `Delivered`.
  * Real-time **Borzo Order Number** (e.g., `#31218`) displayed with clickable **"Track Live on Borzo"** tracking map.
  * **Self-Service Borzo Booking**: Claimers can view live motorbike delivery fare estimations and trigger rider dispatch directly from their profile.
* **In-App Communication Thread (`OrderChatThread`)**:
  * Secure bidirectional messaging thread between the claimer and Reloved admin regarding delivery timings or gate coordination.

---

### 2.4 Admin & Operations Dashboard (`/admin`)
* **Secure Admin Access (`/admin/login`)**:
  * Role-protected administrative authentication with JWT session tokens and auto-refresh.
* **Executive Overview Dashboard (`/admin`)**:
  * High-level operational metrics: total inventory, active claims, pending approvals, and completed handoffs.
* **Donations Management (`/admin/donations`)**:
  * Review queue of incoming items submitted by donors.
  * Accept to Wall: Instantly publishes item to `/drop`.
  * Reject / Decline: Sends courteous email notification to donor explaining reasons (e.g., condition or duplicate).
  * Assign to Partner NGO: Flags items for bulk welfare distribution.
* **Claim Requests Management (`/admin/item-requests`)**:
  * Tabbed management: `Pending (Needs Review)`, `Approved`, `Rejected`, `All Requests`.
  * 1-Click Approve / Reject actions with automated claimer email notifications.
  * **"Open Borzo" Ops Bridge**:
    * 1-Click action that copies donor building pickup, gate security instruction, and Reloved central ops phone to clipboard.
    * Automatically opens `https://borzodelivery.com/in/` in a new window for manual booking.
  * **Integrated Borzo Delivery API Card**:
    * **"Estimate Borzo Fee"**: Calls Borzo API for instant motorbike courier fare calculation.
    * **"Book via Borzo API"**: Automated 1-click booking that creates the order in Borzo's system, assigns the rider, updates Firestore, and generates the live tracking link.
    * **"Sync Status"**: Re-checks live courier progress (`rider_dispatched`, `picked_up`, `delivered`).
* **Support Messages & Inbox (`/admin/messages`)**:
  * Central inbox aggregating all contact form inquiries and order chat messages.
  * Direct in-browser reply capability.
* **NGO & Community Partners (`/admin/partners`)**:
  * Directory of registered partner NGOs, application review, approval status, and contact person details.

---

## 3. Third-Party Services & Integrations

| Service | Provider / Gateway | Purpose in Reloved | Status |
| :--- | :--- | :--- | :--- |
| **Intra-City Logistics** | **Borzo Business API (v1.8)** | Automated motorbike delivery fee calculation, courier dispatch, order tracking, and status webhook handling across Mumbai. | ? **Active** |
| **Transactional Email** | **Brevo (Sendinblue)** | High-deliverability transactional emails for all user milestones (12 branded templates). | ? **Active** |
| **Number Masking & Voice** | **Edesy / Exotel** | Virtual phone proxy preventing donor and recipient personal phone exposure during courier calls. | ? **Active** |
| **SMS OTP Gateway** | **MSG91 / DLT Telecom** | India telecom DLT-compliant SMS OTP authentication for mobile login. | ? **Active** |
| **Identity & Auth** | **Firebase Auth / Google OAuth** | Unified user sign-in via Google 1-Tap, Email magic codes, and Phone OTP. | ? **Active** |
| **Cloud Functions** | **Google Cloud Functions v2** | Serverless Node.js backend hosted in Mumbai (`asia-south1`) for ultra-low latency. | ? **Active** |
| **Database** | **Google Cloud Firestore** | Scalable NoSQL real-time document database storing items, claims, users, and audit logs. | ? **Active** |
| **Storage & CDN** | **Firebase Cloud Storage** | Secure cloud storage bucket for item photography, assets, and brand documents. | ? **Active** |
| **Web Hosting** | **Firebase Hosting** | Global edge-cached CDN hosting the compiled Vite/React single-page application. | ? **Active** |
| **Product Analytics** | **PostHog** | Product event telemetry, conversion funnels, user session replay, and feature flag management. | ? **Active** |
| **Web Analytics & Tags** | **Google Tag Manager / GA4** | Pageview tracking, traffic attribution, conversion events, and SEO metrics. | ? **Active** |
| **Interactive Maps** | **MapLibre GL / OpenStreetMap** | Open-source vector and raster mapping rendering drop hotspots across Mumbai. | ? **Active** |
| **AI Vision Relay** | **OpenAI / Custom Vision API** | Automated clothing item recognition, color extraction, and condition classification from photos. | ? **Active** |

---

## 4. Technical Architecture & Tech Stack

```
                               ??????????????????????????????????????????????????????????
                               ?                    RELOVED CLIENT                      ?
                               ?   React 19 • TypeScript • Vite • Tailwind CSS v4       ?
                               ?           https://reloved-digital.web.app             ?
                               ??????????????????????????????????????????????????????????
                                                          ?
                                     HTTPS / REST Calls   ? Same-Origin Proxy (`/api/**`)
                                                          ?
                               ??????????????????????????????????????????????????????????
                               ?               FIREBASE CLOUD FUNCTIONS                 ?
                               ?           Node.js 20 / Express / TypeScript            ?
                               ?             Region: asia-south1 (Mumbai)               ?
                               ??????????????????????????????????????????????????????????
                                       ?              ?              ?           ?
                 ???????????????????????              ?              ?           ????????????????????????
                 ?                                    ?              ?                                  ?
   ?????????????????????????????         ?????????????????? ?????????????????????         ?????????????????????????????
   ?    FIRESTORE DATABASE     ?         ? BORZO BUSINESS ? ?   BREVO EMAIL     ?         ?      EDESY / EXOTEL       ?
   ?  NoSQL Collections:       ?         ?   API (v1.8)   ? ?  API v3 (REST)    ?         ?       CALL MASKING        ?
   ?  - items                  ?         ? - Fee estimate ? ? - 12 Branded      ?         ? - Virtual number proxy    ?
   ?  - itemRequests (claims)  ?         ? - 1-Click book ? ?   HTML templates  ?         ? - Private donor/claimer   ?
   ?  - users & profiles       ?         ? - Live track   ? ? - Immediate event ? ?   phone protection          ?
   ?  - messageThreads         ?         ? - Webhook sync ? ?   dispatch        ? ?????????????????????????????
   ?  - partners               ?         ?????????????????? ?????????????????????
   ?????????????????????????????
```

### 4.1 Frontend Codebase
* **Root Path**: `frontend/`
* **Build System**: Vite 6.4 + TypeScript + Tailwind CSS v4.
* **Component Architecture**:
  * Layouts: `PublicLayout.tsx`, `AdminLayout.tsx`.
  * Public Views: `Home.tsx`, `ItemDetail.tsx`, `Give.tsx`, `GiveSuccess.tsx`, `DonorDashboard.tsx`, `ClaimDetail.tsx`, `GiveDetail.tsx`, `StaticPages.tsx`, `QrCodes.tsx`.
  * Admin Views: `AdminDashboard.tsx`, `AdminDonations.tsx`, `AdminItemRequests.tsx`, `AdminMessages.tsx`, `AdminPartners.tsx`.
  * Interactive Components: `TakeItemModal.tsx`, `OrderChatThread.tsx`, `PrivacyBuildingNotice.tsx`, `RelovedBadge.tsx`, `SafeImage.tsx`.

### 4.2 Backend Cloud Functions
* **Root Path**: `firebase-backend/functions/`
* **Framework**: Express application bundled via Google Cloud Functions v2.
* **Key Modules**:
  * `lib/borzo.ts`: Borzo Business API client (`borzoCalculateOrder`, `borzoCreateOrder`, `borzoGetOrder`, `borzoCancelOrder`).
  * `lib/notifications.ts`: Brevo transactional email sender with templated fallback rendering.
  * `lib/callMasking.ts`: Edesy/Exotel voice routing and privacy masking.
  * `lib/firestore.ts`: Firestore helper routines and collection schema definitions.
  * `lib/auth.ts` & `lib/firebaseAuth.ts`: Multi-tenant authentication, JWT token issuance, and admin verification middleware.
  * `lib/photoAnalyze.ts`: Vision model integration for image categorization.
  * `routes/admin.ts`: Admin approval, decline, and Borzo dispatch endpoints.
  * `routes/donor.ts`: Donor profile, give history, and claimer self-service booking.
  * `routes/borzoWebhook.ts`: Webhook receiver handling live courier status updates.
  * `routes/publicWrite.ts`: Public donation submission and claim requests.
  * `routes/seed.ts`: Staging data fixtures and automated UAT resets.

---

## 5. Logistics, Delivery & Privacy Model

Reloved is designed specifically for Mumbai apartment complexes and societies where resident privacy is paramount.

### 5.1 The Gate-to-Gate Protocol
1. **No Flat Numbers Shared**: Couriers are never given apartment, flat, or floor numbers.
2. **Main Gate Security Handoff**:
   - Donor leaves the bagged/boxed item with the **building main gate security desk**.
   - Rider picks up directly from security using the item's `REL-XXXX` reference code.
   - Rider delivers directly to the claimer's building main gate security.
3. **Central Ops Intermediary**:
   - The rider is given Reloved Central Ops contact (`+91 91522 55955`) for any delivery inquiries.
   - Neither donor nor claimer receives unsolicited delivery calls.

### 5.2 Borzo Integration Modes
* **Mode A: Automated 1-Click API Booking**:
  - Direct integration via `firebase-backend/functions/src/lib/borzo.ts`.
  - Calculates real-time motorbike fare.
  - Automatically formats the gate instruction in the Borzo courier note:
    ```
    Collect package directly from building main gate security. Do not call flat. Ref: REL-XXXX.
    ```
  - Receives live courier assignment, tracking URLs, and webhook callbacks.
* **Mode B: "Open Borzo" Ops Clipboard Bridge**:
  - Clicking the **"Open Borzo"** button on `/admin/item-requests` copies the verified pickup building, gate note, and central phone directly to the operating clipboard while launching `https://borzodelivery.com/in/` in a dedicated tab for rapid manual booking if needed.

---

## 6. Transactional Email System (Brevo)

Every user journey milestone is paired with a branded, responsive HTML email template featuring Reloved's official typography and colorways:

| Template # | Template File | Trigger / Event | Recipient |
| :---: | :--- | :--- | :--- |
| **#1** | `otp-login.html` | OTP sign-in verification code | User |
| **#2** | `donation-confirmation-user.html` | Donor submits a new item on `/give` | Donor |
| **#3** | `donation-notification-admin.html` | New donation submitted | Reloved Admin Ops |
| **#4** | `claim-confirmation-user.html` | Recipient claims an item on `/drop` | Claimer |
| **#5** | `claim-notification-admin.html` | New claim requested | Reloved Admin Ops |
| **#6** | `welcome.html` | New user account onboarded | User |
| **#7** | `donation-decision.html` | Admin approves or declines donation | Donor |
| **#8** | `claim-decision.html` | Admin approves or declines claim request | Claimer |
| **#9** | `partner-application-confirmation.html` | NGO submits partnership application | NGO Applicant |
| **#10** | `partner-application-admin-alert.html` | New partner application received | Reloved Admin Ops |
| **#11** | `contact-message-admin-alert.html` | Inquiry submitted on `/contact` | Reloved Admin Ops |
| **#12** | `item-claim-notify-giver.html` | An item given by donor has been claimed | Donor |
| **Delivery** | `delivery-rider-dispatched-giver.html` | Courier assigned and heading to pickup | Donor |
| **Delivery** | `delivery-picked-up.html` | Courier collected item from donor gate | Claimer |
| **Delivery** | `delivery-delivered-claimer.html` | Item safely delivered to claimer gate | Claimer |
| **Delivery** | `delivery-delivered-giver.html` | Completed handoff notification | Donor |
| **Delivery** | `delivery-failed.html` | Delivery exception or rescheduling notice | Admin & Parties |
| **Chat** | `new-message-donor-alert.html` | New message in order thread | User |
| **Chat** | `new-message-admin-alert.html` | New message in order thread | Reloved Admin Ops |

---

## 7. Security, Privacy & Compliance

1. **Environment Configuration & Secret Management**:
   - Production secrets (`JWT_SECRET`, `BREVO_API_KEY`, `MSG91_AUTH_KEY`, `EDESY_API_KEY`, `ADMIN_PASSWORD`) are stored in isolated environment variables and strictly excluded from git tracking via `.gitignore`.
2. **Access Control**:
   - Firestore security rules restrict write operations on claims and inventory to verified administrators.
   - User profiles and personal phone numbers are readable only by their respective authenticated owner or central operations.
3. **India DLT (Distributed Ledger Technology) Telecom Compliance**:
   - Full legal documentation, brand authorization letters, and domain proofs generated (`Docs/dlt-brand-docs/`) for Indian telecom carrier approval of SMS sender IDs (`RLOVED`) and transactional templates.
4. **Data Minimization**:
   - Passwords are never stored in plaintext (PBKDF2/Argon2 hashing).
   - Session tokens use short-lived HMAC-signed JWTs.

---

## 8. Automated Testing & Verification Suite

The repository contains an automated end-to-end verification and screen-recording suite powered by Playwright:

* **End-to-End Claim to Borzo Flow (`frontend/scripts/record-claim-to-borzo-e2e.mjs`)**:
  - Tests the complete journey from `/drop` claim $\rightarrow$ email confirmation $\rightarrow$ admin approval $\rightarrow$ "Open Borzo" click $\rightarrow$ 1-click Borzo API dispatch $\rightarrow$ live tracking $\rightarrow$ claimer profile update.
  - Generates synchronized video artifacts:
    - **Desktop (`1440 × 900`)**: `frontend/recordings/reloved-claim-to-borzo-desktop.mp4`
    - **Mobile (`390 × 844`)**: `frontend/recordings/reloved-claim-to-borzo-mobile.mp4`
* **Chat Thread Flow (`frontend/scripts/record-chat-flow.mjs`)**:
  - Tests bidirectional claimer-admin order communication in desktop and mobile viewports.
* **Launch Smoke Checklist (`frontend/scripts/smoke-launch-checklist.mjs`)**:
  - Automated smoke test validating all live public routes, asset headers, and API health checks.

---

## 9. Key Contacts & Reference

* **Project**: RE-LOVED Digital Wall of Kindness
* **Central Operations Phone**: `+91 91522 55955`
* **Admin Contact Email**: `admin@reloved.digital` / `system@reloved.digital`
* **Official Notification Sender**: `no-reply@reloved.org`
* **Production URL**: `https://reloved-digital.web.app`

---
*RE-LOVED Mumbai • Handover Specification Document*
