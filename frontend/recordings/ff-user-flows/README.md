# F&F User-Flow recordings (TC01–TC24)

Executed against **local UI** (`http://localhost:3000`) + **live API** (`https://reloved-digital.web.app`).

See **[MATRIX.md](./MATRIX.md)** for PASS / PARTIAL / FAIL + per-case evidence links.

Also mirrored at `Docs/F&F_USER_FLOW_MATRIX.md`.

## Re-run

```bash
cd frontend
# clear ONLY if set
set UAT_API_URL=https://reloved-digital.web.app
set RECORD_BASE_URL=http://localhost:3000
npm run record:ff-user-flows
```

Optional: `ONLY=TC07,TC08,TC14` to re-run a subset.

## Honest ops gaps (PARTIAL by design)

- **TC13** — Brevo templates + soft-copy verified in code; open Gmail to confirm delivery.
- **TC20** — Admin masked-call UI present; live Edesy both-sides connect needs wallet/number.
