#!/bin/bash
set -euo pipefail

PGPASS=$(grep '^DATABASE_URL=' "$HOME/reloved/backend/.env" | sed -n 's/.*reloved:\([^@]*\)@.*/\1/p')

sudo -u postgres psql <<SQL
ALTER USER reloved WITH PASSWORD '${PGPASS}';
GRANT ALL PRIVILEGES ON DATABASE reloved TO reloved;
\c reloved
GRANT ALL ON SCHEMA public TO reloved;
ALTER SCHEMA public OWNER TO reloved;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO reloved;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO reloved;
SQL

cd "$HOME/reloved/backend"
npx prisma migrate deploy
echo PG_FIX_OK
