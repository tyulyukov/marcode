FROM oven/bun:1.3.9 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/landing/package.json ./apps/landing/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY scripts/package.json ./scripts/package.json

RUN bun install --frozen-lockfile --ignore-scripts

FROM oven/bun:1.3.9 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY apps/landing ./apps/landing
COPY package.json ./

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN cd apps/landing && bun --bun run build

FROM oven/bun:1.3.9-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/landing/public ./apps/landing/public

RUN mkdir -p apps/landing/.next && chown nextjs:nodejs apps/landing/.next

COPY --from=builder --chown=nextjs:nodejs /app/apps/landing/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/landing/.next/static ./apps/landing/.next/static

USER nextjs

EXPOSE 3000

CMD ["bun", "apps/landing/server.js"]
