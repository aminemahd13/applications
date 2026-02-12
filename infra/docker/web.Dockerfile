FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests first for caching
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/schemas/package.json ./packages/schemas/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client (needed for types if web uses it directly or via shared)
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

# Build Web
# Next.js standalone build requires env vars present at build time for static generation
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ROOT_DOMAIN
ARG NEXT_PUBLIC_ROUTING_MODE
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_ROOT_DOMAIN=${NEXT_PUBLIC_ROOT_DOMAIN}
ENV NEXT_PUBLIC_ROUTING_MODE=${NEXT_PUBLIC_ROUTING_MODE}

RUN npm run build -w apps/web

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Copy necessary files for standalone mode
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

# server.js is at root of standalone output, but inside apps/web folder structure
CMD ["node", "apps/web/server.js"]
