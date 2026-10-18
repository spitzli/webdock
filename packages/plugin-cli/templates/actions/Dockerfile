FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY vendor ./vendor
RUN npm install --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/vendor ./vendor
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3443
CMD ["node", "dist/index.js"]
