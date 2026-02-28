FROM node:20-alpine AS base
WORKDIR /app

# ── Install all deps (needed for build) ─────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ── Build ────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN npm run build

# ── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy built artifacts
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/.next        ./.next
COPY --from=builder /app/next.config.ts ./
COPY package.json ./

# SQLite data directory — owned by app user so writes succeed
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

# Health check — lightweight DB ping endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["npm", "start"]
