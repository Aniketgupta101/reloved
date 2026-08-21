# Build from the REPO ROOT, not from backend/ — this needs the sibling
# ../shared folder in its build context (shared/schemas.ts, imported by the
# API routes). e.g. from repo root:
#   docker build -f backend/Dockerfile -t reloved-backend .
# or:
#   gcloud builds submit --tag gcr.io/PROJECT_ID/reloved-backend -f backend/Dockerfile .

FROM node:22-slim AS builder
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY shared ../shared
COPY backend/prisma ./prisma
COPY backend/server ./server
COPY backend/tsconfig.json ./

RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
