FROM node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fontconfig openssl \
  && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

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
RUN cd packages/db && npm run build
RUN cd packages/shared && npm run build
RUN cd packages/schemas && npm run build

# Build API
RUN cd apps/api && npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/scripts ./apps/api/scripts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/schemas ./packages/schemas

RUN npx playwright install --with-deps chromium
RUN sed -i 's/\r$//' ./apps/api/scripts/start-api.sh && chmod +x ./apps/api/scripts/start-api.sh

# Fail the image build early if runtime module resolution is broken
RUN node -e "const { createRequire } = require('module'); const r = createRequire('/app/apps/api/dist/main.js'); ['connect-redis','express','zod','@event-platform/db','@event-platform/shared','@event-platform/schemas','playwright'].forEach((m)=>r.resolve(m)); console.log('api runtime deps ok')"

USER nestjs

EXPOSE 3000

ENV PORT=3000

CMD ["sh", "./apps/api/scripts/start-api.sh"]
