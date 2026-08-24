#!/bin/bash
set -euo pipefail

PGPASS=$(openssl rand -hex 16)
ENV_FILE="$HOME/reloved/backend/.env"

sudo -u postgres psql -c "ALTER USER reloved WITH PASSWORD '${PGPASS}';"

sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://reloved:${PGPASS}@localhost:5432/reloved\"|" "$ENV_FILE"

export PGPASSWORD="$PGPASS"
psql -h localhost -U reloved -d reloved -c 'SELECT 1 AS ok;' 

cd "$HOME/reloved/backend"
npx prisma migrate deploy
echo MIGRATE_OK
