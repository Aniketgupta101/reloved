#!/bin/bash
set -euo pipefail

PGPASS=$(openssl rand -hex 16)

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='reloved'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER reloved WITH PASSWORD '${PGPASS}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='reloved'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE reloved OWNER reloved;"
sudo -u postgres psql -c "ALTER USER reloved WITH PASSWORD '${PGPASS}';"

ENV_FILE="$HOME/reloved/backend/.env"
if [ -f "$ENV_FILE" ]; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://reloved:${PGPASS}@localhost:5432/reloved\"|" "$ENV_FILE"
  sed -i 's|^NODE_ENV=.*|NODE_ENV=production|' "$ENV_FILE"
  sed -i 's|^PORT=.*|PORT=8787|' "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

cd "$HOME/reloved/backend"
export NODE_OPTIONS="--max-old-space-size=768"
npm ci
npm run build
npx prisma migrate deploy
mkdir -p uploads/items

echo SETUP_APP_OK
