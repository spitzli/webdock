# Build from the repository root. Payload is deliberately pinned to the installed canary.
FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY LICENSE COMMERCIAL-LICENSING.md NOTICE /usr/share/licenses/webdock/
COPY apps ./apps
COPY packages ./packages
COPY modules ./modules
COPY adapters ./adapters
COPY integrations ./integrations
COPY vendor ./vendor
RUN npm ci --ignore-scripts
RUN npm run build -w @webdock/cms-instance
# Runtime only applies reviewed SQL; migration generation and TS loaders are excluded.
RUN rm -rf /app/apps/cms-instance/.next/standalone/node_modules/drizzle-kit /app/apps/cms-instance/.next/standalone/node_modules/esbuild /app/apps/cms-instance/.next/standalone/node_modules/@esbuild /app/apps/cms-instance/.next/standalone/node_modules/payload/node_modules/esbuild /app/apps/cms-instance/.next/standalone/node_modules/payload/node_modules/@esbuild /app/apps/cms-instance/.next/standalone/node_modules/payload/node_modules/tsx

FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# Standalone carries only the CMS server and traced production dependencies.
COPY --from=build --chown=65532:65532 /app/apps/cms-instance/.next/standalone ./
COPY --from=build --chown=65532:65532 /app/apps/cms-instance/.next/static ./apps/cms-instance/.next/static
COPY --from=build --chown=65532:65532 /app/apps/cms-instance/.next/migrate.mjs ./migrate.mjs
RUN mkdir -p /data/media /data/transfers && chown -R 65532:65532 /data
COPY --from=build /usr/share/licenses/webdock/ /usr/share/licenses/webdock/
USER 65532:65532
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD ["node","-e","fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node","apps/cms-instance/server.js"]
