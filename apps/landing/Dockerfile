FROM oven/bun:1.3.9-slim AS base

FROM base AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/landing/package.json ./apps/landing/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY scripts/package.json ./scripts/package.json

# --ignore-scripts skips native add-on builds (node-pty in apps/server).
RUN bun install --frozen-lockfile --ignore-scripts

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY apps/landing ./apps/landing
COPY package.json turbo.json ./

RUN cd apps/landing && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/apps/landing/.next/standalone ./
COPY --from=builder /app/apps/landing/.next/static ./apps/landing/.next/static
COPY --from=builder /app/apps/landing/public ./apps/landing/public 2>/dev/null || true

EXPOSE 3000
CMD ["bun", "apps/landing/server.js"]
