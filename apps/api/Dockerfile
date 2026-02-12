FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/schemas/package.json ./packages/schemas/


RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/ ./
COPY . .
RUN mkdir -p apps/api/node_modules

# Generate Prisma Client
RUN cd packages/db && npx prisma generate

# Build workspace packages needed by API at runtime
# (@event-platform/db and @event-platform/shared are imported from apps/api/dist)
RUN cd packages/db && npm run build
RUN cd packages/shared && npm run build
RUN cd packages/schemas && npm run build
# config package might not have a build script, check if needed. Assuming it's just json/ts config.

# Build API
RUN cd apps/api && npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/schemas ./packages/schemas

# Fail the image build early if runtime module resolution is broken
# from the same resolution base as `node apps/api/dist/main`.
RUN node -e "const { createRequire } = require('module'); const r = createRequire('/app/apps/api/dist/main.js'); ['connect-redis','express','zod','@event-platform/db','@event-platform/shared','@event-platform/schemas'].forEach((m)=>r.resolve(m)); console.log('api runtime deps ok')"

USER nestjs

EXPOSE 3000

ENV PORT 3000

CMD ["sh", "-c", "attempt=0; until ./node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma; do attempt=$((attempt+1)); if [ \"$attempt\" -ge 30 ]; then echo \"Prisma migrate failed after 30 attempts\"; exit 1; fi; echo \"Prisma migrate failed, retrying in 5s ($attempt/30)\"; sleep 5; done; exec node apps/api/dist/main"]
