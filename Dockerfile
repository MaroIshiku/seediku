FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8509 \
    ISHIKU_DATA_DIR=/data \
    ISHIKU_CONFIG_DIR=/config
LABEL org.opencontainers.image.source="https://github.com/MaroIshiku/seediku"
LABEL org.opencontainers.image.description="Seediku Torrentloader"
RUN apk upgrade --no-cache \
    && apk add --no-cache su-exec \
    && addgroup -S -g 10001 seediku \
    && adduser -S -D -H -u 10001 -G seediku seediku \
    && mkdir -p /data /config \
    && chown -R seediku:seediku /app /data /config \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
       /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
       /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=deps --chown=seediku:seediku /app/node_modules ./node_modules
COPY --chown=seediku:seediku app.manifest.json package.json ./
COPY --chown=seediku:seediku src ./src
COPY --chown=seediku:seediku public ./public
COPY docker-entrypoint.sh /usr/local/bin/seediku-entrypoint
RUN chmod 755 /usr/local/bin/seediku-entrypoint
USER root
EXPOSE 8509
VOLUME ["/data", "/config"]
HEALTHCHECK --interval=30s --timeout=5s --retries=5 --start-period=20s CMD wget -qO- http://localhost:8509/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/seediku-entrypoint"]
CMD ["node", "src/server.js"]
