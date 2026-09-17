# Privacy test-case results (accurate recording)

Generated: 2026-09-17T09:33:10.777Z

## Video
- `frontend/recordings/privacy-test-cases.webm`
- Frame stills: `frontend/recordings/privacy-test-cases/frames/`

## Backend unit tests
- Status: PASS (exit 0)

## On-video UI proof
- Live demo all pass: **true**
- Interactive phone BLOCK: **true**
- Interactive landmark ALLOW: **true**
- Give privacy notice: **true**
- Help escalate phone warn: **true**

### Live demo cases
- [x] TC-C1
- [x] TC-C2
- [x] TC-C3
- [x] TC-C4
- [x] TC-C5
- [x] TC-H1
- [x] TC-P1

## Overall
**PASS**

```
TAP version 13
# Subtest: TC-C peer chat scrub
    # Subtest: TC-C1 allow landmark
    ok 1 - TC-C1 allow landmark
      ---
      duration_ms: 3.3094
      type: 'test'
      ...
    # Subtest: TC-C2 reject phone
    ok 2 - TC-C2 reject phone
      ---
      duration_ms: 0.2535
      type: 'test'
      ...
    # Subtest: TC-C3 reject +91 spaced phone
    ok 3 - TC-C3 reject +91 spaced phone
      ---
      duration_ms: 0.1395
      type: 'test'
      ...
    # Subtest: TC-C4 reject flat/wing
    ok 4 - TC-C4 reject flat/wing
      ---
      duration_ms: 0.175
      type: 'test'
      ...
    # Subtest: TC-C5 reject email
    ok 5 - TC-C5 reject email
      ---
      duration_ms: 0.3759
      type: 'test'
      ...
    # Subtest: TC-C6 ops thread policy: same phone text is detectable (caller decides allow)
    ok 6 - TC-C6 ops thread policy: same phone text is detectable (caller decides allow)
      ---
      duration_ms: 0.3437
      type: 'test'
      ...
    1..6
ok 1 - TC-C peer chat scrub
  ---
  duration_ms: 6.2987
  type: 'suite'
  ...
# Subtest: TC-H handover address mask
    # Subtest: TC-H1 strips flat/wing tokens
    ok 1 - TC-H1 strips flat/wing tokens
      ---
      duration_ms: 0.8446
      type: 'test'
      ...
    # Subtest: TC-H2 public area stays neighbourhood-ish
    ok 2 - TC-H2 public area stays neighbourhood-ish
      ---
      duration_ms: 0.5616
      type: 'test'
      ...
    1..2
ok 2 - TC-H handover address mask
  ---
  duration_ms: 1.7095
  type: 'suite'
  ...
# Subtest: TC-P photo error sanitize
    # Subtest: TC-P1 strips Gemini 429 detail
    ok 1 - TC-P1 strips Gemini 429 detail
      ---
      duration_ms: 0.3997
      type: 'test'
      ...
    # Subtest: TC-P6 friendly fallback for empty/ADC errors
    ok 2 - TC-P6 friendly fallback for empty/ADC errors
      ---
      duration_ms: 0.2924
      type: 'test'
      ...
    # Subtest: allows short product copy through
    ok 3 - allows short product copy through
      ---
      duration_ms: 0.2267
      type: 'test'
      ...
    1..3
ok 3 - TC-P photo error sanitize
  ---
  duration_ms: 1.1589
  type: 'suite'
  ...
# Subtest: TC-P7/P8 sensitive flag contract (shape)
    # Subtest: documents expected AnalyzeOk fields
    ok 1 - documents expected AnalyzeOk fields
      ---
      duration_ms: 0.1431
      type: 'test'
      ...
    1..1
ok 4 - TC-P7/P8 sensitive flag contract (shape)
  ---
  duration_ms: 0.2181
  type: 'suite'
  ...
1..4
# tests 12
# suites 4
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 123.1719

```
