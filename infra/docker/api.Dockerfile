FROM node:20-bookworm-slim AS builder

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fontconfig openssl \
  && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy package manifests first for caching
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/schemas/package.json ./packages/schemas/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

# Build API
RUN npm run build -w apps/api

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fontconfig openssl \
  && rm -rf /var/lib/apt/lists/*

# Copy necessary files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/scripts ./apps/api/scripts
COPY --from=builder /app/packages ./packages

RUN npx playwright install --with-deps chromium
RUN sed -i 's/\r$//' ./apps/api/scripts/start-api.sh && chmod +x ./apps/api/scripts/start-api.sh

EXPOSE 3001

CMD ["sh", "./apps/api/scripts/start-api.sh"]
