#!/bin/sh
set -e
FTP_USER="${FTP_USER}"
FTP_PASS="${FTP_PASS}"
FTP_HOST="${FTP_HOST:-reloved.digital}"
REMOTE="ftp://${FTP_HOST}/www/test/.well-known/acme-challenge/${CERTBOT_TOKEN}"
printf '%s' "$CERTBOT_VALIDATION" > "/tmp/${CERTBOT_TOKEN}"
curl -sS --fail --ftp-create-dirs --user "${FTP_USER}:${FTP_PASS}" -T "/tmp/${CERTBOT_TOKEN}" "$REMOTE"
# Wait until publicly reachable
i=0
while [ $i -lt 30 ]; do
  got=$(curl -sS -m 10 "http://test.reloved.digital/.well-known/acme-challenge/${CERTBOT_TOKEN}" || true)
  if [ "$got" = "$CERTBOT_VALIDATION" ]; then
    echo "Challenge reachable"
    exit 0
  fi
  i=$((i+1))
  sleep 2
done
echo "Challenge not reachable after wait" >&2
exit 1