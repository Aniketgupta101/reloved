# Reloved — fixes delivered (26 September 2026)

What we fixed today, based on client screenshots, Jass’s Wall listings, Sheetal’s feedback, and Aakash’s SMS check. Live on **reloved.digital**.

---

## Admin & operations

1. **Admin Overview shows the real ops picture**  
   The home admin page now correctly surfaces new drops, new claim requests, active matches, pending/upcoming deliveries, and a clear Wall snapshot (available / being matched / claimed). When there are no deliveries today, upcoming ones are shown instead of an empty board.

2. **Dropper details on admin cards**  
   Matched and delivery cards now show the dropper’s name and phone so ops can act without hunting through other tabs.

3. **Claims board cleaned up**  
   Claim cards focus on what ops need (Accept / Couldn’t match, stage, chat). Extra clutter that made the board harder to use was removed.

---

## Wall of Kindness & listings

4. **Claimed items show as Claimed**  
   Items that were already claimed were still appearing as Available. Statuses are synced from real claims: pending request → Being matched; approved match → Claimed; completed → Reloved. The **Pink Corduroy Cropped Jacket** was corrected and now shows the Claimed stamp on the Wall.

5. **Jass’s items visible under Men**  
   Jass’s batch (~43 pieces) was corrected to the Men category and put back on the Wall so they display properly for claimers.

6. **Cleaner product photos on the Wall**  
   Cutout images that showed grey empty bars around the garment now sit on a white fill so pieces look larger and cleaner (Sheetal’s feedback).

---

## Messages to users (SMS & email)

7. **Full claim-to-delivery messaging restored**  
   Users again get the right emails through the journey: someone claimed your item, you’re matched, delivery ready, date & time set, order on the way, delivered, and thank-you / feedback. Emails go out for every step.

8. **SMS for the live delivery steps**  
   SMS is sending for: item claimed (to the dropper), rider coming, order on the way, delivered, and delivery failed (when that happens). These were verified on a live Indian number.

9. **Schedule messaging clarified**  
   When a handover time is set, the email tells both sides to check their account/email to modify the slot, or get in touch with Reloved if they need help.

---

## Already live

Frontend on **reloved.digital** and the backend that powers admin, Wall status, and user messages were updated together so the fixes above work end to end in production.
