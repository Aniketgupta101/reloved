# Reloved Digital — User SMS templates for STPL / MSG91

**Scope:** User (Giver / Claimer) only — **no ops / Sheetal SMS**  
**Brand / footer:** Reloved Digital  
**Header / Sender ID:** **RELOVD** (same as approved OTP)  
**Template type:** Service Implicit  
**Category:** Communication/Broadcasting/Entertainment/IT  
**Content type:** Text  
**Variables:** `{#num#}` for OTP · `{#var#}` for name / item title (max 2)  
**No URLs** in SMS bodies  
**PE Entity ID:** `1701178826229506096`

Share this file to create templates in **STPL**, then bind each approved DLT ID in **MSG91**.

---

## Template list

| Template name | To | When | Description |
|---------------|----|------|-------------|
| `RELOVED_OTP_LOGIN` *(already Active)* | User | Login / signup | Verification code; valid 10 minutes |
| `RELOVED_ITEM_CLAIMED` | Giver | Someone claims their item | Someone wants their item — open account to accept or decline |
| `RELOVED_CLAIM_MATCHED` | Claimer | Claim accepted / matched | Matched; next step is delivery |
| `RELOVED_DELIVERY_RIDER_COMING` | Giver | Rider assigned / coming | Bag item and leave with building gate security |
| `RELOVED_DELIVERY_ON_THE_WAY` | Claimer | Item picked up | Picked up and on the way |
| `RELOVED_DELIVERY_DELIVERED_CLAIMER` | Claimer | Delivered | Delivery confirmed |
| `RELOVED_DELIVERY_FAILED` | Giver or Claimer | Delivery failed | Could not complete; Reloved Digital will reschedule |

**Total to create on STPL:** **6** new (+ OTP already done).

Ops / Sheetal stay on **email** only — no SMS templates for them.

---

## STPL form — same for every new template

| Field | Value |
|-------|--------|
| Communication Type | SMS |
| Template Type | Service Implicit |
| Template Category | Communication/Broadcasting/Entertainment/IT |
| Content Type | Text |
| Header | **RELOVD** |
| Upload Document | Optional |
| Method | Copy/Paste Message |
| Variables | Use **+ Add Variable** (do not type `{#var#}` only by hand) |

---

## Bodies to paste

### 0. `RELOVED_OTP_LOGIN` — skip (already Active)

**Template Id:** `1777178963509485562`  
**Header:** RELOVD  

```
Your Reloved Digital verification code is {#num#}. Valid for 10 minutes. Do not share this OTP with anyone.
- Reloved Digital
```

MSG91 Template ID (when Entity ID fixed): `6aaea1b06f6505878a0bc392`

---

### 1. `RELOVED_ITEM_CLAIMED`

**Message:**
```
Hi {#var#}, someone wants your Reloved Digital item {#var#}. Open your account to accept or decline.
- Reloved Digital
```

**Sample:**
```
Hi Anika, someone wants your Reloved Digital item Blue kurta. Open your account to accept or decline.
- Reloved Digital
```

---

### 2. `RELOVED_CLAIM_MATCHED`

**Message:**
```
Hi {#var#}, you are matched for {#var#} on Reloved Digital. Next step is delivery — check your account.
- Reloved Digital
```

**Sample:**
```
Hi Riya, you are matched for Blue kurta on Reloved Digital. Next step is delivery — check your account.
- Reloved Digital
```

---

### 3. `RELOVED_DELIVERY_RIDER_COMING`

**Message:**
```
Hi {#var#}, a Reloved Digital rider is coming for {#var#}. Bag it and leave it with building gate security now.
- Reloved Digital
```

**Sample:**
```
Hi Anika, a Reloved Digital rider is coming for Blue kurta. Bag it and leave it with building gate security now.
- Reloved Digital
```

---

### 4. `RELOVED_DELIVERY_ON_THE_WAY`

**Message:**
```
Hi {#var#}, your Reloved Digital item {#var#} has been picked up and is on the way to you.
- Reloved Digital
```

**Sample:**
```
Hi Riya, your Reloved Digital item Blue kurta has been picked up and is on the way to you.
- Reloved Digital
```

---

### 5. `RELOVED_DELIVERY_DELIVERED_CLAIMER`

**Message:**
```
Hi {#var#}, {#var#} has been delivered. Enjoy — thanks for choosing Reloved Digital.
- Reloved Digital
```

**Sample:**
```
Hi Riya, Blue kurta has been delivered. Enjoy — thanks for choosing Reloved Digital.
- Reloved Digital
```

---

### 6. `RELOVED_DELIVERY_FAILED`

**Message:**
```
Hi {#var#}, delivery of {#var#} could not be completed. Reloved Digital will contact you to reschedule.
- Reloved Digital
```

**Sample:**
```
Hi Anika, delivery of Blue kurta could not be completed. Reloved Digital will contact you to reschedule.
- Reloved Digital
```

---

## After STPL Active → MSG91

For each approved template:

1. MSG91 → SMS → Templates → Create  
2. Sender **RELOVD** · paste DLT Template Id · body with `##var##` / `##OTP##` as needed  
3. Entity ID on MSG91 must be **`1701178826229506096`**  
4. Test DLT → then set env / widget for OTP; store other MSG91 IDs when wiring product SMS later

After each template is **Approved** on STPL → bind DLT template ID + header **RELOVD** in MSG91.
