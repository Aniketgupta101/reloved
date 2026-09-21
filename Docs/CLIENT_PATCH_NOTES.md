# RELOVED — What We've Fixed So Far

**Hi Sheetal, hi Totem team,**

This is a running log of everything you and the Friends & Family testers flagged since we started testing on 31 August, and what we did about each one. We wanted to put it all in one place so it's easy to see the journey: what's live, what's still being polished, and what's intentionally saved for Phase 2.

Thank you for how closely you and Waseem, Jass, and the team tested this. Honestly, most of what made it into the product these three weeks came directly from you catching things we didn't.

**Legend:** ✅ Fixed & live · ⚠️ Still open / in progress · 🔜 Queued next · 📌 Phase 2 (by design, not forgotten)

---

## 31 August — First Round of Feedback

You reviewed the very first build and sent back a clear, specific list: buttons should be black with white text (less green), the drop-an-item headline needed punchier copy, and the delivery step needed real choices, not just "coming soon."

- ✅ Repainted the primary buttons black/white and dialled back the green across the site
- ✅ Changed the hero line to "Drop something, someone else needs it"
- ✅ Built out a proper handover dropdown: receiver collects, giver sends it, or a porter through RELOVED, with a clear "who pays" choice
- ✅ Recoloured the small accent buttons to match your logo pink and green exactly, instead of our placeholder shades

We recorded the whole thing and sent it over the next morning so you could see it in motion, not just read about it.

---

## 2 September — Getting the Details Right

You caught two things we'd missed in the hero section: the hanging lights sat too close together, and the logo had rendered white instead of black. Small things, but they mattered for how the homepage felt.

- ✅ Shifted the lights outward and locked the logo to black everywhere
- ✅ Made "Terms & Conditions" and "Privacy Policy" clickable, linking to a dedicated page
- ✅ Rewrote the Privacy Policy exactly as you asked: "giving and claiming preloved items for free," Mumbai reference removed, resale-restriction clause added
- ✅ Fixed the Instagram export crop that was cutting off price tags on shared photos

Everything checked out and you gave the go-ahead the same day.

---

## 8–10 September — Keeping Handovers Private and Simple

This is where the real delivery-logistics thinking started. You wanted donors protected: no flat numbers, no personal details, just a building name and a security guard handoff. You also asked whether call masking (hiding phone numbers from couriers) could be done immediately rather than waiting for Phase 2.

- ✅ Added a clear on-screen privacy rule at the handover step: building name only, hand it to security in a bag
- ✅ Connected the address auto-fill so the Maps search you already have on the drop flow now feeds straight into the Borzo/Porter handoff
- ✅ Explained (and this stuck) that the ₹40–100 range you saw is Borzo's own estimate, not something we control from our side
- ⚠️ **Call masking (Edesy):** KYC application submitted; number provisioning takes 4–6 business days on the vendor's side, in motion but not something we can rush
- 📌 Deep dual-courier integration and automatic status syncing: agreed together to keep for Phase 2 so we didn't hold up launch chasing polish nobody would notice yet

---

## 9–12 September — Give, Claim, and Email Flows Come Together

By this point we sent through full recordings of the Give and Claim journeys end to end, along with the email notifications tied to each step.

- ✅ A proper Claim Details view with Pending / Approved / Rejected statuses on the admin side
- ✅ One place for admin to handle building notes, Maps links, and Borzo/Porter bookings
- ✅ An ops phone number for courier bookings
- ✅ Desktop and mobile claim flows brought into line with each other
- ✅ Corrected launch copy: giver pays Borzo once, claimer pays nothing
- ✅ A two-way chat on every claim, with quick questions and free text
- ✅ Admin replies that stay inside the same claim thread instead of scattering across email
- ✅ More clothing photos added to the Wall of Kindness
- ⚠️ Some Wall images weren't sitting straight, still on our list, also looking at auto-correcting orientation for future uploads

We also shared the live site and admin dashboard with you directly so you could poke around yourself.

---

## 13–16 September — Matching, Notifications, and a Lighter Onboarding

This round was about making the product feel more thoughtful. You sent us exact copy for every notification a giver or claimer would see, and asked for 3km radius matching plus age bands instead of adult sizing for kids' listings.

