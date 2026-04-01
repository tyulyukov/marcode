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
COPY --from=deps /app/apps/landing/node_modules ./apps/landing/node_modules
COPY apps/landing ./apps/landing
COPY package.json tsconfig.base.json ./

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN cd apps/landing && ./node_modules/.bin/next build

FROM oven/bun:1.3.9 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder --chown=bun:bun /app/apps/landing/public ./apps/landing/public

RUN mkdir -p apps/landing/.next && chown bun:bun apps/landing/.next

COPY --from=builder --chown=bun:bun /app/apps/landing/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/apps/landing/.next/static ./apps/landing/.next/static

USER bun

EXPOSE 3000

CMD ["bun", "apps/landing/server.js"]
