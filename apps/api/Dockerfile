FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/schemas/package.json ./packages/schemas/


RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN cd packages/db && npx prisma generate

# Build shared packages
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
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
# Copy shared packages if they are needed at runtime (e.g. for peer deps or if not bundled)
# Since we are using a monorepo, node_modules at root should cover it if hoisted.
# However, NestJS build usually bundles everything in dist/main.js except node_modules.

USER nestjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "apps/api/dist/main"]
