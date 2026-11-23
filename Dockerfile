# syntax=docker/dockerfile:1
FROM node:24.22.3-bookworm-slim AS build
WORKDIR /srv/fuel-feet
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=secret,id=npm_ca \
    if [ -s /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci
COPY tsconfig.base.json ./
COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/
RUN npm run build:shared && npm run build -w @fuel-feet/api

FROM node:24.22.3-bookworm-slim
ENV NODE_ENV=production
WORKDIR /srv/fuel-feet
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/api/package.json apps/api/package.json
COPY --chown=node:node packages/shared/package.json packages/shared/package.json
RUN --mount=type=secret,id=npm_ca \
    if [ -s /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --omit=dev -w @fuel-feet/api -w @fuel-feet/shared --include-workspace-root=false
COPY --from=build --chown=node:node /srv/fuel-feet/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /srv/fuel-feet/packages/shared/dist packages/shared/dist
USER node
EXPOSE 4000
WORKDIR /srv/fuel-feet/apps/api
CMD ["node", "--enable-source-maps", "dist/server.js"]
