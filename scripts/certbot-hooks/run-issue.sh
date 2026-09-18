#!/bin/bash
set -euo pipefail
HOOKS="$(cd "$(dirname "$0")" && pwd)"
CERTS="$(cd "$HOOKS/.." && pwd)/letsencrypt"
mkdir -p "$CERTS/work" "$CERTS/logs"
chmod +x "$HOOKS/auth.sh" "$HOOKS/cleanup.sh"
sed -i 's/\r$//' "$HOOKS/auth.sh" "$HOOKS/cleanup.sh" || true

export FTP_USER="${FTP_USER:-kecf9s7mzevi}"
export FTP_PASS="${FTP_PASS:-Totem@2026}"
export FTP_HOST="${FTP_HOST:-reloved.digital}"

echo "Issuing cert for test.reloved.digital..."
certbot certonly \
  --non-interactive \
  --agree-tos \
  --email relovedtotem@gmail.com \
  --preferred-challenges http \
  --manual \
  --manual-auth-hook "$HOOKS/auth.sh" \
  --manual-cleanup-hook "$HOOKS/cleanup.sh" \
  --config-dir "$CERTS" \
  --work-dir "$CERTS/work" \
  --logs-dir "$CERTS/logs" \
  -d test.reloved.digital

echo "--- live certs ---"
ls -la "$CERTS/live/test.reloved.digital/"