- ✅ Built the 3km radius matching logic
- ✅ Rewrote every notification to match your copy exactly, on both the giver and claimer side
- ✅ Added the authenticity and brand-disclaimer language you sent for the Privacy Policy and Terms
- ✅ Let givers upload multiple photos of a single item
- ✅ Switched kids' listings from size to age band
- ✅ Added a proper decline-reason flow when a giver can't accept a claim
- ✅ Cleaned up the privacy warning and turned the delivery date range into simple buttons: 24hr, 48hr, 1 week, flexible
- ✅ Refreshed the admin panel's layout and terminology
- ✅ "For You" onboarding tag: built, then pulled a few days later once you felt it wasn't adding value

---

## 17 September — Numbers That Actually Mean Something

- ✅ Time Saved stat calculated at 45 minutes per item Reloved
- ✅ Kindness Streak now shows with a fire emoji
- ✅ Items Reloved count replaced a metric that wasn't telling anyone anything useful
- ✅ Notifications simplified down to Open and Mark as Read
- ✅ Claim limit changed from monthly to a 3-item weekly cap
- ✅ Up to 3 photos per item, with swipe gesture and photo counter
- ✅ Time Saved later flagged as not needed and removed (see 20 Sep)

---

## 18–19 September — Live Testing With Real People

We opened a dedicated testing link, `go.reloved.digital/test`, and shared it with Friends & Family directly. Within hours you'd found more issues in one evening of real usage than we had in weeks of internal testing, and you were right to push back that this should've been caught before it reached you. We heard that, and we moved fast.

- ✅ Back button was wiping half-filled drop forms: forms now persist
- ✅ Description was forced mandatory: now optional
- ✅ No way to say how you'd like your name to appear: added a username field
- ✅ Items could be dropped with no email on file: signup now happens up front
- ✅ Email verification codes weren't arriving: fixed a delivery issue on our email provider's side
- ⚠️ Phone number stayed mandatory: kept intentionally, we need it to coordinate delivery, explained the reasoning back to you
- ✅ Registration was happening *after* the drop attempt, which felt backwards: signup now comes first
- ✅ New drops weren't showing up on the Wall right away: items go live instantly now, no waiting on admin approval
- ✅ Multiple photos for one item wouldn't upload
- ✅ Every drop was making people sign in again, even when already logged in
- ✅ Back-button issues in a few other places
- ✅ Signup form was asking for too much: trimmed down to name, username, mobile/email, and address
- ✅ A claim was showing as "claimed" before delivery: status now only updates once handover is confirmed
- ✅ "Open in App" was forcing a Borzo app download: now directs to the web flow
- ✅ Claimers were being shown a payment screen: claiming is ₹0, fixed
- ✅ White-background photo cleanup wasn't applying consistently
- ✅ No way to delete a listing: added a remove option in the Giving tab
- ✅ Removal reason was forced: now optional
- ✅ No way to cancel a submitted claim: claimers can now cancel their own claims

By the end of that same day we pushed a fresh build with all of the above, plus better Borzo/Porter booking instructions, email alerts for the team with one-click actions to remove listings or decline claims, and better chat notifications overall.

---

## 19 September (evening) — Waseem and Jass Put It Through Its Paces

Waseem and Jass ran a much deeper test and sent back both product ideas and bugs.

- 📌 Liability waiver, photo-taking guide, AI brand/colour auto-detect, defects picker, 1–10 condition scale: genuinely good ideas, noted for Phase 2 since they need real design thought rather than a quick patch
- ✅ Request-received and item-received messages now read the way you wanted
- ✅ Privacy note removed from the Claim flow, only made sense on Drop
- ⚠️ Building autofill failing on some housing society names
- ⚠️ Address suggestions from outside Mumbai cluttering the picker
- ⚠️ Phone autofill not always triggering
- ⚠️ Notifications sitting there after their action was already done
- ⚠️ 3km filter not actually narrowing results
- ✅ Cancelled claims not returning the weekly claim count
- ⚠️ Community Map button not responding
- ⚠️ Delivery/chat screen showing every item instead of just the claimed one

---

