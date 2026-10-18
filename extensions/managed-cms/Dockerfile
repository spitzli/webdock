# Build with the repository root as context. Only the compiled plugin enters the runtime.
FROM oven/bun@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS bun
FROM node:24.21.0-bookworm-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund && npm run build -w @webdock/plugin-sdk && bun extensions/managed-cms/build.ts
FROM bun
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/spitzli/webdock"
COPY --from=build --chown=65532:65532 /app/extensions/managed-cms/dist ./
COPY --from=build /app/LICENSE /app/COMMERCIAL-LICENSING.md /app/NOTICE /usr/share/licenses/webdock/
ENV NODE_ENV=production
USER 65532:65532
EXPOSE 3443 3444
CMD ["bun", "runtime.js"]
