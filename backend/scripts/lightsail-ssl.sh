#!/bin/bash
# Run on Lightsail once relovedapi.reloved.digital resolves to this server.
set -euo pipefail
sudo certbot --nginx -d relovedapi.reloved.digital --non-interactive --agree-tos -m admin@reloved.digital --redirect
curl -s https://relovedapi.reloved.digital/api/health
echo SSL_OK
