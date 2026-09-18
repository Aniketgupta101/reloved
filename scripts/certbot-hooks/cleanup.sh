#!/bin/sh
set -e
FTP_USER="${FTP_USER}"
FTP_PASS="${FTP_PASS}"
FTP_HOST="${FTP_HOST:-reloved.digital}"
# Best-effort delete
curl -sS --user "${FTP_USER}:${FTP_PASS}" -Q "DELE www/test/.well-known/acme-challenge/${CERTBOT_TOKEN}" "ftp://${FTP_HOST}/" || true