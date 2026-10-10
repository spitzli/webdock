FROM node:24-bookworm-slim
WORKDIR /app
COPY dist/main.cjs /app/main.cjs
USER 65532:65532
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3137
EXPOSE 3137
CMD ["node", "/app/main.cjs"]
