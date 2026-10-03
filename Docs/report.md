# Reloved — Development & Fixes Report

**Prepared for client handover · Covers all work completed to date**

---

## What's been built

Reloved started as a homepage and has grown into a full donation platform: donors post items ("Drop"), AI cleans up and presents the photos, items appear on the public "Wall of Kindness," recipients claim them, and admins arrange courier pickup/delivery — with notifications at every step.

Everything below is grouped by area, not by date, so it's easy to see what exists and what's been fixed.

---

## 1. Donating & Claiming Items

- Built the full donation flow: post an item, multiple photos per item, bulk/multi-item drops, drafts that auto-save so nothing is lost if the page closes or refreshes.
- Items publish to the public Wall automatically — no manual admin approval needed.
- Claiming is protected against double-claims: once someone claims an item, it's locked immediately so two people can never be granted the same item.
- Fixed an issue where a failed bulk upload used to wipe out the items that *did* succeed — now only the failed ones need retrying.
- Added clear error messages with one-tap retry when an upload fails, instead of forcing a restart.

## 2. Photos & Presentation

- Every donated item gets two AI-processed photos: a styled "on-model" style photo and a clean cutout photo on a plain white background, alongside the donor's original photo.
- Fixed iPhone photos (HEIC format) not displaying correctly on other devices/browsers.
- Fixed a bug where light/white/cream-colored clothes were getting washed out or disappearing into the white background.
- Fixed a mix-up where the Wall was showing the wrong photo type for some items.
- Sped up photo uploads and processing so pages don't lag, especially on mobile and slower connections.

## 3. Delivery & Courier Booking

- Integrated courier partners (Borzo, Shadowfax, Shiprocket) so admins can book, track, and cancel pickups/deliveries directly from the Admin panel — no manual calls or outside tools needed.
- Added a live tracking link in the SMS/email sent to recipients when a rider is on the way.
- Locked down delivery booking so clicking "Book" twice can't create duplicate bookings or duplicate charges.
- Fixed an issue where some items couldn't be withdrawn or edited while a delivery was already in progress, to avoid conflicting instructions to the courier.

## 4. Notifications (SMS & Email)

- Built out the full set of automated notifications: claim confirmations, approval/decline messages, rider-on-the-way alerts, thank-you messages.
- Fixed a data mix-up where a batch of reassigned donations was still sending claim notifications to the old donor instead of the new one — identified and corrected (26 items, 2 donor accounts, 17 chat threads affected).
- Combined multi-item donation emails into a single, clean summary email instead of one email per item.
- Standardized branding, fonts, and logos across all email templates.

## 5. Privacy & Security

- Personal details (phone numbers, emails, flat/apartment numbers, social media handles) are automatically stripped out of in-app chat messages between donors and recipients.
- Addresses shown publicly or to couriers now show only the general neighborhood/landmark, not the exact flat number, protecting both donors' and recipients' privacy.
- Login codes (OTP) can no longer be reused or guessed through repeated attempts — both loopholes have been closed.
- Courier systems can no longer send fake delivery updates — all incoming courier data is now verified as genuinely coming from the courier.
- Removed old hardcoded internal email addresses so system alerts only go to approved channels.
- Shortened how long a login session stays valid, reducing risk if a device is lost or shared.

## 6. Stability & Speed

- Fixed several server crash risks under heavy photo upload load.
- Sped up the Wall of Kindness, admin dashboards, and donor dashboards by changing how data is loaded (loads in smaller batches instead of all at once).
- Fixed daily delivery lists occasionally missing scheduled pickups due to an outdated query limit.
- Aligned all scheduling/reporting to Indian time (IST) instead of showing UTC times, avoiding confusion around "today's" bookings.
- Added an automated test suite so future changes can be checked for breakage before going live, instead of relying only on manual checks.

## 7. Admin Tools

- Built the Admin panel: overview dashboard, delivery booking controls, analytics on sign-ups/drops/claims, and tools to filter out internal test accounts from real numbers.
- Added tools to fix/repair data issues directly (e.g., correcting a listing's status if it falls out of sync).

---

## Current Status

All of the above is **built, tested, and live** on the production site (reloved.digital). The platform now supports the full journey — posting a donation, AI photo processing, public listing, claiming, courier delivery, and notifications — with the security and stability issues found during review closed out.

**Remaining / in progress:** a small number of lower-priority polish items (dashboard loading animations, further backend code cleanup) are tracked separately and not required for the platform to run.
