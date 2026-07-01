FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/MaroIshiku/seediku"
LABEL org.opencontainers.image.description="Seediku Torrentloader"
COPY --from=deps /app/node_modules ./node_modules
COPY app.manifest.json package.json ./
COPY src ./src
COPY public ./public
EXPOSE 8509
HEALTHCHECK --interval=30s --timeout=5s --retries=5 --start-period=20s CMD wget -qO- http://localhost:8509/healthz || exit 1
CMD ["node", "src/server.js"]
