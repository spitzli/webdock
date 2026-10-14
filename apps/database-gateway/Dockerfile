# The runtime image is built from vendor/tabularis-web-ui.json's sourceCommit.
ARG TABULARIS_IMAGE=webdock-tabularis:production-fdd6c0a6
FROM node:24-bookworm-slim AS node
FROM ${TABULARIS_IMAGE}
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY dist/main.cjs /app/main.cjs
USER 65532:65532
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3137
EXPOSE 3137
ENTRYPOINT ["node"]
CMD ["/app/main.cjs"]
