#!/bin/bash
set -euo pipefail

# Prefer IPv4 outbound — Brevo IP allowlist often has v4 but not v6.
if ! grep -q '::ffff:0:0/96' /etc/gai.conf 2>/dev/null; then
  echo 'precedence ::ffff:0:0/96  100' | sudo tee -a /etc/gai.conf > /dev/null
fi

ENV_FILE="/home/ec2-user/reloved/backend/.env"
grep -q '^OTP_VENDOR_FALLBACK_LOG=' "$ENV_FILE" \
  && sed -i 's/^OTP_VENDOR_FALLBACK_LOG=.*/OTP_VENDOR_FALLBACK_LOG=true/' "$ENV_FILE" \
  || echo 'OTP_VENDOR_FALLBACK_LOG=true' >> "$ENV_FILE"

cd /home/ec2-user/reloved/backend
git pull origin main 2>/dev/null || true
npm run build
sudo systemctl restart reloved-api
sleep 2
curl -s -X POST http://127.0.0.1:8787/api/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"channel":"email","target":"relovedtotem@gmail.com"}'
echo
sudo journalctl -u reloved-api -n 5 --no-pager | grep -E 'otp-fallback|Failed|listening'
echo PATCH_OK
