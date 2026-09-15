#!/bin/bash
set -e
TS=$(date +%s)
sudo cp /etc/nginx/conf.d/relovedapi.conf /etc/nginx/conf.d/relovedapi.conf.bak.$TS
sudo tee /etc/nginx/conf.d/relovedapi.conf > /dev/null <<'NGINX'
server {
    listen 80;
    server_name relovedapi.reloved.digital 13.235.8.13 13-235-8-13.sslip.io 43-205-146-110.sslip.io 3-110-214-193.sslip.io;

    client_max_body_size 25M;

    location /uploads/ {
        alias /home/ec2-user/reloved/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
    }

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
    }
}
NGINX

sudo cp /etc/nginx/conf.d/waitlist.conf /etc/nginx/conf.d/waitlist.conf.bak.$TS
sudo tee /etc/nginx/conf.d/waitlist.conf > /dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name reloved.digital www.reloved.digital _;
    root /var/www/waitlist;
    index index.html;

    client_max_body_size 25M;

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
    }

    location /uploads/ {
        alias /home/ec2-user/reloved/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

sudo nginx -t
sudo systemctl reload nginx
echo "nginx ok"
curl -s -m 5 http://127.0.0.1/api/health
echo
