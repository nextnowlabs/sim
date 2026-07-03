# ========================================
# Base Stage: Alpine Linux with Bun
# ========================================
FROM oven/bun:1.3.13-alpine AS base

ARG APK_MIRROR=mirrors.aliyun.com
RUN sed -i "s/dl-cdn.alpinelinux.org/${APK_MIRROR}/g" /etc/apk/repositories && \
    apk add --no-cache libc6-compat curl

# ========================================
# Pruner Stage: Emit a minimal monorepo subset that @sim/realtime depends on
# ========================================
FROM base AS pruner
WORKDIR /app

ARG NPM_MIRROR=https://registry.npmmirror.com
RUN npm_config_registry=${NPM_MIRROR} bun add -g turbo

COPY . .

RUN turbo prune @sim/realtime --docker

# ========================================
# Dependencies Stage: Install Dependencies
# ========================================
FROM base AS deps
WORKDIR /app

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/bun.lock ./bun.lock

ARG NPM_MIRROR=https://registry.npmmirror.com

RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    npm_config_registry=${NPM_MIRROR} bun install --linker=hoisted --omit=dev --ignore-scripts

# ========================================
# Runner Stage: Run the Socket Server
# ========================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3002 \
    HOSTNAME="0.0.0.0"

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

COPY --from=deps --chown=nextjs:nodejs /app ./
COPY --from=pruner --chown=nextjs:nodejs /app/out/full/ ./

USER nextjs

EXPOSE 3002

CMD ["bun", "apps/realtime/src/bootstrap.ts"]
