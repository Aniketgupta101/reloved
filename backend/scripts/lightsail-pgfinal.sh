#!/bin/bash
set -euo pipefail

HBA="/var/lib/pgsql/data/pg_hba.conf"
sudo cp "$HBA" "${HBA}.bak2"

sudo tee "$HBA" > /dev/null <<'EOF'
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             postgres                                peer
local   all             all                                     peer
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
local   replication     all                                     peer
host    replication     all             127.0.0.1/32            scram-sha-256
host    replication     all             ::1/128                 scram-sha-256
EOF

sudo systemctl restart postgresql
sleep 2

PGPASS=$(openssl rand -hex 16)
sudo -u postgres psql -c "ALTER USER reloved WITH PASSWORD '${PGPASS}';"

ENV_FILE="/home/ec2-user/reloved/backend/.env"
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://reloved:${PGPASS}@localhost:5432/reloved\"|" "$ENV_FILE"

export PGPASSWORD="$PGPASS"
psql -h 127.0.0.1 -U reloved -d reloved -c 'SELECT 1 AS ok;'

cd /home/ec2-user/reloved/backend
npx prisma migrate deploy
echo ALL_OK
