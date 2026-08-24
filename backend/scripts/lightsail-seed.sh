#!/bin/bash
set -euo pipefail
cd /home/ec2-user/reloved/backend
npm run db:seed 2>&1 || npx tsx prisma/seed.ts 2>&1
echo SEED_DONE
