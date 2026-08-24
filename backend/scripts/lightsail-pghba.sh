#!/bin/bash
set -euo pipefail

HBA="/var/lib/pgsql/data/pg_hba.conf"
sudo cp "$HBA" "${HBA}.bak"

sudo sed -i 's/^host    all             all             127.0.0.1\/32            ident$/host    all             all             127.0.0.1\/32            scram-sha-256/' "$HBA"
sudo sed -i 's/^host    all             all             ::1\/128                 ident$/host    all             all             ::1\/128                 scram-sha-256/' "$HBA"
sudo sed -i 's/^local   all             all                                     peer$/local   all             all                                     scram-sha-256/' "$HBA"

sudo systemctl restart postgresql
sleep 2

cd "$HOME/reloved/backend"
npx prisma migrate deploy
echo PG_HBA_FIX_OK
