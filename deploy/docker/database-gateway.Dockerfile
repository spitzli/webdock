# Root context; use the existing pinned Tabularis runtime, never a browser-supplied image.
ARG TABULARIS_IMAGE=webdock-tabularis:production-fdd6c0a6
FROM node:24.15.0-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci --no-audit --no-fund && npm run build -w @webdock/database-gateway

FROM ${TABULARIS_IMAGE} AS database-gateway
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build /app/apps/database-gateway/dist/main.cjs /app/main.cjs
ARG TABULARIS_SOURCE_COMMIT=fdd6c0a6f979ede0acb38415fa12b25c04aa9c4e
LABEL org.opencontainers.image.source="https://github.com/TabularisDB/tabularis" webdock.dev.tabularis-source=$TABULARIS_SOURCE_COMMIT
USER 65532:65532
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3137 TABULARIS_EXPECTED_COMMIT=$TABULARIS_SOURCE_COMMIT
EXPOSE 3137
ENTRYPOINT ["node"]
CMD ["/app/main.cjs"]