## 20 September — The AI and Photo Deep-Dive

Photo-analysis speed became the clear top priority (20–25 seconds felt slow, and stepping away to another tab would break the auto-fill entirely). You also caught that locality was showing as "Mumbai Zone 3" instead of something recognisable, like "Bandra West."

- ✅ Locality now shows real neighbourhood names instead of zone numbers, consistently
- ✅ Women/Men/Girls/Boys filter restored on the Wall of Kindness
- ✅ Time Saved removed from the dashboard, as requested
- ⚠️ Photo-analysis AI speed: top priority, addressed same evening, see below
- ⚠️ Multi-item drops only carrying description to item 1: addressed same evening, see below
- ⚠️ Editing a listing after submission: still not built

---

## 21 September — Simpler Copy, Cleaner Footer

Your latest round was mostly about tone and clarity.

- ✅ Wall of Kindness header trimmed, "verified community partners" line removed
- ✅ "Curated pre-loved items" changed to "Preloved pieces"
- ✅ Claim-pending copy changed to "Waiting for the giver to respond. You'll be notified when they accept or decline."
- ✅ Footer collapsed into three groups: Explore / About / Policies
- ✅ "Track Donation" renamed to "Track a Request"
- ✅ Top tagline shortened to "Preloved pieces. Always free."

All of this is now live.

---

## 21 September (evening) — Fresh Off the Press

We just pushed a build that goes straight after the two things you'd flagged as the most frustrating parts of testing: how slow the photo AI felt, and how fiddly multi-item drops were.

- ✅ **Photo analysis is a lot faster.** Title, category, and description now fill in first from your original photo; white-background cleanup runs quietly after instead of blocking everything. Switching tabs mid-upload shouldn't break the auto-fill anymore.
- ✅ **Multiple Items rebuilt properly.** Select "Item 1," add its photos, then tap "Item 2" and add its photos, and so on: exactly the item1-pics / item2-pics / item3-pics flow you asked for.
- ✅ **Description is genuinely optional.** Leave it blank and it saves fine with a friendly default line.
- ✅ **Neighbourhood names everywhere, no more zone numbers**, on the Wall cards and item pages both.
- ✅ **Address search tightened to Mumbai only**; typing "Kohli Villa" now actually surfaces it.
- ✅ **Footer and Wall copy matched exactly**, Explore / About / Policies, "Track a Request," "Preloved pieces. Always free."
- ✅ **Notification wording locked to your exact copy**: "Yayyy! 🎉" on a match, the "pay it forward" line on received, the softer "we couldn't match you this time" on a miss.
- ✅ **"Personal driver will deliver" removed.** If a giver sends it themselves, it just says that.
- ✅ **"Chat with Reloved"** now sits on every claim, plus a new admin view so our team can reply and quietly monitor giver-to-claimer chats for safety.
- ✅ **Wall cards stopped jiggling.** Consistent height, no more resizing on hover.

---

## Where Things Stand Right Now

- ⚠️ Letting people edit a listing after they've submitted it
- ⚠️ The 3km radius filter actually filtering
- ⚠️ The Community Map button on the Explore Wall
- ⚠️ Delivery & Chat showing only the item you're actually coordinating, not everything
- ⚠️ Notifications not clearing themselves once you've acted on them
- ⚠️ A handful of housing society names Google Maps doesn't recognise well

## Saved for Phase 2 — On Purpose, Not Forgotten

- 📌 Fully automated call masking through Edesy: waiting on their KYC and number approval, out of our hands timing-wise
- 📌 Deeper courier integration so bookings and status updates happen without leaving RELOVED
- 📌 AI that reads brand, colour, and fit straight off a photo
- 📌 A structured defects picker, a 1–10 condition scale, and liability-waiver copy
- 📌 A short in-app guide for taking better item photos
- 📌 Letting a claimer see a donor's other active listings, so they can claim a few things in one trip
- 📌 Your own branded SMS sender ID: 4 of 10 templates already approved under the Totem header, rest moving through carrier verification

---

*We'll keep updating this after every round of feedback so there's always one place to see what's changed. Last updated 21 September 2026, evening. Thank you again for testing this as hard as you have. It's a genuinely better product because of it.*
