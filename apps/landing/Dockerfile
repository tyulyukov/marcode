FROM oven/bun:1.3.9-slim AS base

FROM base AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/landing/package.json ./apps/landing/package.json

# Stub every other workspace package.json so the lockfile resolves.
# --ignore-scripts avoids building native add-ons (node-pty in apps/server).
RUN mkdir -p apps/server apps/web apps/desktop packages/contracts packages/shared scripts \
    && echo '{"name":"marcode","private":true}' > apps/server/package.json \
    && echo '{"name":"@marcode/web","private":true}' > apps/web/package.json \
    && echo '{"name":"@marcode/desktop","private":true}' > apps/desktop/package.json \
    && echo '{"name":"@marcode/contracts","private":true}' > packages/contracts/package.json \
    && echo '{"name":"@marcode/shared","private":true}' > packages/shared/package.json \
    && echo '{"name":"@marcode/scripts","private":true}' > scripts/package.json \
    && bun install --frozen-lockfile --ignore-scripts

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
