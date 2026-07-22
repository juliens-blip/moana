FROM mcr.microsoft.com/playwright:v1.55.1-noble

LABEL org.opencontainers.image.title="Moana YATCO refresh" \
      org.opencontainers.image.description="Scheduled YATCO BOSS scraping and Supabase synchronization"

WORKDIR /app

COPY ops/yatco-automation/package.json ops/yatco-automation/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY ops/yatco-automation/run-refresh.mjs ./run-refresh.mjs
COPY ops/yatco-automation/check-readiness.mjs ./check-readiness.mjs
COPY ops/yatco-automation/apply-market-review-schema.mjs ./apply-market-review-schema.mjs
COPY ops/yatco-automation/lib/ ./lib/
COPY ops/yatco-automation/scrapers/ ./scripts/
COPY scripts/sync-vessel-visibility-stats.ts ./scripts/
COPY scripts/sync-yatco-stats.ts ./scripts/
COPY scripts/sync-market-review.ts ./scripts/
COPY scripts/sync-market-pulse.ts ./scripts/
COPY scripts/market-review-schema.sql ./sql/

ENV NODE_ENV=production \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    PATH=/app/node_modules/.bin:$PATH

USER 1000:1000

ENTRYPOINT ["node", "/app/run-refresh.mjs"]
