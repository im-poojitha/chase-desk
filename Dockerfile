FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV SQLITE_DB_PATH=/data/chase-desk.sqlite

COPY --from=build --chown=node:node /app/server.mjs ./server.mjs
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 8080
CMD ["node", "--experimental-sqlite", "server.mjs", "--production"]
