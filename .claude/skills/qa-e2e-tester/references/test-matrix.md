# Adversarial Test Matrix

Categories to work through per in-scope flow. Not every category applies to every flow — use judgment, but don't skip a category just because the happy path looked fine; that's exactly where these bugs hide.

## 1. Input validation & boundary values

- Empty required field submitted anyway (client-side bypass: disable the button via devtools, or fire the network request directly)
- Whitespace-only input in a required text field
- Max-length overflow (title, description, coordination notes) — does it truncate, reject, or overflow the UI?
- Non-numeric input in numeric fields (quantity, mobile number, pincode)
- Mobile number: fewer than 10 digits, more than 10, leading 0/non-6-9 start (backend enforces "10 digits, starting with 6-9" per the Donor Details form — try both ends)
- Email: malformed address, already-registered email, case-sensitivity mismatch (`Test@x.com` vs `test@x.com`)
- Special characters / emoji / RTL text / very long strings in name, username, description fields — check both render and storage
- Username field: characters outside "letters, numbers, . and _" (the stated rule) — does the client reject it, or does an invalid value reach the server?
- Negative or zero quantity on a Give listing
- Upload: 0 photos when photos are required, more than the stated photo limit (5 single-item / 12 multi-item per the Give flow), non-image file renamed with an image extension, a corrupted/truncated image file, an extremely large image

## 2. State machine / sequence abuse

- Claim the same item twice from the same account
- Two different accounts claim the same item at nearly the same instant (open two browser contexts, fire both claim requests as close together as you can) — does the weekly claim limit, item availability, and admin approval state end up consistent for both?
- Cancel a claim, then immediately try to claim the same item again
- Accept a claim as the giver, then try to decline it (or vice versa) after the fact
- Mark an item "handed over" before the claimer has provided a delivery address, where that's supposed to be required first
- Confirm "received" without the giver ever marking "handed over"
- Try to claim your own dropped item
- Try to accept/decline a claim on an item you don't own (tamper with the request ID/claim ID in the URL or request body)
- Remove/delete a listing that already has a pending or accepted claim on it
- Submit the same Give form twice in quick succession (double-click the submit button, or fire the request twice) — does it create two listings?

## 3. Navigation / browser abuse

- Back button mid-multi-step form (Give wizard, Claim flow, onboarding) — does progress survive, or does it silently reset without warning?
- Forward button after using back — does state stay consistent?
- Refresh mid-form — is there a draft save, and does it restore correctly (including photos, which can't trivially round-trip through localStorage)?
- Open the same in-progress form in two tabs — does saving in one tab clobber or conflict with the other?
- Direct-navigate to a step-3 URL of a multi-step flow without completing steps 1–2
- Direct-navigate to `/account/claims/:id` or `/account/gifts/:id` for an ID that isn't yours
- Direct-navigate to an admin route while logged out, or logged in as a non-admin donor session

## 4. Async / timing / race conditions

- Switch tabs (or just click away) while the photo-analyze AI call is in flight — does the result still land correctly when you return, per the "catalog first, background cleanup after" behavior described in the patch notes?
- Submit a form while a required async validation (e.g. address geocode lookup) hasn't resolved yet
- Navigate away mid-upload — does the upload silently continue, fail loudly, or leave an orphaned partial record?
- Slow network simulation (Playwright route throttling/delay) on the analyze or submit endpoint — does the UI show a stuck/broken state, or a proper loading/timeout state?
- Rapid-fire the same button (claim, accept, decline, mark-handed-over, mark-received) — is the backend idempotent, or does a double-click double-process it?

## 5. Network failure injection

- Force a 500 / connection failure on the submit request after the user has filled out a full multi-step form — is their input lost, or recoverable?
- Force a 500 on the photo upload but let the rest of the form succeed — what state does the listing end up in?
- Force a timeout on the OTP-send request — does the UI hang, or fail with a clear message and a retry path?
- Force a 401/session-expired response mid-flow (e.g. mid-Give-submit) — does the app redirect to login cleanly and preserve intent, or does it error opaquely / lose the draft?

## 6. Auth & session edge cases

- Sign up with an email, verify, then try to sign up again with the same email — correct error, or does it silently create a duplicate/broken account?
- Request an OTP, let it expire (or use a stale one), and try to verify — clear expired-code error?
- Request a new OTP before the first one expires — does the old code still work (it shouldn't), does the new one?
- Log in on two different devices/sessions simultaneously with the same account — does one session doing something (e.g. cancelling a claim) reflect correctly in the other on next load?
- Session token tampering: modify or truncate the stored session token and confirm the app rejects it rather than half-trusting it
- Access an authenticated route with no session at all — clean redirect, or a broken/blank page?

## 7. Privacy & data exposure (always P0 if broken)

- Confirm a public item listing never shows flat/wing/exact address — only the sanitized locality (per `toPublicArea` / `formatWallLocality` logic)
- Confirm a claimer's exact address is NOT visible to the giver before the claim is approved (should be masked/area-only pre-match, per the masking logic in the donor routes)
- Confirm a giver's exact address is NOT visible to the claimer before acceptance
- Confirm phone numbers aren't exposed in chat, notifications, or API responses to the other party before the point the product intends them to be shared
- Check API responses directly (network tab / intercepted response body), not just the rendered UI — data can be present in the JSON payload even if the UI doesn't render it, which is still a leak
- Confirm a declined/cancelled claim doesn't leave the claimer's contact info lingering in a state the giver can still reach

## 8. Admin-specific

- Approve/decline the same item-request twice (double-click, or two admin tabs open)
- Try an admin action on an item/claim that's already in a terminal state (already approved, already declined, already deleted) — clean no-op/error, or does it corrupt state?
- Bulk-upload: malformed CSV/row, missing required columns, duplicate rows
- Admin chat reply on a thread with no messages yet, or on a thread whose subject item has since been removed

## 9. Copy & flow consistency (UI/UX pass, not functional bugs)

- Does the same concept get referred to with different words at different steps (e.g. "item" vs "clothes" vs "garment" — this app has explicitly moved away from clothes-only language per the patch notes; check nothing regressed)?
- Does an error message ever contradict the field's own validation hint (e.g. hint says optional, error says required)?
- Does a success state actually match what happened (e.g. "Reloved!" showing before handover is actually confirmed)?
- Is a disabled/loading button visually distinguishable from an active one, or does it just look broken/unresponsive?
