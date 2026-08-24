#!/bin/bash
set -euo pipefail

# systemd
sudo cp /home/ec2-user/reloved-api.service /etc/systemd/system/reloved-api.service
sudo systemctl daemon-reload
sudo systemctl enable reloved-api
sudo systemctl restart reloved-api
sleep 2
sudo systemctl status reloved-api --no-pager | head -15

# nginx
sudo cp /home/ec2-user/relovedapi.nginx.conf /etc/nginx/conf.d/relovedapi.conf
sudo nginx -t
sudo systemctl reload nginx

# health check
curl -s http://127.0.0.1:8787/api/health || true
curl -s http://127.0.0.1/api/health -H 'Host: relovedapi.reloved.digital' || true

echo SERVICE_OK
