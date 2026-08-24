#!/bin/bash
set -euo pipefail

DOMAIN="43-205-146-110.sslip.io"
CONF="/etc/nginx/conf.d/relovedapi.conf"

sudo tee "$CONF" > /dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN} relovedapi.reloved.digital;

    client_max_body_size 25M;

    location /uploads/ {
        alias /home/ec2-user/reloved/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF

sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m admin@reloved.digital --redirect 2>&1 || true

curl -s "https://${DOMAIN}/api/health" || curl -s "http://${DOMAIN}/api/health"
echo SSLIP_OK
