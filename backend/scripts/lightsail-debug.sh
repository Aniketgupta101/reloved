#!/bin/bash
set -euo pipefail
cd /tmp

sudo -u postgres psql -c "SHOW password_encryption;"
sudo -u postgres psql -c "SELECT rolname FROM pg_authid WHERE rolname='reloved';"

PGPASS="RelovedProd2026!"
sudo -u postgres psql -c "ALTER USER reloved WITH PASSWORD '${PGPASS}';"

# try md5 in hba
HBA="/var/lib/pgsql/data/pg_hba.conf"
sudo sed -i 's/scram-sha-256/md5/g' "$HBA"
sudo systemctl restart postgresql
sleep 2

export PGPASSWORD="$PGPASS"
psql -h 127.0.0.1 -U reloved -d reloved -c 'SELECT 1 AS ok;'

sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://reloved:${PGPASS}@localhost:5432/reloved\"|" /home/ec2-user/reloved/backend/.env

cd /home/ec2-user/reloved/backend
npx prisma migrate deploy
echo DONE
