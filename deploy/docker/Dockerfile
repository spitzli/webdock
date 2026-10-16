# Build from the repository root. No .env files or provider credentials are build inputs.
FROM node:24.15.0-bookworm-slim AS dependencies
WORKDIR /app
COPY . .
RUN npm ci --no-audit --no-fund

FROM dependencies AS api-build
RUN npm run build -w @webdock/api

FROM oven/bun:1.4.3 AS api
WORKDIR /app
# FSR and workspace exports load source at runtime; preserve workspace paths.
COPY --from=api-build --chown=bun:bun /app /app
ENV NODE_ENV=production BIND_ADDRESS=0.0.0.0 PORT=3130
USER bun
WORKDIR /app/apps/control-plane
EXPOSE 3130
CMD ["bun", "dist/index.ts"]

FROM api AS worker
CMD ["bun", "dist/worker.ts"]

FROM api AS migrate
WORKDIR /app
ENTRYPOINT ["bun", "tools/migrations/install.ts"]
CMD []

FROM dependencies AS console-build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @webdock/admin

FROM node:24.15.0-bookworm-slim AS console
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3120 NEXT_TELEMETRY_DISABLED=1
COPY --from=console-build --chown=node:node /app/apps/console/.next/standalone ./
COPY --from=console-build --chown=node:node /app/apps/console/.next/static ./apps/console/.next/static
COPY --from=console-build --chown=node:node /app/apps/console/public ./apps/console/public
USER node
EXPOSE 3120
CMD ["node", "apps/console/server.js"]

FROM dependencies AS auth-build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @webdock/auth

FROM node:24.15.0-bookworm-slim AS auth
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3125 NEXT_TELEMETRY_DISABLED=1
COPY --from=auth-build --chown=node:node /app/apps/auth/.next/standalone ./
COPY --from=auth-build --chown=node:node /app/apps/auth/.next/static ./apps/auth/.next/static
COPY --from=auth-build --chown=node:node /app/apps/auth/public ./apps/auth/public
USER node
EXPOSE 3125
CMD ["node", "apps/auth/server.js"]
