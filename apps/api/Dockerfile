# Runtime is pinned; the release pipeline must also record the resolved image digest.
FROM oven/bun:1.4.3 AS runtime
WORKDIR /app
# Build context must be prepared with npm ci + npm run build -w @webdock/api.
# Copy only the API artifact, installed dependencies and workspace packages.
COPY --chown=bun:bun node_modules ./node_modules
COPY --chown=bun:bun packages ./packages
COPY --chown=bun:bun apps/api/node_modules ./apps/api/node_modules
COPY --chown=bun:bun apps/api/package.json ./apps/api/package.json
COPY --chown=bun:bun apps/api/dist ./apps/api/dist
ENV NODE_ENV=production BIND_ADDRESS=0.0.0.0 PORT=3130
USER bun
WORKDIR /app/apps/api
EXPOSE 3130
CMD ["bun", "dist/index.ts"]
